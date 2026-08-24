import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DrivingStatusBar from "../components/DrivingStatusBar.jsx";
import DrivingMapCanvas from "../components/DrivingMapCanvas.jsx";
import NextPickupCard from "../components/NextPickupCard.jsx";
import TripCompleteModal from "../components/TripCompleteModal.jsx";
import { ROUTES_WITH_TERMINALS_FIXTURE, COLOR_NAME_TO_HEX } from "../../shared/constants/driverRegistrationFixtures.js";
import {
  CURRENT_DRIVER_PROFILE_FIXTURE,
  NEXT_WAITING_PICKUP_FIXTURE,
  TRIP_COMPLETE_TRIGGER_DELAY_MS,
  TRIP_TIME_MINUTES_FIXTURE,
  NEW_QUEUE_SLOT_FIXTURE,
} from "../../shared/constants/driverDashboardFixtures.js";
import "./DrivingPage.css";

const assignedRoute = ROUTES_WITH_TERMINALS_FIXTURE.find(
  (route) => route.id === CURRENT_DRIVER_PROFILE_FIXTURE.assignedRouteId
);
const assignedTerminal = assignedRoute.terminals.find(
  (terminal) => terminal.id === CURRENT_DRIVER_PROFILE_FIXTURE.assignedTerminalId
);
const routeColorHex = COLOR_NAME_TO_HEX[assignedRoute.color.toLowerCase()] ?? "#4a4f59";

function DrivingPage() {
  const navigate = useNavigate();
  const [capacityStatus, setCapacityStatus] = useState("seats_open");
  const [isTripComplete, setIsTripComplete] = useState(false);

  useEffect(() => {
    // No real geofencing yet — simulates GPS detecting the driver has
    // looped back into the terminal after completing the route.
    const tripCompleteTimeoutId = setTimeout(() => {
      setIsTripComplete(true);
    }, TRIP_COMPLETE_TRIGGER_DELAY_MS);
    return () => clearTimeout(tripCompleteTimeoutId);
  }, []);

  const handleCloseTripComplete = () => {
    navigate("/driver/dashboard", {
      state: { shiftStage: "arrived", queuePosition: NEW_QUEUE_SLOT_FIXTURE },
    });
  };

  return (
    <main className="driving-page">
      <DrivingMapCanvas
        unitNickname={CURRENT_DRIVER_PROFILE_FIXTURE.unitNickname}
        nextPickup={NEXT_WAITING_PICKUP_FIXTURE}
        capacityStatus={capacityStatus}
      />
      <DrivingStatusBar
        routeColorName={assignedRoute.color}
        routeColorHex={routeColorHex}
        capacityStatus={capacityStatus}
      />
      <NextPickupCard
        nextPickup={NEXT_WAITING_PICKUP_FIXTURE}
        capacityStatus={capacityStatus}
        onSetCapacityStatus={setCapacityStatus}
      />

      {isTripComplete && (
        <TripCompleteModal
          terminalName={assignedTerminal.name}
          tripTimeMinutes={TRIP_TIME_MINUTES_FIXTURE}
          newQueueSlot={NEW_QUEUE_SLOT_FIXTURE}
          onClose={handleCloseTripComplete}
        />
      )}
    </main>
  );
}

export default DrivingPage;
