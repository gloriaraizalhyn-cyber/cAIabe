// POST /functions/v1/driver-queue-respond
// Auth: required (driver JWT)
// Body: { response: "lining_up" | "skip_done" | "skip_temp" }

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAuthedDriverId, getServiceClient } from "../_shared/client.ts";

type ResponseType = "lining_up" | "skip_done" | "skip_temp";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const driverId = await getAuthedDriverId(req.headers.get("Authorization"));
    if (!driverId) return json({ error: "not authenticated" }, 401);

    const { response } = await req.json() as { response: ResponseType };
    if (!["lining_up", "skip_done", "skip_temp"].includes(response)) {
      return json({ error: "invalid response value" }, 400);
    }

    const supabase = getServiceClient();

    const { data: entry, error: entryErr } = await supabase
      .from("queue_entries")
      .select("id, route_id, status")
      .eq("driver_id", driverId)
      .in("status", ["waiting", "next_to_go", "temporarily_away"])
      .maybeSingle();

    if (entryErr || !entry) {
      return json({ error: "no active queue entry awaiting a response" }, 404);
    }

    // A driver who already left temporarily can only end their day outright
    // from here — "lining up"/"skip_temp" stay scoped to waiting/next_to_go
    // so nobody can reclaim their old arrival_at without physically
    // returning (see driver-location-update, which handles that return).
    if (response !== "skip_done" && entry.status === "temporarily_away") {
      return json({ error: "cannot respond this way while temporarily away" }, 409);
    }

    let update: Record<string, unknown> = { responded_at: new Date().toISOString() };

    if (response === "lining_up") {
      update.status = "next_to_go";
    } else if (response === "skip_done") {
      update.status = "done_for_day";
    } else if (response === "skip_temp") {
      // Forfeits the currently-held position without resetting arrival_at
      // yet — the driver keeps their record but drops out of FIFO/notify/
      // promote consideration until driver-location-update detects them
      // physically back inside the terminal geofence, at which point they
      // rejoin at the back of the active queue with a fresh arrival_at.
      update.status = "temporarily_away";
      update.notified_at = null;
    }

    const { data, error } = await supabase
      .from("queue_entries")
      .update(update)
      .eq("id", entry.id)
      .select()
      .single();

    if (error) return json({ error: error.message }, 500);

    await supabase.channel(`route:${entry.route_id}:queue`).send({
      type: "broadcast",
      event: "queue_updated",
      payload: { queue_entry: data },
    });

    return json({ queue_entry: data });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
