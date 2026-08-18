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
      .in("status", ["waiting", "next_to_go"])
      .maybeSingle();

    if (entryErr || !entry) {
      return json({ error: "no active queue entry awaiting a response" }, 404);
    }

    let update: Record<string, unknown> = { responded_at: new Date().toISOString() };

    if (response === "lining_up") {
      update.status = "next_to_go";
    } else if (response === "skip_done") {
      update.status = "done_for_day";
    } else if (response === "skip_temp") {
      // Drops to the back of that day's queue — does NOT hold the spot.
      update.status = "waiting";
      update.arrival_at = new Date().toISOString();
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
