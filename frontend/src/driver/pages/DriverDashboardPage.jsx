import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import LoadingScreen from "../../shared/components/LoadingScreen.jsx";
import ShiftSummaryCard from "../components/ShiftSummaryCard.jsx";
import DriverProfileCard from "../components/DriverProfileCard.jsx";
import DriverGreeting from "../components/DriverGreeting.jsx";
import LocationPermissionModal from "../components/LocationPermissionModal.jsx";
import HeadingToTerminalPanel from "../components/HeadingToTerminalPanel.jsx";
import ArrivedAtTerminalPanel from "../components/ArrivedAtTerminalPanel.jsx";
import QueueTurnAlert from "../components/QueueTurnAlert.jsx";
import { useDriverSession } from "../hooks/useDriverSession.js";
import { useFcmRegistration } from "../hooks/useFcmRegistration.js";
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

  const [shiftStage, setShiftStage] = useState(location.state?.shiftStage ?? "not_started");
  const [ownQueueEntry, setOwnQueueEntry] = useState(null);
  const [isRespondingToQueue, setIsRespondingToQueue] = useState(false);
  const [isSkippingQueueWait, setIsSkippingQueueWait] = useState(false);
  const [driverPosition, setDriverPosition] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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

  // Demo/testing bypass — never calls navigator.geolocation, so it never
  // triggers the browser's location prompt at all. Lets someone test from
  // anywhere (or with location permission denied/unavailable) by placing
  // them at their assigned terminal's real, known coordinates instead of
  // their actual device GPS — the AI reasoning downstream is unaffected,
  // only the driver's own starting coordinate source changes.
  const handleUseTerminalLocation = () => {
    if (!driver?.terminal?.position) return;
    setDriverPosition(driver.terminal.position);
    setShiftStage("arrived");
    joinQueue();
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
    navigate(ownQueueEntry?.position === 1 ? "/driver/next-to-go" : "/driver/queue");
  };

  // Next-2 turn alert responses (driver-queue-respond) — see QueueTurnAlert.
  const handleLiningUp = async () => {
    setIsRespondingToQueue(true);
    await supabase.functions.invoke("driver-queue-respond", { body: { response: "lining_up" } });
    setIsRespondingToQueue(false);
    navigate("/driver/next-to-go");
  };

  // Testing/demo bypass — driver-queue-respond doesn't actually require
  // notified_at to be set (it only checks the entry is waiting/next_to_go),
  // so this skips waiting on the next-2 notification entirely: it calls the
  // exact same "lining up" response a real notification would trigger. One
  // click = one stage forward (arrived -> next_to_go), matching NextToGoPage's
  // own "skip to driving" control for the next stage.
  const handleSkipQueueWait = async () => {
    setIsSkippingQueueWait(true);
    await supabase.functions.invoke("driver-queue-respond", { body: { response: "lining_up" } });
    setIsSkippingQueueWait(false);
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

  const handleProfile = () => {
    setIsMenuOpen(false);
    document.querySelector(".driver-profile-card")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleReportProblem = () => {
    setIsMenuOpen(false);
    window.location.href = "mailto:support@caiabe.app?subject=Driver dashboard problem";
  };

  const handleLogOut = async () => {
    setIsMenuOpen(false);
    await supabase.auth.signOut();
    navigate("/driver/login");
  };

  const renderDashboardHeader = () => (
    <>
      <header className="driver-dashboard-page__nav-header">
        <div className="driver-dashboard-page__brand">
          <img
            src="/images/caiabe-squared.jpg"
            alt=""
            className="driver-dashboard-page__brand-logo"
          />
          <span className="driver-dashboard-page__brand-text">
          C<span className="driver-dashboard-page__brand-ai">AI</span>ABE
          </span>
        </div>
        <div className="driver-dashboard-page__menu-wrap">
          <button
            type="button"
            className="driver-dashboard-page__menu-button"
            aria-label={isMenuOpen ? "Close dashboard menu" : "Open dashboard menu"}
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          {isMenuOpen && (
            <div className="driver-dashboard-page__menu" role="menu">
              <button type="button" role="menuitem" onClick={handleProfile}>Profile</button>
              <button type="button" role="menuitem" onClick={handleReportProblem}>Report a problem</button>
              <button type="button" role="menuitem" onClick={handleLogOut}>Log out</button>
            </div>
          )}
        </div>
      </header>
    </>
  );

  if (loading) {
    return <LoadingScreen message="Waking up dispatch…" />;
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
    const driverName = session?.user?.user_metadata?.full_name?.trim() || "Driver";
    return (
      <main className="driver-dashboard-page">
        <div className="driver-dashboard-page__panel">
          {renderDashboardHeader()}
          <header className="driver-dashboard-page__header">
            <DriverGreeting name={driverName} />
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
  const driverName = session?.user?.user_metadata?.full_name?.trim() || "Driver";
  const showShiftSummaryCard = shiftStage === "not_started" || shiftStage === "awaiting_location_permission";
  const showQueueTurnAlert =
    shiftStage === "arrived" && Boolean(ownQueueEntry?.notifiedAt) && !ownQueueEntry?.respondedAt;

  return (
    <main className="driver-dashboard-page">
      <div className="driver-dashboard-page__panel">
        {renderDashboardHeader()}
        <header className="driver-dashboard-page__header">
          <DriverGreeting name={driverName} />
        </header>

        <DriverProfileCard
          fullName={driverName}
          mobileNumber={session?.user?.user_metadata?.mobile_number}
          emailAddress={session?.user?.email}
          plateNumber={session?.user?.user_metadata?.plate_number}
          vehicleRegistrationNumber={session?.user?.user_metadata?.vehicle_registration_number}
          jeepColor={driver.jeepColor}
          shiftStarted={!showShiftSummaryCard}
        />

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
            onUseTerminalLocation={handleUseTerminalLocation}
          />
        )}

        {shiftStage === "arrived" && (
          <ArrivedAtTerminalPanel
            queuePosition={ownQueueEntry?.position ?? "…"}
            assignedRouteLabel={assignedRouteLabel}
            onViewQueue={handleViewQueue}
            onSkipQueueWait={handleSkipQueueWait}
            isSkippingQueueWait={isSkippingQueueWait}
          />
        )}
      </div>

      {shiftStage === "awaiting_location_permission" && (
        <LocationPermissionModal
          onEnableLocation={handleEnableLocation}
          onCancel={handleCancelLocationPermission}
          onUseTerminalLocation={handleUseTerminalLocation}
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
