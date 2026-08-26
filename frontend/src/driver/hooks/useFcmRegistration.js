import { useEffect } from "react";
import { requestFcmToken } from "../../shared/lib/firebaseMessaging.js";
import { supabase } from "../../shared/lib/supabaseClient.js";

// Registers this device for push (queue-turn alerts) once an approved
// driver is logged in. A direct table write is enough here — no Edge
// Function needed, since "driver updates own row" RLS already lets a driver
// write their own drivers.fcm_token.
export function useFcmRegistration(driver) {
  useEffect(() => {
    if (!driver?.id || driver.verificationStatus !== "approved") return;

    let cancelled = false;

    requestFcmToken().then(async (token) => {
      if (cancelled || !token) return;
      await supabase.from("drivers").update({ fcm_token: token }).eq("id", driver.id);
    });

    return () => {
      cancelled = true;
    };
  }, [driver?.id, driver?.verificationStatus]);
}
