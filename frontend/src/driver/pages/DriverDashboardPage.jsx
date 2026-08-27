import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ShiftSummaryCard from "../components/ShiftSummaryCard.jsx";
import LocationPermissionModal from "../components/LocationPermissionModal.jsx";
import HeadingToTerminalPanel from "../components/HeadingToTerminalPanel.jsx";
import ArrivedAtTerminalPanel from "../components/ArrivedAtTerminalPanel.jsx";
import QueueTurnAlert from "../components/QueueTurnAlert.jsx";
import SmsFallbackLog from "../components/SmsFallbackLog.jsx";
import { useDriverSession } from "../hooks/useDriverSession.js";
import { useFcmRegistration } from "../hooks/useFcmRegistration.js";
import { useSmsLog } from "../hooks/useSmsLog.js";
import { fetchOwnQueueEntry } from "../utils/queue.js";
import { haversineDistanceMeters } from "../../shared/utils/geo.js";
import { supabase } from "../../shared/lib/supabaseClient.js";
import "./DriverDashboardPage.css";

const TERMINAL_ARRIVAL_RADIUS_METERS = 150;

function DriverDashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { driver, loading, error, session } = useDriverSession();
  useFcmRegistration(driver);
  const smsLogEntries = useSmsLog(driver?.id);

  const [shiftStage, setShiftStage] = useState(location.state?.shiftStage ?? "not_started");
  const [ownQueueEntry, setOwnQueueEntry] = useState(null);
  const [isRespondingToQueue, setIsRespondingToQueue] = useState(false);
  const [driverPosition, setDriverPosition] = useState(null);

  const watchIdRef = useRef(null);

  const refreshQueueEntry = useCallback(async () => {
    if (!driver?.route?.id || !session?.user?.id) return;
    const entry = await fetchOwnQueueEntry(driver.route.id, session.user.id);
    setOwnQueueEntry(entry);
  }, [driver?.route?.id, session?.user?.id]);

  const joinQueue = useCallback(async () => {
    if (!driver?.terminal?.id) return;
    await supabase.functions.invoke("driver-queue-join", {
      body: { terminal_id: driver.terminal.id },
    });
    // Whether this call created a fresh entry or 409'd because one already
    // exists, the driver's real position comes from re-reading the queue.
    await refreshQueueEntry();
  }, [driver?.terminal?.id, refreshQueueEntry]);

  // Real geofence, used ONLY to detect arrival at the terminal so the driver
  // can be auto-joined to the queue. Per the PRD, queue position must NOT
  // depend on tracked physical presence once a driver is waiting — so unlike
  // before, this stops watching the instant they arrive rather than also
  // policing whether they wander off afterward.
  useEffect(() => {
    if (shiftStage !== "heading_to_terminal") return undefined;
    if (!navigator.geolocation) return undefined;

    const terminalPosition = driver?.terminal?.position;

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const here = { lat: position.coords.latitude, lng: position.coords.longitude };
        setDriverPosition(here);

        if (!terminalPosition) return;
        const distance = haversineDistanceMeters(here, terminalPosition);
        if (distance <= TERMINAL_ARRIVAL_RADIUS_METERS) {
          setShiftStage("arrived");
          joinQueue();
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    watchIdRef.current = id;
    return () => navigator.geolocation.clearWatch(id);
  }, [shiftStage, driver?.terminal?.position, joinQueue]);

  // Live queue standing: the same broadcast channel driver-queue-respond and
  // queue-advance already publish to (including the next-2 "driver_notified"
  // event), plus a fallback poll in case a broadcast is missed.
  useEffect(() => {
    if (shiftStage !== "arrived" || !driver?.route?.id) return undefined;

    refreshQueueEntry();

    const channel = supabase
      .channel(`route:${driver.route.id}:queue`)
      .on("broadcast", { event: "driver_notified" }, refreshQueueEntry)
      .on("broadcast", { event: "queue_updated" }, refreshQueueEntry)
      .on("broadcast", { event: "driver_departed" }, refreshQueueEntry)
      .subscribe();

    const pollId = setInterval(refreshQueueEntry, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollId);
    };
  }, [shiftStage, driver?.route?.id, refreshQueueEntry]);

  const handleStartShift = () => {
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
    navigate("/driver/next-to-go");
  };

  // Next-2 turn alert responses (driver-queue-respond) — see QueueTurnAlert.
  const handleLiningUp = async () => {
    setIsRespondingToQueue(true);
    await supabase.functions.invoke("driver-queue-respond", { body: { response: "lining_up" } });
    setIsRespondingToQueue(false);
    navigate("/driver/next-to-go");
  };

  const handleLeaveTemporarily = async () => {
    setIsRespondingToQueue(true);
    await supabase.functions.invoke("driver-queue-respond", { body: { response: "skip_temp" } });
    await refreshQueueEntry();
    setIsRespondingToQueue(false);
  };

  const handleEndShiftForTheDay = async () => {
    setIsRespondingToQueue(true);
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    await supabase.functions.invoke("driver-queue-respond", { body: { response: "skip_done" } });
    setIsRespondingToQueue(false);
    setOwnQueueEntry(null);
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
  const showQueueTurnAlert =
    shiftStage === "arrived" && Boolean(ownQueueEntry?.notifiedAt) && !ownQueueEntry?.respondedAt;

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
            queuePosition={ownQueueEntry?.position ?? "…"}
            assignedRouteLabel={assignedRouteLabel}
            onViewQueue={handleViewQueue}
          />
        )}

        <SmsFallbackLog entries={smsLogEntries} />
      </div>

      {shiftStage === "awaiting_location_permission" && (
        <LocationPermissionModal
          onEnableLocation={handleEnableLocation}
          onCancel={handleCancelLocationPermission}
        />
      )}

      {showQueueTurnAlert && (
        <QueueTurnAlert
          queuePosition={ownQueueEntry?.position ?? null}
          isSubmitting={isRespondingToQueue}
          onLiningUp={handleLiningUp}
          onLeaveTemporarily={handleLeaveTemporarily}
          onEndShiftForTheDay={handleEndShiftForTheDay}
        />
      )}
    </main>
  );
}

export default DriverDashboardPage;
