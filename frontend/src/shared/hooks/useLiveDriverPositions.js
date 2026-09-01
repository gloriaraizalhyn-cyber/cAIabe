import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";

const STALE_AFTER_MS = 60000;
const PRUNE_INTERVAL_MS = 15000;

// Like useLiveDriverPosition, but tracks EVERY driver broadcasting on the
// route's `route:{routeId}:driving` channel (keyed by driver_id) instead of
// just the most recent one — so a passenger waiting for a route sees every
// jeepney currently passing it, not only whichever one broadcast last.
// Entries are dropped if a driver hasn't broadcast in over a minute (no
// explicit "driver left" event exists on this channel to key off instead),
// or immediately on a "driver_hidden" broadcast (see driver-location-update).
//
// Only ever shows drivers who are "next_to_go" or "driving" — a parked/
// queued/temporarily-away driver must stay invisible to passengers per the
// product spec. get_route_visible_drivers (add_route_visible_drivers_rpc.sql)
// enforces this for the initial fetch; driver-location-update enforces the
// same rule for what it broadcasts, so the realtime stream never contains a
// driver this hook shouldn't be showing in the first place.
export function useLiveDriverPositions(routeId) {
  const [positionsByDriver, setPositionsByDriver] = useState({});
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    setPositionsByDriver({});
    setIsConnected(false);
    if (!routeId) return undefined;

    // Immediately fetch currently visible drivers for this route.
    supabase
      .rpc("get_route_visible_drivers", { p_route_id: routeId })
      .then(({ data, error }) => {
        if (!error && data) {
          const initial = {};
          data.forEach((row) => {
            initial[row.driver_id] = {
              lat: row.lat,
              lng: row.lng,
              capacityState: row.capacity_state ?? "available",
              updatedAt: Date.now(),
            };
          });
          if (Object.keys(initial).length > 0) {
            setPositionsByDriver((previous) => ({ ...initial, ...previous }));
          }
        }
      });

    const channel = supabase
      .channel(`route:${routeId}:driving`)
      .on("broadcast", { event: "position_updated" }, ({ payload }) => {
        setPositionsByDriver((previous) => ({
          ...previous,
          [payload.driver_id]: {
            ...previous[payload.driver_id],
            lat: payload.lat,
            lng: payload.lng,
            capacityState: payload.capacity_state ?? previous[payload.driver_id]?.capacityState ?? "available",
            updatedAt: Date.now(),
          },
        }));
      })
      .on("broadcast", { event: "capacity_changed" }, ({ payload }) => {
        setPositionsByDriver((previous) =>
          previous[payload.driver_id]
            ? { ...previous, [payload.driver_id]: { ...previous[payload.driver_id], capacityState: payload.state } }
            : previous
        );
      })
      .on("broadcast", { event: "driver_hidden" }, ({ payload }) => {
        setPositionsByDriver((previous) => {
          if (!(payload.driver_id in previous)) return previous;
          const next = { ...previous };
          delete next[payload.driver_id];
          return next;
        });
      })
      .subscribe((status) => setIsConnected(status === "SUBSCRIBED"));

    const pruneStale = setInterval(() => {
      const cutoff = Date.now() - STALE_AFTER_MS;
      setPositionsByDriver((previous) => {
        const next = {};
        for (const [driverId, position] of Object.entries(previous)) {
          if (position.updatedAt >= cutoff) next[driverId] = position;
        }
        return next;
      });
    }, PRUNE_INTERVAL_MS);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pruneStale);
    };
  }, [routeId]);

  const jeepneys = Object.entries(positionsByDriver).map(([driverId, position]) => ({
    id: driverId,
    ...position,
  }));

  return { jeepneys, isConnected };
}
