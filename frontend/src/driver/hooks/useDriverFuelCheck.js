import { useEffect, useState } from "react";
import { supabase } from "../../shared/lib/supabaseClient.js";

const POLL_INTERVAL_MS = 45000;

// Polls the existing driver-fuel-check edge function while the driver is on
// a trip. Real traffic-aware fuel estimate + real waiting-passenger demand
// for this route — both computed server-side, nothing faked here.
export function useDriverFuelCheck(isActive) {
  const [fuelInfo, setFuelInfo] = useState(null);

  useEffect(() => {
    if (!isActive) return undefined;

    let cancelled = false;

    const poll = async () => {
      const { data, error } = await supabase.functions.invoke("driver-fuel-check", { body: {} });
      if (cancelled || error) return;
      setFuelInfo(data);
    };

    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [isActive]);

  return fuelInfo;
}
