import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MapView from "../../shared/components/MapView.jsx";
import WalkToBayCard from "../components/WalkToBayCard.jsx";
import NearestJeepCard from "../components/NearestJeepCard.jsx";
import { ROUTE_OPTIONS_FIXTURE } from "../../shared/constants/tripSearchFixtures.js";
import { useLiveDriverPosition } from "../../shared/hooks/useLiveDriverPosition.js";
import { supabase } from "../../shared/lib/supabaseClient.js";
import "./WaitingForJeepPage.css";

// The WalkToBayCard/NearestJeepCard copy below stays on ROUTE_OPTIONS_FIXTURE
// text (bay name, nearest-jeep nickname, AI recommendation) — there's no
// backend concept of a "bay" or per-passenger nearby-jeep feed. The MAP
// itself is real: it shows the passenger's real location and, once
// location.state.routeId is a real route-search id, the live GPS position a
// driving unit on that route broadcasts (see driver-location-update /
// mock-driver-simulator.js at the repo root).
function getRealGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { timeout: 5000 }
    );
  });
}

function WaitingForJeepPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const selectedRoute =
    ROUTE_OPTIONS_FIXTURE.find((route) => route.id === location.state?.routeId) ??
    ROUTE_OPTIONS_FIXTURE[0];

  const realRouteId = location.state?.routeId ?? null;
  const passengerType = location.state?.passengerType ?? "regular";
  const passengerPosition = location.state?.tripSearch?.originPlace ?? null;

  const { position: driverPosition, isConnected } = useLiveDriverPosition(realRouteId);

  const [waitingPhase, setWaitingPhase] = useState("walking_to_bay");
  const waitingIdRef = useRef(null);

  const clearWaitingState = async () => {
    if (!waitingIdRef.current) return;
    const waitingId = waitingIdRef.current;
    waitingIdRef.current = null;
    await supabase.functions.invoke("waiting-clear", { body: { waiting_id: waitingId } });
  };

  const handleArrivedAtBay = async () => {
    setWaitingPhase("waiting_for_jeep");

    if (!realRouteId) return; // no real route id (e.g. a restored/demo session) — nothing to register
    const position = (await getRealGeolocation()) ?? passengerPosition;
    if (!position) return;

    const { data, error } = await supabase.functions.invoke("waiting-start", {
      body: { route_id: realRouteId, lat: position.lat, lng: position.lng, discount_type: passengerType },
    });
    if (!error && data?.waiting_id) {
      waitingIdRef.current = data.waiting_id;
    }
  };

  const handleSeeOtherOptions = async () => {
    await clearWaitingState();
    navigate("/routes", { state: { tripSearch: location.state?.tripSearch } });
  };

  const handleWaitForJeep = async () => {
    await clearWaitingState();
    navigate("/on-route", { state: { routeId: selectedRoute.id } });
  };

  return (
    <main className="waiting-for-jeep-page">
      <MapView
        origin={driverPosition}
        destination={passengerPosition}
        center={driverPosition ?? passengerPosition ?? undefined}
        zoom={15}
      />

      {realRouteId && !driverPosition && (
        <p className="waiting-for-jeep-page__live-status">
          {isConnected ? "Connected — waiting for a driving unit’s GPS…" : "Connecting…"}
        </p>
      )}

      {waitingPhase === "walking_to_bay" ? (
        <WalkToBayCard
          stepNumber={1}
          totalSteps={selectedRoute.legs.length}
          waitingAtBay={selectedRoute.waitingAtBay}
          onArrivedAtBay={handleArrivedAtBay}
        />
      ) : (
        <NearestJeepCard
          waitingAtBay={selectedRoute.waitingAtBay}
          onWaitForJeep={handleWaitForJeep}
          onSeeOtherOptions={handleSeeOtherOptions}
        />
      )}
    </main>
  );
}

export default WaitingForJeepPage;
