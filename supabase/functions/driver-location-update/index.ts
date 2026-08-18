// POST /functions/v1/driver-location-update
// Auth: required (driver JWT)
// Body: { lat: number, lng: number }
// Updates live position, broadcasts it, and checks whether the driver has
// reached their route's terminus (via the is_near_terminus RPC — see
// rpc_functions.sql). If so, flips them back to "waiting" at the back of
// the queue, matching "reaches end of route -> rejoins back of queue".

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAuthedDriverId, getServiceClient } from "../_shared/client.ts";

const END_OF_ROUTE_RADIUS_METERS = 100;

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const driverId = await getAuthedDriverId(req.headers.get("Authorization"));
    if (!driverId) return json({ error: "not authenticated" }, 401);

    const { lat, lng } = await req.json() as { lat: number; lng: number };
    if (lat === undefined || lng === undefined) {
      return json({ error: "lat and lng are required" }, 400);
    }

    const supabase = getServiceClient();

    const { data: driver } = await supabase
      .from("drivers")
      .select("route_id")
      .eq("id", driverId)
      .single();

    if (!driver) return json({ error: "driver not found" }, 404);

    await supabase.from("driver_live_state").upsert(
      {
        driver_id: driverId,
        route_id: driver.route_id,
        position: `SRID=4326;POINT(${lng} ${lat})`,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "driver_id" },
    );

    await supabase.channel(`route:${driver.route_id}:driving`).send({
      type: "broadcast",
      event: "position_updated",
      payload: { driver_id: driverId, lat, lng },
    });

    // Geofence check against the route's terminus (PostGIS RPC — see
    // rpc_functions.sql for the SQL side of this).
    const { data: isNear, error: rpcErr } = await supabase.rpc(
      "is_near_terminus",
      {
        p_route_id: driver.route_id,
        p_lat: lat,
        p_lng: lng,
        p_radius_meters: END_OF_ROUTE_RADIUS_METERS,
      },
    );

    let endOfRoute = false;
    if (!rpcErr && isNear) {
      endOfRoute = true;

      // Find their current queue entry (should be "driving") and requeue.
      const { data: entry } = await supabase
        .from("queue_entries")
        .select("id, terminal_id")
        .eq("driver_id", driverId)
        .eq("status", "driving")
        .maybeSingle();

      if (entry) {
        await supabase
          .from("queue_entries")
          .update({
            status: "waiting",
            arrival_at: new Date().toISOString(),
            notified_at: null,
            responded_at: null,
          })
          .eq("id", entry.id);
      }
    }

    return json({ updated: true, end_of_route: endOfRoute });
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
