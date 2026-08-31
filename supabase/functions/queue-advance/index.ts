// POST /functions/v1/queue-advance
// Not called by drivers directly — meant to run on a schedule (every ~15s)
// via pg_cron + pg_net, or manually in Postman while you're testing.
//
// Per route, this function:
//  0. Force-closes any entry abandoned for STALE_ENTRY_HOURS+ (app closed
//     mid-queue, or never returned from "leave temporarily").
//  1. Soft-skips any notified driver who blew past the response timeout —
//     moves them to the back of the queue rather than removing them.
//  2. Promotes every "next_to_go" entry confirmed inside the terminal
//     geofence (see driver-location-update) to "driving" — multiple
//     jeepneys run a route concurrently in real life, so dispatch is never
//     gated on anyone else already driving; a driver who hasn't physically
//     returned yet only holds up their own promotion, not the drivers
//     behind them.
//  3. Notifies the driver within QUEUE_TURN_ALERT_POSITIONS turns of being
//     up (push via FCM) if not already notified — this is what triggers the
//     frontend's "lining up / skip me" prompt.

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { sendPushToToken } from "../_shared/fcm.ts";

const QUEUE_TURN_ALERT_POSITIONS = 3; // triggers the geofence-aware "lining up / skip me" prompt
const RESPONSE_TIMEOUT_SECONDS = 90;
const STALE_ENTRY_HOURS = 12; // force-closes abandoned entries (app closed mid-queue, never returned from "leave temporarily")

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
  // 0. Force-close entries abandoned for way too long — a driver who closed
  // the app mid-queue, or who left temporarily and never actually came
  // back, would otherwise block their own future re-joins forever (see
  // driver-queue-join's duplicate-active-entry check).
  const staleCutoff = new Date(
    Date.now() - STALE_ENTRY_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: stale } = await supabase
    .from("queue_entries")
    .select("id")
    .eq("route_id", routeId)
    .in("status", ["waiting", "next_to_go", "temporarily_away"])
    .lt("created_at", staleCutoff);

  for (const entry of stale ?? []) {
    await supabase
      .from("queue_entries")
      .update({ status: "done_for_day" })
      .eq("id", entry.id);
  }

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

  // 2. Promote every next_to_go entry confirmed inside the terminal geofence
  // to driving. Not gated on anyone else already driving — multiple
  // jeepneys are on the road at once in real life. A driver still outside
  // simply doesn't get promoted this tick (holds up only themself, not
  // anyone behind them); they'll pick up on the next tick once they return.
  const { data: readyToGo } = await supabase
    .from("queue_entries")
    .select("id, driver_id")
    .eq("route_id", routeId)
    .eq("status", "next_to_go")
    .eq("geofence_status", "inside")
    .order("arrival_at", { ascending: true });

  for (const entry of readyToGo ?? []) {
    await supabase
      .from("queue_entries")
      .update({ status: "driving" })
      .eq("id", entry.id);

    await supabase.channel(`route:${routeId}:queue`).send({
      type: "broadcast",
      event: "driver_departed",
      payload: { queue_entry_id: entry.id },
    });
  }

  // 3. Notify every "waiting" driver within QUEUE_TURN_ALERT_POSITIONS of the
  // front of the active line — waiting + next_to_go together, ordered by
  // arrival_at, the same ordering the frontend shows as queue position.
  // next_to_go entries occupy a position in that count (so a waiting
  // driver's threshold reflects who's genuinely ahead of them) but don't
  // need the prompt themselves — they've already responded.
  const { data: activeQueue } = await supabase
    .from("queue_entries")
    .select("id, driver_id, status, notified_at")
    .eq("route_id", routeId)
    .in("status", ["waiting", "next_to_go"])
    .order("arrival_at", { ascending: true });

  for (const [index, entry] of (activeQueue ?? []).entries()) {
    if (entry.status !== "waiting") continue;
    if (entry.notified_at) continue;
    const position = index + 1; // 1-indexed, matches the frontend's own position count
    if (position > QUEUE_TURN_ALERT_POSITIONS) break; // list is arrival-ordered, so nobody after this is closer

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

const NOTIFICATION_TITLE = "Your turn is coming up";
const NOTIFICATION_BODY = "Head back to your vehicle — your turn is coming up soon.";

async function sendPushToDriver(supabase: any, driverId: string) {
  const { data: driver } = await supabase
    .from("drivers")
    .select("fcm_token")
    .eq("id", driverId)
    .maybeSingle();

  if (!driver?.fcm_token) return;

  try {
    await sendPushToToken(driver.fcm_token, {
      title: NOTIFICATION_TITLE,
      body: NOTIFICATION_BODY,
    });
  } catch (err) {
    // A push failure shouldn't fail the whole queue-advance run — the
    // driver_notified broadcast already got sent, and the frontend's own
    // poll is a fallback for exactly this kind of miss.
    console.error("sendPushToDriver (FCM) failed:", err);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
