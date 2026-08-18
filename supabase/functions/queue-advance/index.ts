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

  if (!driving) {
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
    }
  }

  // 3. Notify the driver sitting in "next-2" position among waiting entries.
  const { data: waitingQueue } = await supabase
    .from("queue_entries")
    .select("id, driver_id, notified_at")
    .eq("route_id", routeId)
    .eq("status", "waiting")
    .order("arrival_at", { ascending: true });

  const target = (waitingQueue ?? [])[NOTIFY_AHEAD_POSITIONS - 1];
  if (target && !target.notified_at) {
    await supabase
      .from("queue_entries")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", target.id);

    await sendPushToDriver(supabase, target.driver_id);
  }

  return { checked: true };
}

async function sendPushToDriver(supabase: any, driverId: string) {
  // Look up the driver's FCM token (assumes a `fcm_token` column added to
  // `drivers`, or a separate `driver_devices` table — add per your schema).
  const { data: driver } = await supabase
    .from("drivers")
    .select("fcm_token")
    .eq("id", driverId)
    .maybeSingle();

  if (!driver?.fcm_token) return;

  const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY");
  if (!FCM_SERVER_KEY) return; // no-op until FCM is wired up

  await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: `key=${FCM_SERVER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: driver.fcm_token,
      notification: {
        title: "Your turn is coming up",
        body: "Head back to your vehicle — you're next-2 in the queue.",
      },
    }),
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
