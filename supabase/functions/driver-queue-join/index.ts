// POST /functions/v1/driver-queue-join
// Auth: required (driver JWT in Authorization header)
// Body: { terminal_id: string }
// Inserts a queue_entries row. Ordering falls out of arrival_at, so no
// manual "position" field is stored or needed.

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAuthedDriverId, getServiceClient } from "../_shared/client.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const driverId = await getAuthedDriverId(req.headers.get("Authorization"));
    if (!driverId) return json({ error: "not authenticated" }, 401);

    const { terminal_id } = await req.json() as { terminal_id: string };
    if (!terminal_id) return json({ error: "terminal_id is required" }, 400);

    const supabase = getServiceClient();

    const { data: driver, error: driverErr } = await supabase
      .from("drivers")
      .select("route_id, verification_status")
      .eq("id", driverId)
      .single();

    if (driverErr || !driver) return json({ error: "driver not found" }, 404);
    if (driver.verification_status !== "approved") {
      return json({ error: "driver not yet approved" }, 403);
    }

    // Prevent duplicate active entries for the same driver
    const { data: existing } = await supabase
      .from("queue_entries")
      .select("id")
      .eq("driver_id", driverId)
      .in("status", ["waiting", "next_to_go", "driving", "temporarily_away"])
      .maybeSingle();

    if (existing) {
      return json({ error: "driver already has an active queue entry" }, 409);
    }

    const { data, error } = await supabase
      .from("queue_entries")
      .insert({
        driver_id: driverId,
        route_id: driver.route_id,
        terminal_id,
        status: "waiting",
        arrival_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return json({ error: error.message }, 500);

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
