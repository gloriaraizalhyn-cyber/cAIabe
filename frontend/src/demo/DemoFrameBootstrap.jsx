import { useEffect, useState } from "react";
import { supabase } from "../shared/lib/supabaseClient.js";

// Password every simulated driver account is created with — see
// SIM_DRIVER_PASSWORD in mock-fleet-simulator.js. These are throwaway
// @caiabe.test accounts that only ever exist to drive the demo fleet.
const SIM_DRIVER_PASSWORD = "MockFleet123!";

export const DEMO_SIM_DRIVER_PASSWORD = SIM_DRIVER_PASSWORD;

// Signs the driver iframe in before anything under it renders.
//
// Needed because useDriverSession checks getSession() on mount and bounces
// straight to /driver/login when there isn't one — so the sign-in has to
// finish BEFORE DriverDashboardPage mounts, not alongside it. Blocking here
// is the whole point; don't turn this into a fire-and-forget effect.
//
// Only ever active when the URL carries ?demoAs=<email>. Without it this
// renders children synchronously on the first pass and the app behaves
// exactly as it always has.
function DemoFrameBootstrap({ children }) {
  const params = new URLSearchParams(window.location.search);
  const demoAs = params.get("demoAs");
  const demoPass = params.get("demoPass") ?? SIM_DRIVER_PASSWORD;

  const [status, setStatus] = useState(demoAs ? "signing-in" : "ready");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!demoAs) return undefined;
    let isMounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();

      // Already signed in as the right account (a reload, or a second render
      // of the same frame) — don't churn the session, it would trigger a
      // needless onAuthStateChange in every subscriber.
      if (data.session?.user?.email?.toLowerCase() === demoAs.toLowerCase()) {
        if (isMounted) setStatus("ready");
        return;
      }

      if (data.session) await supabase.auth.signOut();

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: demoAs,
        password: demoPass,
      });

      if (!isMounted) return;
      if (signInError) {
        setError(signInError.message);
        setStatus("failed");
        return;
      }
      setStatus("ready");
    })();

    return () => {
      isMounted = false;
    };
  }, [demoAs, demoPass]);

  if (status === "ready") return children;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        padding: "24px",
        textAlign: "center",
        font: "500 13px/1.5 'DM Sans', system-ui, sans-serif",
        color: status === "failed" ? "#b91c1c" : "#64748b",
      }}
    >
      {status === "failed" ? (
        <div>
          <p style={{ margin: "0 0 6px", fontWeight: 700 }}>Demo driver sign-in failed</p>
          <p style={{ margin: 0 }}>{error}</p>
          <p style={{ margin: "10px 0 0", color: "#64748b" }}>
            Run <code>node --env-file=.env demo-prep.js</code> to create the simulated drivers.
          </p>
        </div>
      ) : (
        <p style={{ margin: 0 }}>Signing in demo driver…</p>
      )}
    </div>
  );
}

export default DemoFrameBootstrap;
