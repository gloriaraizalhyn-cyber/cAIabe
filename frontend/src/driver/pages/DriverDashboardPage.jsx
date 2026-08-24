import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ShiftSummaryCard from "../components/ShiftSummaryCard.jsx";
import LocationPermissionModal from "../components/LocationPermissionModal.jsx";
import HeadingToTerminalPanel from "../components/HeadingToTerminalPanel.jsx";
import ArrivedAtTerminalPanel from "../components/ArrivedAtTerminalPanel.jsx";
import OutsideTerminalQueueAlert from "../components/OutsideTerminalQueueAlert.jsx";
import { ROUTES_WITH_TERMINALS_FIXTURE } from "../../shared/constants/driverRegistrationFixtures.js";
import {
  CURRENT_DRIVER_PROFILE_FIXTURE,
  SIMULATED_DRIVER_START_POSITION,
  QUEUE_POSITION_FIXTURE,
  GEOFENCE_TRIGGER_DELAY_MS,
  QUEUE_EXIT_ALERT_DELAY_MS,
} from "../../shared/constants/driverDashboardFixtures.js";
import "./DriverDashboardPage.css";

const assignedRoute = ROUTES_WITH_TERMINALS_FIXTURE.find(
  (route) => route.id === CURRENT_DRIVER_PROFILE_FIXTURE.assignedRouteId
);
const assignedTerminal = assignedRoute.terminals.find(
  (terminal) => terminal.id === CURRENT_DRIVER_PROFILE_FIXTURE.assignedTerminalId
);
const assignedRouteLabel = `${assignedRoute.name} — ${assignedRoute.color}`;

function DriverDashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [shiftStage, setShiftStage] = useState(location.state?.shiftStage ?? "not_started");
  const [queuePosition, setQueuePosition] = useState(location.state?.queuePosition ?? QUEUE_POSITION_FIXTURE);
  const [isQueueExitAlertVisible, setIsQueueExitAlertVisible] = useState(false);
  const [hasLeftTemporarily, setHasLeftTemporarily] = useState(false);

  useEffect(() => {
    if (shiftStage !== "heading_to_terminal") return undefined;
    const geofenceTriggerTimeoutId = setTimeout(() => {
      setShiftStage("arrived");
    }, GEOFENCE_TRIGGER_DELAY_MS);
    return () => clearTimeout(geofenceTriggerTimeoutId);
  }, [shiftStage]);

  useEffect(() => {
    if (shiftStage !== "arrived") return undefined;
    // No real geofencing yet — simulates the driver wandering outside the
    // terminal area while still waiting in queue.
    const queueExitTimeoutId = setTimeout(() => {
      setIsQueueExitAlertVisible(true);
    }, QUEUE_EXIT_ALERT_DELAY_MS);
    return () => clearTimeout(queueExitTimeoutId);
  }, [shiftStage]);

  const handleStartShift = () => {
    setHasLeftTemporarily(false);
    setQueuePosition(QUEUE_POSITION_FIXTURE);
    setShiftStage("awaiting_location_permission");
  };

  const handleCancelLocationPermission = () => {
    setShiftStage("not_started");
  };

  const handleEnableLocation = () => {
    // No real geofencing yet — randomly simulate whether the driver's
    // position happens to already be inside the terminal.
    const isAlreadyAtTerminal = Math.random() < 0.5;
    setShiftStage(isAlreadyAtTerminal ? "arrived" : "heading_to_terminal");
  };

  const handleViewQueue = () => {
    if (hasLeftTemporarily) {
      setHasLeftTemporarily(false);
      return;
    }
    navigate("/driver/next-to-go");
  };

  const handleDismissQueueExitAlert = () => {
    setIsQueueExitAlertVisible(false);
  };

  const handleLeaveTemporarily = () => {
    setIsQueueExitAlertVisible(false);
    setHasLeftTemporarily(true);
  };

  const handleEndShiftForTheDay = () => {
    setIsQueueExitAlertVisible(false);
    setHasLeftTemporarily(false);
    setShiftStage("not_started");
  };

  const showShiftSummaryCard = shiftStage === "not_started" || shiftStage === "awaiting_location_permission";

  return (
    <main className="driver-dashboard-page">
      <div className="driver-dashboard-page__panel">
        <header className="driver-dashboard-page__header">
          <h1 className="driver-dashboard-page__title">CAIABE Driver Dashboard</h1>
          <p className="driver-dashboard-page__subtitle">{CURRENT_DRIVER_PROFILE_FIXTURE.fullName}</p>
        </header>

        {showShiftSummaryCard && (
          <ShiftSummaryCard
            assignedRouteLabel={assignedRouteLabel}
            assignedTerminalName={assignedTerminal.name}
            onStartShift={handleStartShift}
          />
        )}

        {shiftStage === "heading_to_terminal" && (
          <HeadingToTerminalPanel
            driverPosition={SIMULATED_DRIVER_START_POSITION}
            terminalPosition={assignedTerminal.location}
            terminalName={assignedTerminal.name}
          />
        )}

        {shiftStage === "arrived" && (
          <ArrivedAtTerminalPanel
            queuePosition={queuePosition}
            assignedRouteLabel={assignedRouteLabel}
            hasLeftTemporarily={hasLeftTemporarily}
            onViewQueue={handleViewQueue}
          />
        )}
      </div>

      {shiftStage === "awaiting_location_permission" && (
        <LocationPermissionModal
          onEnableLocation={handleEnableLocation}
          onCancel={handleCancelLocationPermission}
        />
      )}

      {shiftStage === "arrived" && isQueueExitAlertVisible && (
        <OutsideTerminalQueueAlert
          queuePosition={queuePosition}
          onDismiss={handleDismissQueueExitAlert}
          onLeaveTemporarily={handleLeaveTemporarily}
          onEndShiftForTheDay={handleEndShiftForTheDay}
        />
      )}
    </main>
  );
}

export default DriverDashboardPage;
