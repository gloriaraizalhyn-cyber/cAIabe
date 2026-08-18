// POST /functions/v1/driver-capacity-toggle
// Auth: required (driver JWT)
// Body: { state: "full" | "available" }

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAuthedDriverId, getServiceClient } from "../_shared/client.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const driverId = await getAuthedDriverId(req.headers.get("Authorization"));
    if (!driverId) return json({ error: "not authenticated" }, 401);

    const { state } = await req.json() as { state: "full" | "available" };
    if (!["full", "available"].includes(state)) {
      return json({ error: "state must be 'full' or 'available'" }, 400);
    }

    const supabase = getServiceClient();

    const { data: driver } = await supabase
      .from("drivers")
      .select("route_id")
      .eq("id", driverId)
      .single();

    const { data, error } = await supabase
      .from("driver_live_state")
      .upsert(
        {
          driver_id: driverId,
          route_id: driver?.route_id,
          capacity_state: state,
          last_updated: new Date().toISOString(),
        },
        { onConflict: "driver_id" },
      )
      .select()
      .single();

    if (error) return json({ error: error.message }, 500);

    await supabase.channel(`route:${driver?.route_id}:driving`).send({
      type: "broadcast",
      event: "capacity_changed",
      payload: { driver_id: driverId, state },
    });

    return json({ live_state: data });
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
