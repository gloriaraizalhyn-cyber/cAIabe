import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";

// Subscribes to the real `route:{routeId}:driving` broadcast channel that
// driver-location-update / driver-capacity-toggle already publish to (see
// supabase/functions/driver-location-update, driver-capacity-toggle). No
// historical position is available — this only reflects updates broadcast
// while subscribed, so `position` starts null until the driver's next move.
export function useLiveDriverPosition(routeId) {
  const [position, setPosition] = useState(null);
  const [capacityState, setCapacityState] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    setPosition(null);
    setCapacityState(null);
    setIsConnected(false);
    if (!routeId) return undefined;

    const channel = supabase
      .channel(`route:${routeId}:driving`)
      .on("broadcast", { event: "position_updated" }, ({ payload }) => {
        setPosition({ lat: payload.lat, lng: payload.lng });
      })
      .on("broadcast", { event: "capacity_changed" }, ({ payload }) => {
        setCapacityState(payload.state);
      })
      .subscribe((status) => setIsConnected(status === "SUBSCRIBED"));

    return () => supabase.removeChannel(channel);
  }, [routeId]);

  return { position, capacityState, isConnected };
}
