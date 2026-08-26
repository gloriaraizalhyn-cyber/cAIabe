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

    const channel = supabase
      .channel(`route:${routeId}:driving`)
      .on("broadcast", { event: "position_updated" }, ({ payload }) => {
        setPositionsByDriver((previous) => ({
          ...previous,
          [payload.driver_id]: {
            ...previous[payload.driver_id],
            lat: payload.lat,
            lng: payload.lng,
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
