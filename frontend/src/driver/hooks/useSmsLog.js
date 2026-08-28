import { useEffect, useState } from "react";
import { supabase } from "../../shared/lib/supabaseClient.js";

const POLL_INTERVAL_MS = 30000;
const RECENT_LIMIT = 5;

// Recent rows from sms_log (RLS: "driver reads own sms_log") — the SMS
// fallback queue-advance sends when a next-2 push notification misses.
// Polled rather than realtime since this is dashboard history, not a
// time-critical alert (QueueTurnAlert already covers that via broadcast).
export function useSmsLog(driverId) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    if (!driverId) {
      setEntries([]);
      return undefined;
    }

    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("sms_log")
        .select("id, message, simulated, created_at")
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false })
        .limit(RECENT_LIMIT);
      if (!cancelled && !error) setEntries(data ?? []);
    };

    load();
    const intervalId = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [driverId]);

  return entries;
}
