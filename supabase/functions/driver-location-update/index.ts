// POST /functions/v1/driver-location-update
// Auth: required (driver JWT)
// Body: { lat: number, lng: number }
// Updates live position, checks whether the driver has reached their
// route's terminus (via the is_near_terminus RPC — see rpc_functions.sql,
// flips them back to "waiting" at the back of the queue if so), and
// broadcasts the new position ONLY when the driver's queue status makes
// them visible to passengers ("next_to_go" or "driving" — see the product
// spec: parked/queued/temporarily-away drivers must never appear on a
// passenger's live map). This mirrors get_route_visible_drivers
// (add_route_visible_drivers_rpc.sql), which is what the initial map fetch
// and nearby-jeepney-eta use — both must agree on the same visibility rule.

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

    // Single lookup of the driver's current active queue entry — covers
    // both the end-of-route check and the terminal-geofence tracking below
    // (previously two separate, overlapping queries).
    const { data: queueEntry } = await supabase
      .from("queue_entries")
      .select("id, terminal_id, status, geofence_status")
      .eq("driver_id", driverId)
      .in("status", ["waiting", "next_to_go", "driving", "temporarily_away"])
      .maybeSingle();

    let currentStatus: string | null = queueEntry?.status ?? null;
    let endOfRoute = false;

    // Geofence check against the route's terminus (PostGIS RPC — see
    // rpc_functions.sql for the SQL side of this) — only meaningful while
    // actually driving.
    if (queueEntry && queueEntry.status === "driving") {
      const { data: isNear, error: rpcErr } = await supabase.rpc(
        "is_near_terminus",
        {
          p_route_id: driver.route_id,
          p_lat: lat,
          p_lng: lng,
          p_radius_meters: END_OF_ROUTE_RADIUS_METERS,
        },
      );

      if (!rpcErr && isNear) {
        endOfRoute = true;
        currentStatus = "waiting";

        await supabase
          .from("queue_entries")
          .update({
            status: "waiting",
            arrival_at: new Date().toISOString(),
            notified_at: null,
            responded_at: null,
          })
          .eq("id", queueEntry.id);
      }
    }

    // Terminal-geofence tracking for queued drivers — independent of the
    // terminus check above, and only relevant while a driver holds a queue
    // slot they haven't been dispatched from yet (including a driver who
    // just requeued above). Hysteresis (two separate radii) keeps GPS
    // jitter near the boundary from flapping the status.
    let geofenceStatus: "inside" | "outside" | null = null;

    if (queueEntry && currentStatus !== "driving") {
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
            currentStatus = "waiting";
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

    // Passenger visibility: per the product spec, only "next_to_go" or
    // "driving" jeepneys may ever appear on a passenger's live map — a
    // parked/queued/temporarily-away driver must stay hidden. Broadcasting
    // is the ONLY thing gated here (driver_live_state itself is always kept
    // current above, for internal/admin use) — get_route_visible_drivers
    // applies this same rule to the initial map fetch and ETA lookups, so
    // both paths agree. When a driver just stopped being visible this tick
    // (e.g. completed their route and requeued as "waiting" above), tell
    // already-subscribed clients to drop the pin immediately instead of
    // waiting on the 60s stale-prune in useLiveDriverPositions.
    const isVisibleToPassengers = currentStatus === "next_to_go" || currentStatus === "driving";
    if (isVisibleToPassengers) {
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
    } else if (endOfRoute) {
      await supabase.channel(`route:${driver.route_id}:driving`).send({
        type: "broadcast",
        event: "driver_hidden",
        payload: { driver_id: driverId },
      });
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
