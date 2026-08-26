// POST /functions/v1/queue-advance
// Not called by drivers directly — meant to run on a schedule (every ~15s)
// via pg_cron + pg_net, or manually in Postman while you're testing.
//
// Per route, this function:
//  1. Promotes the earliest "next_to_go" entry to "driving" if no one is
//     currently driving that route.
//  2. Notifies the driver in the next-2 "waiting" position (push via FCM)
//     if not already notified.
//  3. Soft-skips any notified driver who blew past the response timeout —
//     moves them to the back of the queue rather than removing them.
//
// Simplification note: this treats "driving" as exclusive per route (one
// driver driving at a time from the queue's perspective of dispatch), which
// matches a single-file terminal queue. Adjust if your terminal dispatches
// multiple vehicles concurrently per route.

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { sendPushToToken } from "../_shared/fcm.ts";

const NOTIFY_AHEAD_POSITIONS = 2; // "next-2" per the PRD default
const RESPONSE_TIMEOUT_SECONDS = 90;

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const supabase = getServiceClient();

    const { data: routes, error: routesErr } = await supabase
      .from("routes")
      .select("id");
    if (routesErr) return json({ error: routesErr.message }, 500);

    const results: Record<string, unknown> = {};

    for (const route of routes ?? []) {
      results[route.id] = await advanceRoute(supabase, route.id);
    }

    return json({ results });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

async function advanceRoute(supabase: any, routeId: string) {
  // 1. Soft-skip anyone notified past the timeout with no response.
  const timeoutCutoff = new Date(
    Date.now() - RESPONSE_TIMEOUT_SECONDS * 1000,
  ).toISOString();

  const { data: overdue } = await supabase
    .from("queue_entries")
    .select("id")
    .eq("route_id", routeId)
    .eq("status", "waiting")
    .lt("notified_at", timeoutCutoff)
    .is("responded_at", null);

  for (const entry of overdue ?? []) {
    await supabase
      .from("queue_entries")
      .update({
        arrival_at: new Date().toISOString(), // sent to back of queue
        notified_at: null,
      })
      .eq("id", entry.id);
  }

  // 2. If no one is currently driving, promote earliest next_to_go.
  const { data: driving } = await supabase
    .from("queue_entries")
    .select("id")
    .eq("route_id", routeId)
    .eq("status", "driving")
    .maybeSingle();

  let isDriving = Boolean(driving);

  if (!isDriving) {
    const { data: nextUp } = await supabase
      .from("queue_entries")
      .select("id, driver_id")
      .eq("route_id", routeId)
      .eq("status", "next_to_go")
      .order("arrival_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextUp) {
      await supabase
        .from("queue_entries")
        .update({ status: "driving" })
        .eq("id", nextUp.id);

      await supabase.channel(`route:${routeId}:queue`).send({
        type: "broadcast",
        event: "driver_departed",
        payload: { queue_entry_id: nextUp.id },
      });

      isDriving = true;
    }
  }

  // 3. Notify every "waiting" driver within NOTIFY_AHEAD_POSITIONS turns of
  // being up. "Turns ahead" of a given waiting entry counts the
  // currently-driving unit (if any), every already-confirmed "next_to_go"
  // driver, and earlier entries in the waiting line itself — NOT just a
  // fixed 2nd-in-line index. That distinction matters for the very first
  // driver to join an otherwise empty queue: with a fixed index they'd have
  // nobody ahead of them and would never be notified at all; counted this
  // way they have 0 turns ahead and are notified immediately.
  const { data: waitingQueue } = await supabase
    .from("queue_entries")
    .select("id, driver_id, notified_at")
    .eq("route_id", routeId)
    .eq("status", "waiting")
    .order("arrival_at", { ascending: true });

  const { data: nextToGoEntries } = await supabase
    .from("queue_entries")
    .select("id")
    .eq("route_id", routeId)
    .eq("status", "next_to_go");

  const turnsAheadBase = (isDriving ? 1 : 0) + (nextToGoEntries?.length ?? 0);

  for (const [index, entry] of (waitingQueue ?? []).entries()) {
    if (entry.notified_at) continue;
    const turnsRemaining = turnsAheadBase + index + 1;
    if (turnsRemaining > NOTIFY_AHEAD_POSITIONS) break; // list is arrival-ordered, so nobody after this is closer

    await supabase
      .from("queue_entries")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", entry.id);

    // Realtime companion to the FCM push below — lets the frontend show the
    // "lining up / skip me" prompt immediately instead of waiting on its
    // fallback poll.
    await supabase.channel(`route:${routeId}:queue`).send({
      type: "broadcast",
      event: "driver_notified",
      payload: { queue_entry_id: entry.id, driver_id: entry.driver_id },
    });

    await sendPushToDriver(supabase, entry.driver_id);
  }

  return { checked: true };
}

async function sendPushToDriver(supabase: any, driverId: string) {
  const { data: driver } = await supabase
    .from("drivers")
    .select("fcm_token")
    .eq("id", driverId)
    .maybeSingle();

  if (!driver?.fcm_token) return;

  try {
    await sendPushToToken(driver.fcm_token, {
      title: "Your turn is coming up",
      body: "Head back to your vehicle — you're next-2 in the queue.",
    });
  } catch (err) {
    // A push failure shouldn't fail the whole queue-advance run — the
    // driver_notified broadcast already got sent, and the frontend's own
    // poll is a fallback for exactly this kind of miss.
    console.error("sendPushToDriver failed:", err);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
