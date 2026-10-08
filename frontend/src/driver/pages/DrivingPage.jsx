import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import DrivingStatusBar from "../components/DrivingStatusBar.jsx";
import MapView from "../../shared/components/MapView.jsx";
import NextPickupCard from "../components/NextPickupCard.jsx";
import TripCompleteModal from "../components/TripCompleteModal.jsx";
import TripInfoPanel from "../components/TripInfoPanel.jsx";
import OperatingStatusCard from "../components/OperatingStatusCard.jsx";
import RoadsideIdleCard from "../components/RoadsideIdleCard.jsx";
import IdleEngineOffToast from "../components/IdleEngineOffToast.jsx";
import { useDriverSession } from "../hooks/useDriverSession.js";
import { useDriverFuelCheck } from "../hooks/useDriverFuelCheck.js";
import { useDriverDemand } from "../hooks/useDriverDemand.js";
import { useDriverImpactSummary } from "../hooks/useDriverImpactSummary.js";
import { useRoadsideIdleTracker } from "../hooks/useRoadsideIdleTracker.js";
import LoadingScreen from "../../shared/components/LoadingScreen.jsx";
import { fetchOwnQueueEntry } from "../utils/queue.js";
import { COLOR_NAME_TO_HEX } from "../../shared/constants/driverRegistrationFixtures.js";
import { NEXT_WAITING_PICKUP_FIXTURE } from "../../shared/constants/driverDashboardFixtures.js";
import { supabase } from "../../shared/lib/supabaseClient.js";
import { isDemoDriverFrame } from "../../demo/demoTripParams.js";
import {
  DEMO_DRIVE_STEP_INTERVAL_MS,
  DEMO_DRIVE_STEP_METERS,
  DEMO_DRIVE_ROUTES,
  DEMO_ROUTE_END_ZONE_METERS,
  DEMO_TERMINUS_RADIUS_METERS,
} from "../../demo/constants/demoScript.js";
import { haversineDistanceMeters } from "../../shared/utils/geo.js";
import "./DrivingPage.css";

// NEXT_WAITING_PICKUP_FIXTURE stays as-is here — there's no per-driver
// pickup-assignment concept server-side, only fuzzed passenger_waiting_state
// rows broadcast per route. Everything else on this page (GPS tracking,
// end-of-route detection, capacity toggle, and the map itself) is real.
const LOCATION_UPDATE_MIN_INTERVAL_MS = 10000;

function DrivingPage() {
  const navigate = useNavigate();
  const { driver, loading, session } = useDriverSession();
  const { summary: impactSummary } = useDriverImpactSummary(Boolean(driver), { refreshMs: 60000 });
  const [capacityStatus, setCapacityStatus] = useState("seats_open");
  const [currentPosition, setCurrentPosition] = useState(null);
  const [isTripComplete, setIsTripComplete] = useState(false);
  const [newQueuePosition, setNewQueuePosition] = useState(null);
  const [tripTimeMinutes, setTripTimeMinutes] = useState(null);
  // The stage's driver iframe has geolocation blocked, so it drives itself
  // along the route instead (see the demo drive loop below). Outside the stage,
  // a driver with no GPS can switch the same scripted drive on with the
  // "No GPS?" button (handleUseTerminalLocation) — otherwise a jeep with no
  // position source just sits at the terminal forever.
  const [isDemoDrive, setIsDemoDrive] = useState(isDemoDriverFrame());
  const [isUsingDemoPosition, setIsUsingDemoPosition] = useState(isDemoDrive);

  const lastUpdateAtRef = useRef(0);
  const watchIdRef = useRef(null);
  const startedAtRef = useRef(Date.now());

  // Only start polling once a live position is actually on file — driver-fuel-check
  // needs one already broadcast via driver-location-update.
  const fuelInfo = useDriverFuelCheck(Boolean(currentPosition) && !isTripComplete);

  // Sak.AI roadside-idling detection — outside the terminal, stationary,
  // past a duration threshold. Reuses the SAME GPS stream (currentPosition)
  // driven below; no second location tracker. Only ticks a local timer —
  // the actual verdict/copy/fuel estimate comes back from
  // driver-demand-check via the minutes reported into useDriverDemand below.
  const { roadsideIdleMinutes, idleStatus: localIdleStatus } = useRoadsideIdleTracker({
    position: currentPosition,
    terminalPosition: driver?.terminal?.position ?? null,
    isActive: !isTripComplete,
  });

  // Sak.AI "CONTINUE or GARAGE?" — same demand engine as NextToGoPage's
  // WAIT/GO card, weighed here against the real recent-vs-prior request
  // trend (see driver-demand-check's calculateOperatingDemand()) and, when
  // relevant, roadside idle duration (see calculateOperatingDemand's
  // idleEscalated step and the roadside_idle response field).
  const { data: demand, isLoading: isDemandLoading, refresh: refreshDemand } = useDriverDemand({
    routeId: driver?.route?.id,
    position: currentPosition,
    isActive: !isTripComplete,
    roadsideIdleMinutes: localIdleStatus !== "none" ? roadsideIdleMinutes : null,
  });

  // Nudge an immediate refresh when the locally-ticking idle severity
  // crosses a band boundary, rather than waiting up to 12s for the next
  // poll — mirrors the existing debounced-realtime-refresh precedent this
  // hook already has for passenger_waiting/passenger_cleared broadcasts.
  const previousIdleStatusRef = useRef(localIdleStatus);
  useEffect(() => {
    if (previousIdleStatusRef.current !== localIdleStatus) {
      previousIdleStatusRef.current = localIdleStatus;
      refreshDemand();
    }
  }, [localIdleStatus, refreshDemand]);

  // Demo/testing bypass — sidesteps real device GPS entirely (useful when
  // testing from outside Clark/Angeles, or without granting location at
  // all) by placing the driver at their own terminal's real coordinates.
  // driver-location-update still fires with this position, same as it would
  // with a real one — only where the coordinate comes from changes.
  const handleUseTerminalLocation = () => {
    if (!driver?.terminal?.position) return;
    setIsUsingDemoPosition(true);
    setCurrentPosition(driver.terminal.position);

    // On a demo route, hand over to the scripted drive: it rolls the jeep out
    // along the real route. Posting the terminal's own position here would be
    // wrong anyway — the terminal is within the server's 100 m end-of-route
    // radius, so a driving unit reporting it is requeued as "trip finished".
    if (driver.route?.id && DEMO_DRIVE_ROUTES[driver.route.id]) {
      setIsDemoDrive(true);
      return;
    }

    lastUpdateAtRef.current = Date.now();
    supabase.functions.invoke("driver-location-update", { body: driver.terminal.position });
  };

  useEffect(() => {
    if (isUsingDemoPosition || !navigator.geolocation) return undefined;

    const id = navigator.geolocation.watchPosition(
      (geoPosition) => {
        const here = { lat: geoPosition.coords.latitude, lng: geoPosition.coords.longitude };
        setCurrentPosition(here);

        const now = Date.now();
        if (now - lastUpdateAtRef.current < LOCATION_UPDATE_MIN_INTERVAL_MS) return;
        lastUpdateAtRef.current = now;

        supabase.functions
          .invoke("driver-location-update", { body: here })
          .then(async ({ data }) => {
            if (!data?.end_of_route) return;

            const entry =
              driver?.route?.id && session?.user?.id
                ? await fetchOwnQueueEntry(driver.route.id, session.user.id)
                : null;
            setNewQueuePosition(entry?.position ?? null);
            setTripTimeMinutes(Math.round((Date.now() - startedAtRef.current) / 60000));
            setIsTripComplete(true);
          });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    watchIdRef.current = id;
    return () => navigator.geolocation.clearWatch(id);
  }, [driver?.route?.id, session?.user?.id, isUsingDemoPosition]);

  // Demo drive loop — only in the stage's driver iframe. Walks the driver
  // down its route's real polyline from the terminal, a fixed step at a time,
  // and reports every position through driver-location-update (the same call
  // a real GPS tick makes), so the jeepney visibly moves here, on the live
  // map, and on the passenger's screen. Stops at end-of-route like a real trip.
  useEffect(() => {
    if (!isDemoDrive || !driver?.route?.id || isTripComplete) return undefined;
    let isMounted = true;
    // Without known geometry for this route there is nothing safe to script.
    const geometry = DEMO_DRIVE_ROUTES[driver.route.id];
    if (!geometry) return undefined;
    let distance = geometry.startAlongMeters;
    let inFlight = false;

    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      distance += DEMO_DRIVE_STEP_METERS;
      const { data: points } = await supabase.rpc("get_route_point_at_distance", {
        p_route_id: driver.route.id,
        p_distance_meters: distance,
      });
      const point = points?.[0];
      if (!isMounted || !point) {
        inFlight = false;
        return;
      }
      const here = { lat: point.lat, lng: point.lng };
      setCurrentPosition(here);

      // The server treats "within 100 m of the route's end point" as a
      // finished trip. This route passes that point twice before it really
      // ends (leaving the terminal, and a small loop around SM City Clark), so
      // don't report those stretches — only the true end of the loop counts.
      const isNearTerminus =
        haversineDistanceMeters(here, geometry.terminal) <= DEMO_TERMINUS_RADIUS_METERS;
      const isRealEnd = distance >= geometry.lengthMeters - DEMO_ROUTE_END_ZONE_METERS;
      if (isNearTerminus && !isRealEnd) {
        inFlight = false;
        return;
      }

      const { data } = await supabase.functions.invoke("driver-location-update", { body: here });
      inFlight = false;
      if (!isMounted || !data?.end_of_route) return;

      const entry =
        driver?.route?.id && session?.user?.id
          ? await fetchOwnQueueEntry(driver.route.id, session.user.id)
          : null;
      setNewQueuePosition(entry?.position ?? null);
      setTripTimeMinutes(Math.round((Date.now() - startedAtRef.current) / 60000));
      setIsTripComplete(true);
    };

    tick();
    const id = setInterval(tick, DEMO_DRIVE_STEP_INTERVAL_MS);
    return () => {
      isMounted = false;
      clearInterval(id);
    };
  }, [isDemoDrive, driver?.route?.id, session?.user?.id, isTripComplete]);

  // Big "ENGINE OFF" prompt — shown once per idling episode, when the server
  // says the stop is long enough to count as idling. Resets when the driver
  // moves again (local status back to "none").
  const [isIdlePromptClosed, setIsIdlePromptClosed] = useState(false);
  const [isEngineOffConfirmed, setIsEngineOffConfirmed] = useState(false);
  useEffect(() => {
    if (localIdleStatus === "none") {
      setIsIdlePromptClosed(false);
      setIsEngineOffConfirmed(false);
    }
  }, [localIdleStatus]);

  const idleStatus = demand?.roadside_idle?.status;
  const showIdlePrompt =
    (idleStatus === "idling" || idleStatus === "prolonged") && !isIdlePromptClosed && !isTripComplete;

  const handleEngineOff = () => {
    setIsEngineOffConfirmed(true);
    supabase.functions.invoke("driver-idle-response", {
      body: { response: "engine_off", minutes: roadsideIdleMinutes },
    });
  };

  // A trip starts with seats open. The seat state is stored per driver and was
  // never reset, while this screen's own button always starts on "Seats open" —
  // so a driver who once tapped FULL kept showing FULL to passengers on every
  // later trip while their own screen said otherwise. Sync the stored value to
  // what the screen shows, once, when the trip starts.
  const didResetSeatsRef = useRef(false);
  useEffect(() => {
    if (!driver || didResetSeatsRef.current) return;
    didResetSeatsRef.current = true;
    supabase.functions.invoke("driver-capacity-toggle", { body: { state: "available" } });
  }, [driver]);

  const handleSetCapacityStatus = (state) => {
    setCapacityStatus(state);
    // The UI's "seats_open" doesn't match the backend/DB's "available" —
    // translate here rather than renaming the local convention everywhere.
    supabase.functions.invoke("driver-capacity-toggle", {
      body: { state: state === "full" ? "full" : "available" },
    });
  };

  const handleCloseTripComplete = () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    navigate({ pathname: "/driver/dashboard", search: window.location.search }, { state: { shiftStage: "arrived" } });
  };

  if (loading || !driver) {
    return <LoadingScreen message="Starting engine…" />;
  }

  const routeColorName = driver.route?.color ?? "blue";
  const routeColorHex = COLOR_NAME_TO_HEX[routeColorName.toLowerCase()] ?? "#4a4f59";

  const ownJeepney = currentPosition
    ? [
        {
          id: "self",
          lat: currentPosition.lat,
          lng: currentPosition.lng,
          capacityState: capacityStatus === "full" ? "full" : "available",
          color: routeColorHex,
          routeName: routeColorName,
        },
      ]
    : [];

  return (
    <main className="driving-page">
      <MapView
        jeepneys={ownJeepney}
        demandClusters={demand?.clusters ?? []}
        waitingPassengers={demand?.waiting_passengers ?? []}
        center={currentPosition ?? undefined}
        zoom={16}
        isOwnJeepneyIdling={localIdleStatus === "idling" || localIdleStatus === "prolonged"}
      />
      <DrivingStatusBar
        routeColorName={routeColorName}
        routeColorHex={routeColorHex}
        capacityStatus={capacityStatus}
      />
      <TripInfoPanel fuelInfo={fuelInfo} capacityStatus={capacityStatus} />
      <OperatingStatusCard
        data={demand}
        isLoading={isDemandLoading}
        onUseTerminalLocation={!currentPosition ? handleUseTerminalLocation : null}
      />
      {!isEngineOffConfirmed && (
        <RoadsideIdleCard roadsideIdle={demand?.roadside_idle} liveMinutes={roadsideIdleMinutes} />
      )}

      {showIdlePrompt && (
        <IdleEngineOffToast
          roadsideIdle={demand?.roadside_idle}
          liveMinutes={roadsideIdleMinutes}
          onEngineOff={handleEngineOff}
          onClose={() => setIsIdlePromptClosed(true)}
        />
      )}

      <NextPickupCard
        nextPickup={NEXT_WAITING_PICKUP_FIXTURE}
        capacityStatus={capacityStatus}
        onSetCapacityStatus={handleSetCapacityStatus}
        impactSummary={impactSummary}
      />

      {isTripComplete && (
        <TripCompleteModal
          terminalName={driver.terminal?.name ?? "your terminal"}
          tripTimeMinutes={tripTimeMinutes}
          newQueueSlot={newQueuePosition ?? "…"}
          onClose={handleCloseTripComplete}
        />
      )}
    </main>
  );
}

export default DrivingPage;
