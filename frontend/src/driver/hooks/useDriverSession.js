import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../shared/lib/supabaseClient.js";

// Terminal coordinates come from the get_terminal_coords RPC (looked up by
// name) rather than selecting terminals.location directly — PostgREST
// returns raw PostGIS geography as WKB hex, not {lat,lng}. Same RPC the
// backend's own lookup_functions.sql comment describes this exact use case
// for: "client code ... fetch readable lat/lng instead of raw PostGIS
// geography values, and look terminals up by name."
async function loadTerminalPosition(terminalName) {
  if (!terminalName) return null;
  const { data } = await supabase.rpc("get_terminal_coords", { p_name: terminalName });
  if (!data?.[0]) return null;
  return { lat: data[0].lat, lng: data[0].lng };
}

// Wraps the driver's Supabase Auth session plus their own `drivers` row
// (RLS: "driver reads own row"), joined to the public-read routes/terminals
// tables. Redirects to /driver/login whenever there's no session.
export function useDriverSession() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDriverProfile = useCallback(async (userId) => {
    const { data, error: driverErr } = await supabase
      .from("drivers")
      .select("id, jeep_color, verification_status, route:routes(id, name, color), terminal:terminals(id, name)")
      .eq("id", userId)
      .maybeSingle();

    if (driverErr || !data) {
      setError(driverErr?.message ?? "Driver profile not found — has this account finished registration?");
      setDriver(null);
      return;
    }

    const terminalPosition = await loadTerminalPosition(data.terminal?.name);

    setDriver({
      id: data.id,
      jeepColor: data.jeep_color,
      verificationStatus: data.verification_status,
      route: data.route,
      terminal: data.terminal ? { ...data.terminal, position: terminalPosition } : null,
    });
    setError(null);
  }, []);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      if (!data.session) {
        setLoading(false);
        navigate("/driver/login");
        return;
      }
      loadDriverProfile(data.session.user.id).finally(() => {
        if (isMounted) setLoading(false);
      });
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      if (!nextSession) {
        setDriver(null);
        navigate("/driver/login");
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [navigate, loadDriverProfile]);

  const refreshDriver = useCallback(() => {
    if (session?.user?.id) return loadDriverProfile(session.user.id);
    return Promise.resolve();
  }, [session, loadDriverProfile]);

  return { session, driver, loading, error, refreshDriver };
}
