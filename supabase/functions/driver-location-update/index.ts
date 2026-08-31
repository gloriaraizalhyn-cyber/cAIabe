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

    const { lat, lng, capacity_state } = await req.json() as {
      lat: number;
      lng: number;
      capacity_state?: "full" | "available";
    };
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

    const liveUpdate: Record<string, unknown> = {
      driver_id: driverId,
      route_id: driver.route_id,
      position: `SRID=4326;POINT(${lng} ${lat})`,
      last_updated: new Date().toISOString(),
    };
    if (capacity_state && ["full", "available"].includes(capacity_state)) {
      liveUpdate.capacity_state = capacity_state;
    }

    await supabase.from("driver_live_state").upsert(
      liveUpdate,
      { onConflict: "driver_id" },
    );

    await supabase.channel(`route:${driver.route_id}:driving`).send({
      type: "broadcast",
      event: "position_updated",
      payload: {
        driver_id: driverId,
        lat,
        lng,
        ...(capacity_state ? { capacity_state } : {}),
      },
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

    // Terminal-geofence tracking for queued drivers — independent of the
    // terminus check above, and only relevant while a driver holds a queue
    // slot they haven't been dispatched from yet. Hysteresis (two separate
    // radii) keeps GPS jitter near the boundary from flapping the status.
    let geofenceStatus: "inside" | "outside" | null = null;

    const { data: queueEntry } = await supabase
      .from("queue_entries")
      .select("id, terminal_id, status, geofence_status")
      .eq("driver_id", driverId)
      .in("status", ["waiting", "next_to_go", "temporarily_away"])
      .maybeSingle();

    if (queueEntry) {
      const { data: geofenceRows, error: geofenceErr } = await supabase.rpc(
        "get_terminal_geofence",
        { p_terminal_id: queueEntry.terminal_id, p_lat: lat, p_lng: lng },
      );
      const g = geofenceRows?.[0];

      if (!geofenceErr && g) {
        const wasInside = queueEntry.geofence_status === "inside";
        let nowInside = wasInside;
        if (wasInside && g.distance_meters > g.exit_radius_meters) nowInside = false;
        else if (!wasInside && g.distance_meters <= g.enter_radius_meters) nowInside = true;

        geofenceStatus = nowInside ? "inside" : "outside";

        if (nowInside !== wasInside) {
          const now = new Date().toISOString();
          const geofenceUpdate: Record<string, unknown> = {
            geofence_status: geofenceStatus,
            ...(nowInside ? { last_inside_at: now } : { last_outside_at: now }),
          };

          // Physically returning after "Leave temporarily" rejoins at the
          // back of the active queue with a fresh timestamp. Returning from
          // waiting/next_to_go (e.g. after "Lining up") must NOT touch
          // arrival_at — that's the driver's original FIFO position.
          if (nowInside && queueEntry.status === "temporarily_away") {
            geofenceUpdate.status = "waiting";
            geofenceUpdate.arrival_at = now;
            geofenceUpdate.notified_at = null;
            geofenceUpdate.responded_at = null;
          }

          const { data: updatedEntry } = await supabase
            .from("queue_entries")
            .update(geofenceUpdate)
            .eq("id", queueEntry.id)
            .select()
            .single();

          await supabase.channel(`route:${driver.route_id}:queue`).send({
            type: "broadcast",
            event: "queue_updated",
            payload: { queue_entry: updatedEntry },
          });
        }
      }
    }

    return json({ updated: true, end_of_route: endOfRoute, geofence_status: geofenceStatus });
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
