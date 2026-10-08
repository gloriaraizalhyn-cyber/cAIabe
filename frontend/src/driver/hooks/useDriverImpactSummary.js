import { useEffect, useState } from "react";
import { supabase } from "../../shared/lib/supabaseClient.js";

// The signed-in driver's own fuel / CO2 totals (today + this week), from the
// get_driver_impact_summary RPC (add_driver_fuel_impact.sql). All figures are
// estimates. Fetches once on mount — the card is shown on the dashboard,
// which remounts after every trip. Screens a driver sits on for a long time
// (the queue, the road) pass `refreshMs` to keep the numbers current.
export function useDriverImpactSummary(isActive = true, { refreshMs = null } = {}) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isActive) return undefined;
    let isMounted = true;

    const load = () => {
      setIsLoading(true);
      supabase.rpc("get_driver_impact_summary").then(({ data, error: rpcError }) => {
        if (!isMounted) return;
        setIsLoading(false);
        if (rpcError) {
          setError(rpcError.message);
          return;
        }
        setError(null);
        setSummary(data);
      });
    };

    load();
    const intervalId = refreshMs ? setInterval(load, refreshMs) : null;
    return () => {
      isMounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [isActive, refreshMs]);

  return { summary, error, isLoading };
}
