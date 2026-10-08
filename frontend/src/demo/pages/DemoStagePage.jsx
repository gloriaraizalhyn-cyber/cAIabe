import { useCallback, useEffect, useState } from "react";
import MapView from "../../shared/components/MapView.jsx";
import PhoneFrame from "../components/PhoneFrame.jsx";
import PresenterBar from "../components/PresenterBar.jsx";
import SmsThreadPane from "../components/SmsThreadPane.jsx";
import CarbonImpactPanel from "../../shared/components/CarbonImpactPanel.jsx";
import { useDemoStage } from "../hooks/useDemoStage.js";
import { buildPassengerFrameUrl } from "../demoTripParams.js";
import {
  DEMO_BEATS,
  DEMO_JOURNEY,
  DEMO_LEAD_ROUTE,
  DEMO_PANE_DRIVER_UNIT,
  DEMO_ROUTES,
  DEMO_YELLOW_PANE_DRIVER_UNIT,
  fillBeatText,
  simDriverEmail,
} from "../constants/demoScript.js";
import "./DemoStagePage.css";

// /driver/next-to-go, not the dashboard: it renders WaitOrGoCard, the
// individual waiting-passenger dots, and the demand clusters — the driver-side
// half of the story — and it never watches GPS once "Use terminal location"
// is tapped, so it can't fight the fleet simulator for a driver's position.
const DRIVER_FRAME_URL = `/driver/next-to-go?demoFrame=driver&demoAs=${encodeURIComponent(
  simDriverEmail(DEMO_LEAD_ROUTE.name, DEMO_PANE_DRIVER_UNIT)
)}`;

// The yellow (Telabastagan) driver's phone — same page, signed in as the
// yellow route's spare simulated unit.
const YELLOW_DRIVER_ROUTE = DEMO_ROUTES[1];
const YELLOW_DRIVER_FRAME_URL = `/driver/next-to-go?demoFrame=driver&demoAs=${encodeURIComponent(
  simDriverEmail(YELLOW_DRIVER_ROUTE.name, DEMO_YELLOW_PANE_DRIVER_UNIT)
)}`;

const PASSENGER_FRAME_URL = buildPassengerFrameUrl({
  path: "/routes",
  origin: DEMO_JOURNEY.origin,
  destination: DEMO_JOURNEY.destination,
  discountType: DEMO_JOURNEY.discountType,
});

// Mission Control: the passenger app, the live network, and the driver app
// on one screen, all over the same real Supabase state.
//
// The point of putting them side by side is causation — a judge watching the
// passenger tap "I'm here" sees the yellow dot land on the driver's phone in
// the same second. That relationship is invisible when these are three
// separate URLs, which is how the app is normally used.
function DemoStagePage() {
  const {
    journey,
    journeyError,
    fleet,
    demand,
    stageDriver,
    smsThread,
    activity,
    levers,
  } = useDemoStage();

  const [beatIndex, setBeatIndex] = useState(0);
  const [isTrafficThrown, setIsTrafficThrown] = useState(false);

  const beat = DEMO_BEATS[beatIndex];

  const goNext = useCallback(() => setBeatIndex((i) => Math.min(i + 1, DEMO_BEATS.length - 1)), []);
  const goPrev = useCallback(() => setBeatIndex((i) => Math.max(i - 1, 0)), []);

  // Space / arrows advance the story, so the presenter never has to find a
  // button mid-sentence. Ignored while typing into either iframe's inputs.
  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (event.key === " " || event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goNext, goPrev]);

  const throwTraffic = useCallback(async () => {
    await levers.throwTraffic();
    setIsTrafficThrown(true);
  }, [levers]);

  const clearTraffic = useCallback(async () => {
    await levers.clearTraffic();
    setIsTrafficThrown(false);
  }, [levers]);

  const waitingPassengers = demand?.waiting_passengers ?? [];
  const demandClusters = demand?.clusters ?? [];

  const focus = beat.focus;
  const isFocused = (pane) => focus === pane || focus === "both";

  return (
    <main className="demo-stage">
      <header className="demo-stage__header">
        <div className="demo-stage__brand">
          <span className="demo-stage__logo">cAIabe</span>
          <span className="demo-stage__journey">
            {DEMO_JOURNEY.origin.label} <span aria-hidden="true">→</span> {DEMO_JOURNEY.destination.label}
          </span>
        </div>

        <div className="demo-stage__status">
          {DEMO_ROUTES.map((route) => (
            <span key={route.id} className="demo-stage__route-chip">
              <span className="demo-stage__route-dot" style={{ background: route.color }} />
              {route.shortName}
              <strong>{fleet.countsByLeg[route.leg] ?? 0}</strong>
            </span>
          ))}
          <span className="demo-stage__route-chip">
            👥 waiting <strong>{waitingPassengers.length}</strong>
          </span>
          <span
            className={
              fleet.isConnected
                ? "demo-stage__live demo-stage__live--on"
                : "demo-stage__live"
            }
          >
            {fleet.isConnected ? "● LIVE" : "connecting…"}
          </span>
        </div>
      </header>

      <div className="demo-stage__body">
        <PhoneFrame
          title="Passenger"
          subtitle="Aling Nena · student fare"
          accent="#2563eb"
          src={PASSENGER_FRAME_URL}
          isFocused={isFocused("passenger")}
        />

        <section className={`demo-stage__map${isFocused("map") ? " demo-stage__map--focused" : ""}`}>
          <MapView
            routes={journey ? [journey] : []}
            jeepneys={fleet.jeepneys}
            waitingPassengers={waitingPassengers}
            demandClusters={demandClusters}
            origin={DEMO_JOURNEY.origin}
            destination={DEMO_JOURNEY.destination}
            zoom={13}
          />

          <div className="demo-stage__impact">
            <CarbonImpactPanel variant="dark" compact />
          </div>

          <div className="demo-stage__caption">
            <span className="demo-stage__caption-step">
              {beatIndex + 1}/{DEMO_BEATS.length}
            </span>
            <p className="demo-stage__caption-text">{fillBeatText(beat.caption, journey?.fare)}</p>
          </div>

          {journeyError && (
            <p className="demo-stage__error">Route planning failed: {journeyError}</p>
          )}
          {stageDriver.status === "failed" && (
            <p className="demo-stage__error">
              Demo driver sign-in failed ({stageDriver.error}). Run{" "}
              <code>node --env-file=.env demo-prep.js</code>.
            </p>
          )}

          {focus === "sms" && (
            <SmsThreadPane thread={smsThread} onSend={levers.sendSms} isFocused />
          )}
        </section>

        <PhoneFrame
          title="Driver"
          subtitle={`Mang Ruben · ${DEMO_LEAD_ROUTE.shortName}`}
          accent={DEMO_LEAD_ROUTE.color}
          src={DRIVER_FRAME_URL}
          isFocused={isFocused("driver")}
          badge={demand?.recommendation ? demand.recommendation.toUpperCase() : null}
        />

        <PhoneFrame
          title="Driver"
          subtitle={`Mang Dodong · ${YELLOW_DRIVER_ROUTE.shortName}`}
          accent={YELLOW_DRIVER_ROUTE.color}
          src={YELLOW_DRIVER_FRAME_URL}
          isFocused={beat.id === "board"}
        />
      </div>

      <PresenterBar
        beatIndex={beatIndex}
        onSelectBeat={setBeatIndex}
        onPrev={goPrev}
        onNext={goNext}
        levers={{ ...levers, throwTraffic, clearTraffic }}
        activity={activity}
        isTrafficThrown={isTrafficThrown}
      />
    </main>
  );
}

export default DemoStagePage;
