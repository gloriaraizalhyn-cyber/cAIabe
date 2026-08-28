import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";

const STALE_AFTER_MS = 60000;
const PRUNE_INTERVAL_MS = 15000;

// Like useLiveDriverPosition, but tracks EVERY driver broadcasting on the
// route's `route:{routeId}:driving` channel (keyed by driver_id) instead of
// just the most recent one — so a passenger waiting for a route sees every
// jeepney currently passing it, not only whichever one broadcast last.
// Entries are dropped if a driver hasn't broadcast in over a minute (no
// explicit "driver left" event exists on this channel to key off instead).
export function useLiveDriverPositions(routeId) {
  const [positionsByDriver, setPositionsByDriver] = useState({});
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    setPositionsByDriver({});
    setIsConnected(false);
    if (!routeId) return undefined;

    // Immediately fetch currently active drivers for this route from database
    supabase
      .from("driver_live_state")
      .select("driver_id, route_id, position, capacity_state, last_updated")
      .eq("route_id", routeId)
      .then(({ data, error }) => {
        if (!error && data) {
          const initial = {};
          data.forEach((row) => {
            const match = row.position?.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
            if (match) {
              const lng = parseFloat(match[1]);
              const lat = parseFloat(match[2]);
              initial[row.driver_id] = {
                lat,
                lng,
                capacityState: row.capacity_state ?? "available",
                updatedAt: new Date(row.last_updated).getTime(),
              };
            }
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
