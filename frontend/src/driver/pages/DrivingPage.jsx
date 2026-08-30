import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import DrivingStatusBar from "../components/DrivingStatusBar.jsx";
import MapView from "../../shared/components/MapView.jsx";
import NextPickupCard from "../components/NextPickupCard.jsx";
import TripCompleteModal from "../components/TripCompleteModal.jsx";
import TripInfoPanel from "../components/TripInfoPanel.jsx";
import OperatingStatusCard from "../components/OperatingStatusCard.jsx";
import { useDriverSession } from "../hooks/useDriverSession.js";
import { useDriverFuelCheck } from "../hooks/useDriverFuelCheck.js";
import { useDriverDemand } from "../hooks/useDriverDemand.js";
import LoadingScreen from "../../shared/components/LoadingScreen.jsx";
import { fetchOwnQueueEntry } from "../utils/queue.js";
import { COLOR_NAME_TO_HEX } from "../../shared/constants/driverRegistrationFixtures.js";
import { NEXT_WAITING_PICKUP_FIXTURE } from "../../shared/constants/driverDashboardFixtures.js";
import { supabase } from "../../shared/lib/supabaseClient.js";
import "./DrivingPage.css";

// NEXT_WAITING_PICKUP_FIXTURE stays as-is here — there's no per-driver
// pickup-assignment concept server-side, only fuzzed passenger_waiting_state
// rows broadcast per route. Everything else on this page (GPS tracking,
// end-of-route detection, capacity toggle, and the map itself) is real.
const LOCATION_UPDATE_MIN_INTERVAL_MS = 5000;

function DrivingPage() {
  const navigate = useNavigate();
  const { driver, loading, session } = useDriverSession();
  const [capacityStatus, setCapacityStatus] = useState("seats_open");
  const [currentPosition, setCurrentPosition] = useState(null);
  const [isTripComplete, setIsTripComplete] = useState(false);
  const [newQueuePosition, setNewQueuePosition] = useState(null);
  const [tripTimeMinutes, setTripTimeMinutes] = useState(null);
  const [isUsingDemoPosition, setIsUsingDemoPosition] = useState(false);

  const lastUpdateAtRef = useRef(0);
  const watchIdRef = useRef(null);
  const startedAtRef = useRef(Date.now());

  // Only start polling once a live position is actually on file — driver-fuel-check
  // needs one already broadcast via driver-location-update.
  const fuelInfo = useDriverFuelCheck(Boolean(currentPosition) && !isTripComplete);

  // Sak.AI "CONTINUE or GARAGE?" — same demand engine as NextToGoPage's
  // WAIT/GO card, weighed here against the real recent-vs-prior request
  // trend (see driver-demand-check's calculateOperatingDemand()).
  const { data: demand, isLoading: isDemandLoading } = useDriverDemand({
    routeId: driver?.route?.id,
    position: currentPosition,
    isActive: !isTripComplete,
  });

  // Demo/testing bypass — sidesteps real device GPS entirely (useful when
  // testing from outside Clark/Angeles, or without granting location at
  // all) by placing the driver at their own terminal's real coordinates.
  // driver-location-update still fires with this position, same as it would
  // with a real one — only where the coordinate comes from changes.
  const handleUseTerminalLocation = () => {
    if (!driver?.terminal?.position) return;
    setIsUsingDemoPosition(true);
    setCurrentPosition(driver.terminal.position);
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
    navigate("/driver/dashboard", { state: { shiftStage: "arrived" } });
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
        center={currentPosition ?? undefined}
        zoom={16}
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
      <NextPickupCard
        nextPickup={NEXT_WAITING_PICKUP_FIXTURE}
        capacityStatus={capacityStatus}
        onSetCapacityStatus={handleSetCapacityStatus}
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
