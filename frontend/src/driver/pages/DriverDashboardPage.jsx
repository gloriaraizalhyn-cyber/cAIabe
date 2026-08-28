import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ShiftSummaryCard from "../components/ShiftSummaryCard.jsx";
import LocationPermissionModal from "../components/LocationPermissionModal.jsx";
import HeadingToTerminalPanel from "../components/HeadingToTerminalPanel.jsx";
import ArrivedAtTerminalPanel from "../components/ArrivedAtTerminalPanel.jsx";
import OutsideTerminalQueueAlert from "../components/OutsideTerminalQueueAlert.jsx";
import { useDriverSession } from "../hooks/useDriverSession.js";
import { fetchOwnQueuePosition } from "../utils/queue.js";
import { haversineDistanceMeters } from "../../shared/utils/geo.js";
import { supabase } from "../../shared/lib/supabaseClient.js";
import "./DriverDashboardPage.css";

const TERMINAL_ARRIVAL_RADIUS_METERS = 150;

function DriverDashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { driver, loading, error, session } = useDriverSession();

  const [shiftStage, setShiftStage] = useState(location.state?.shiftStage ?? "not_started");
  const [queuePosition, setQueuePosition] = useState(null);
  const [isQueueExitAlertVisible, setIsQueueExitAlertVisible] = useState(false);
  const [hasLeftTemporarily, setHasLeftTemporarily] = useState(false);
  const [driverPosition, setDriverPosition] = useState(null);

  const watchIdRef = useRef(null);

  const refreshQueuePosition = useCallback(async () => {
    if (!driver?.route?.id || !session?.user?.id) return;
    const position = await fetchOwnQueuePosition(driver.route.id, session.user.id);
    if (position !== null) setQueuePosition(position);
  }, [driver?.route?.id, session?.user?.id]);

  const joinQueue = useCallback(async () => {
    if (!driver?.terminal?.id) return;
    await supabase.functions.invoke("driver-queue-join", {
      body: { terminal_id: driver.terminal.id },
    });
    // Whether this call created a fresh entry or 409'd because one already
    // exists, the driver's real position comes from re-reading the queue.
    await refreshQueuePosition();
  }, [driver?.terminal?.id, refreshQueuePosition]);

  // Real geofence: watches actual GPS while heading to the terminal (to
  // detect arrival) and while arrived (to detect wandering back out) —
  // replaces the old fixed-delay timers entirely.
  useEffect(() => {
    if (shiftStage !== "heading_to_terminal" && shiftStage !== "arrived") return undefined;
    if (!navigator.geolocation) return undefined;

    const terminalPosition = driver?.terminal?.position;

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const here = { lat: position.coords.latitude, lng: position.coords.longitude };
        setDriverPosition(here);

        if (!terminalPosition) return;
        const distance = haversineDistanceMeters(here, terminalPosition);
        const isInside = distance <= TERMINAL_ARRIVAL_RADIUS_METERS;

        if (shiftStage === "heading_to_terminal" && isInside) {
          setShiftStage("arrived");
          joinQueue();
        } else if (shiftStage === "arrived" && !isInside) {
          setIsQueueExitAlertVisible(true);
        } else if (shiftStage === "arrived" && isInside) {
          setIsQueueExitAlertVisible(false);
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    watchIdRef.current = id;
    return () => navigator.geolocation.clearWatch(id);
  }, [shiftStage, driver?.terminal?.position, joinQueue]);

  // Live queue position: the same broadcast channel driver-queue-respond
  // and queue-advance already publish to, plus a fallback poll in case a
  // broadcast is missed.
  useEffect(() => {
    if (shiftStage !== "arrived" || !driver?.route?.id) return undefined;

    const channel = supabase
      .channel(`route:${driver.route.id}:queue`)
      .on("broadcast", { event: "queue_updated" }, refreshQueuePosition)
      .on("broadcast", { event: "driver_departed" }, refreshQueuePosition)
      .subscribe();

    const pollId = setInterval(refreshQueuePosition, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollId);
    };
  }, [shiftStage, driver?.route?.id, refreshQueuePosition]);

  const handleStartShift = () => {
    setHasLeftTemporarily(false);
    setShiftStage("awaiting_location_permission");
  };

  const handleCancelLocationPermission = () => {
    setShiftStage("not_started");
  };

  const handleEnableLocation = () => {
    if (!navigator.geolocation) {
      setShiftStage("heading_to_terminal");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here = { lat: position.coords.latitude, lng: position.coords.longitude };
        setDriverPosition(here);
        const terminalPosition = driver?.terminal?.position;
        const isAlreadyAtTerminal =
          terminalPosition && haversineDistanceMeters(here, terminalPosition) <= TERMINAL_ARRIVAL_RADIUS_METERS;

        if (isAlreadyAtTerminal) {
          setShiftStage("arrived");
          joinQueue();
        } else {
          setShiftStage("heading_to_terminal");
        }
      },
      () => setShiftStage("heading_to_terminal"),
      { enableHighAccuracy: true }
    );
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
    // No `queue_entries.status` value represents "temporarily left" — this
    // is local UI only, matching today's behavior.
    setIsQueueExitAlertVisible(false);
    setHasLeftTemporarily(true);
  };

  const handleEndShiftForTheDay = async () => {
    setIsQueueExitAlertVisible(false);
    setHasLeftTemporarily(false);
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    await supabase.functions.invoke("driver-queue-respond", { body: { response: "skip_done" } });
    setShiftStage("not_started");
  };

  if (loading) {
    return (
      <main className="driver-dashboard-page">
        <p className="driver-dashboard-page__loading">Loading your dashboard…</p>
      </main>
    );
  }

  if (error || !driver) {
    return (
      <main className="driver-dashboard-page">
        <p className="driver-dashboard-page__loading">
          {error ?? "We couldn't find your driver profile."}
        </p>
      </main>
    );
  }

  if (driver.verificationStatus !== "approved") {
    return (
      <main className="driver-dashboard-page">
        <div className="driver-dashboard-page__panel">
          <header className="driver-dashboard-page__header">
            <h1 className="driver-dashboard-page__title">CAIABE Driver Dashboard</h1>
          </header>
          <p className="driver-dashboard-page__loading">
            Your application is still {driver.verificationStatus}. You'll get access to the
            dashboard once it's approved.
          </p>
        </div>
      </main>
    );
  }

  const assignedRouteLabel = driver.route ? `${driver.route.name} — ${driver.route.color ?? "blue"}` : "—";
  const assignedTerminalName = driver.terminal?.name ?? "—";
  const showShiftSummaryCard = shiftStage === "not_started" || shiftStage === "awaiting_location_permission";

  return (
    <main className="driver-dashboard-page">
      <div className="driver-dashboard-page__panel">
        <header className="driver-dashboard-page__header">
          <h1 className="driver-dashboard-page__title">CAIABE Driver Dashboard</h1>
        </header>

        {showShiftSummaryCard && (
          <ShiftSummaryCard
            assignedRouteLabel={assignedRouteLabel}
            assignedTerminalName={assignedTerminalName}
            onStartShift={handleStartShift}
          />
        )}

        {shiftStage === "heading_to_terminal" && (
          <HeadingToTerminalPanel
            driverPosition={driverPosition}
            terminalPosition={driver.terminal?.position}
            terminalName={assignedTerminalName}
          />
        )}

        {shiftStage === "arrived" && (
          <ArrivedAtTerminalPanel
            queuePosition={queuePosition ?? "…"}
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
          queuePosition={queuePosition ?? "…"}
          onDismiss={handleDismissQueueExitAlert}
          onLeaveTemporarily={handleLeaveTemporarily}
          onEndShiftForTheDay={handleEndShiftForTheDay}
        />
      )}
    </main>
  );
}

export default DriverDashboardPage;
