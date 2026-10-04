import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";

// One small JSON aggregate per minute — the totals only move when a rider
// commits to a trip or a driver idles, so polling faster would just be
// egress (see the EGRESS GUARD note in queue_advance_cron.sql).
const POLL_INTERVAL_MS = 60000;

// Today's fleet-wide fuel/CO2 totals from get_carbon_impact_summary
// (add_carbon_impact.sql). Aggregates only, so it's callable as anon.
export function useCarbonImpact() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const { data, error: rpcError } = await supabase.rpc("get_carbon_impact_summary");
      if (cancelled) return;
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      setError(null);
      setSummary(data);
    };

    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  return { summary, error };
}
