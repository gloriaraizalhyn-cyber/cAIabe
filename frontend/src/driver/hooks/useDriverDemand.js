import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../shared/lib/supabaseClient.js";

const POLL_INTERVAL_MS = 12000;
const REALTIME_DEBOUNCE_MS = 1500;

// Drives Sak.AI's driver demand engine (driver-demand-check) — real
// passenger_waiting_state rows on the driver's own route, scored via
// calculateDriverDemand() server-side. Polls periodically while active, and
// additionally triggers an immediate (debounced) recompute whenever a
// passenger_waiting/passenger_cleared broadcast lands on this route's
// waiting channel (the same channel waiting-start/waiting-clear already
// publish to) — so GO/WAIT and CONTINUE/GARAGE react live as demand
// actually changes, not only on the next poll tick.
export function useDriverDemand({ routeId, position, isActive, trendWindowMinutes }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const positionRef = useRef(position);
  positionRef.current = position;

  const refresh = useCallback(async () => {
    const pos = positionRef.current;
    if (!pos) return;
    setIsLoading(true);
    const { data: result, error: fnError } = await supabase.functions.invoke("driver-demand-check", {
      body: {
        lat: pos.lat,
        lng: pos.lng,
        ...(trendWindowMinutes ? { trend_window_minutes: trendWindowMinutes } : {}),
      },
    });
    setIsLoading(false);
    if (fnError) {
      setError(fnError.message ?? String(fnError));
      return;
    }
    setError(null);
    setData(result);
  }, [trendWindowMinutes]);

  useEffect(() => {
    if (!isActive || !position) return undefined;
    refresh();
    const pollId = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(pollId);
    // Only (re)start the interval when active/position-availability flips —
    // refresh() itself always reads the latest position via positionRef, so
    // per-tick GPS jitter shouldn't reset the poll cadence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, Boolean(position), refresh]);

  useEffect(() => {
    if (!isActive || !routeId) return undefined;
    let debounceId = null;
    const trigger = () => {
      clearTimeout(debounceId);
      debounceId = setTimeout(refresh, REALTIME_DEBOUNCE_MS);
    };
    const channel = supabase
      .channel(`route:${routeId}:waiting`)
      .on("broadcast", { event: "passenger_waiting" }, trigger)
      .on("broadcast", { event: "passenger_cleared" }, trigger)
      .subscribe();
    return () => {
      clearTimeout(debounceId);
      supabase.removeChannel(channel);
    };
  }, [isActive, routeId, refresh]);

  return { data, error, isLoading, refresh };
}
