import { useEffect, useState } from "react";
import { supabase } from "../../shared/lib/supabaseClient.js";

// The signed-in driver's own fuel / CO2 totals (today + this week), from the
// get_driver_impact_summary RPC (add_driver_fuel_impact.sql). All figures are
// estimates. Fetches once on mount — the card is shown on the dashboard,
// which remounts after every trip.
export function useDriverImpactSummary(isActive = true) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isActive) return undefined;
    let isMounted = true;
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
    return () => {
      isMounted = false;
    };
  }, [isActive]);

  return { summary, error, isLoading };
}
