import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MapView from "../../shared/components/MapView.jsx";
import JourneyStatusBanner from "../components/JourneyStatusBanner.jsx";
import JourneyTimeline from "../components/JourneyTimeline.jsx";
import JourneyFareFooter from "../components/JourneyFareFooter.jsx";
import DemoSpeedChip from "../components/DemoSpeedChip.jsx";
import { useLiveDriverPositions } from "../../shared/hooks/useLiveDriverPositions.js";
import { getRouteColorMeta } from "../../shared/utils/routeColorHelpers.js";
import { haversineDistanceMeters } from "../../shared/utils/geo.js";
import { saveRoute, removeSavedRouteByKey, isRouteSaved } from "../../shared/utils/savedRoutesStorage.js";
import { getDemoSpeed, sendFleetSpeed, setDemoSpeed } from "../../demo/lib/demoFleetCommands.js";
import "./OnRoutePage.css";
import "./DemoOnRoute.css";

// Demo stage only: the passenger's ride, leg by leg, driven by the real
// simulated jeep that picked her up (see WaitingForJeepPage). It follows that
// jeep along its route, gets her off at the transfer stop, hands her back to
// WaitingForJeepPage for the next route, and finally shows the arrival. The
// regular app keeps using OnRoutePage's manual buttons.

// She gets off once her jeep is this close to the leg's drop-off point. Wide
// enough for a fast-forwarded jeep that moves ~100 m between updates.
const ALIGHT_RADIUS_M = 150;
// How long the "get off here" / "walk to your destination" steps show.
const ALIGHT_NOTICE_MS = 3500;
const FINAL_WALK_MS = 5000;
// Safety nets so the stage can never hang on a jeep that stopped reporting.
const LOST_JEEP_MS = 30000;
const MAX_LEG_MS = 4 * 60 * 1000;

function formatKm(meters) {
  return `${(meters / 1000).toFixed(1)} km`;
}

function DemoOnRoute() {
  const location = useLocation();
  const navigate = useNavigate();

  const { route, passengerType, tripSearch, pickedUpBy } = location.state;
  const legIndex = location.state.legIndex ?? 0;

  const itinerary = route?.itinerary ?? [];
  const jeepLegs = useMemo(() => itinerary.filter((leg) => leg.kind === "jeep"), [itinerary]);
  const leg = jeepLegs[legIndex];
  const nextLeg = jeepLegs[legIndex + 1] ?? null;
  const isLastLeg = !nextLeg;
  const legPosition = itinerary.indexOf(leg);
  const walkAfter = itinerary[legPosition + 1]?.kind === "walk" ? itinerary[legPosition + 1] : null;

  const legMeta = getRouteColorMeta(leg?.color, leg?.route_name);
  const nextMeta = nextLeg ? getRouteColorMeta(nextLeg.color, nextLeg.route_name) : null;

  const [stage, setStage] = useState("riding"); // riding | alighting | final_walk | arrived
  const [demoSpeed, setDemoSpeedState] = useState(getDemoSpeed);
  const [isSaved, setIsSaved] = useState(() => (route?.cardKey ? isRouteSaved(route.cardKey) : false));

  const { jeepneys } = useLiveDriverPositions(leg?.route_id);
  const boarded = jeepneys.find((jeep) => jeep.id === pickedUpBy) ?? null;
  const remainingM = boarded && leg ? haversineDistanceMeters(boarded, leg.to) : null;

  const initialRemainingRef = useRef(null);
  const lastSeenRef = useRef(Date.now());
  const legStartedAtRef = useRef(Date.now());
  const didResetRouteRef = useRef(false);
  const hasSeenJeepRef = useRef(false);
  const lastPositionRef = useRef(null);

  useEffect(() => {
    if (remainingM === null) return;
    if (initialRemainingRef.current === null) initialRemainingRef.current = Math.max(remainingM, 1);
  }, [remainingM]);

  // "Last seen" is the jeep's last BROADCAST, not its last change of position:
  // a jeep idling roadside (the stage's "Idle jeep" lever) keeps reporting the
  // same point, and keying this off movement used to declare it lost after
  // 30 s and send her to the transfer from wherever it had stopped. The leg's
  // time limit is paused for the same stretch — a stopped jeep isn't stalling.
  useEffect(() => {
    if (!boarded) return;
    const now = Date.now();
    const last = lastPositionRef.current;
    if (last && last.lat === boarded.lat && last.lng === boarded.lng) {
      legStartedAtRef.current += now - lastSeenRef.current;
    }
    lastPositionRef.current = { lat: boarded.lat, lng: boarded.lng };
    lastSeenRef.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boarded?.updatedAt]);

  const progress =
    remainingM !== null && initialRemainingRef.current
      ? Math.min(1, Math.max(0, 1 - remainingM / initialRemainingRef.current))
      : 0;

  // ---- fast-forward the jeep she is riding ----
  // First restore everyone else on the route to real time (WaitingForJeepPage
  // sped the whole route up so a jeep would reach her), then run only her jeep
  // at demo speed. Sequenced, because both go through the same command queue.
  useEffect(() => {
    if (!leg || stage !== "riding") return undefined;
    let cancelled = false;
    (async () => {
      if (!didResetRouteRef.current) {
        didResetRouteRef.current = true;
        await sendFleetSpeed(leg.route_name, 1);
      }
      if (!cancelled) await sendFleetSpeed(pickedUpBy, demoSpeed);
    })();
    return () => {
      cancelled = true;
    };
  }, [leg, stage, pickedUpBy, demoSpeed]);

  const handleDemoSpeedChange = (speed) => {
    setDemoSpeed(speed);
    setDemoSpeedState(speed);
  };

  // ---- getting off ----
  const startAlighting = useCallback(
    () => setStage((current) => (current === "riding" ? "alighting" : current)),
    []
  );

  useEffect(() => {
    if (stage !== "riding" || remainingM === null || initialRemainingRef.current === null) return;
    // Needs to have actually travelled; guards a jeep that starts near the stop.
    const travelled = initialRemainingRef.current - remainingM;
    if (remainingM <= ALIGHT_RADIUS_M && travelled > 300) startAlighting();
  }, [remainingM, stage, startAlighting]);

  // A jeep that reaches the end of its route is hidden from passengers and
  // vanishes from the live list (the yellow route ends at the final stop, so
  // this is how her last ride ends). Once she has seen her jeep and it then
  // disappears, that is her stop.
  useEffect(() => {
    if (boarded) {
      hasSeenJeepRef.current = true;
      return undefined;
    }
    if (stage !== "riding" || !hasSeenJeepRef.current) return undefined;
    const timer = setTimeout(startAlighting, 1500);
    return () => clearTimeout(timer);
  }, [boarded, stage, startAlighting]);

  useEffect(() => {
    if (stage !== "riding") return undefined;
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - lastSeenRef.current > LOST_JEEP_MS || now - legStartedAtRef.current > MAX_LEG_MS) {
        startAlighting();
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [stage, startAlighting]);

  const goToNextStep = useCallback(() => {
    if (stage === "alighting") {
      if (nextLeg) {
        navigate("/waiting", {
          state: {
            routeId: nextLeg.route_id,
            route,
            passengerType,
            tripSearch,
            legIndex: legIndex + 1,
          },
        });
      } else {
        setStage("final_walk");
      }
    } else if (stage === "final_walk") {
      setStage("arrived");
    }
  }, [stage, nextLeg, navigate, route, passengerType, tripSearch, legIndex]);

  useEffect(() => {
    if (stage === "alighting") {
      // Her jeep goes back to real time the moment she steps off.
      sendFleetSpeed(pickedUpBy, 1);
      const timer = setTimeout(goToNextStep, ALIGHT_NOTICE_MS);
      return () => clearTimeout(timer);
    }
    if (stage === "final_walk") {
      const timer = setTimeout(goToNextStep, FINAL_WALK_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [stage, pickedUpBy, goToNextStep]);

  // ---- what the panel says ----
  const destinationLabel = tripSearch?.destination ?? "your destination";
  const jeepCount = jeepLegs.length;

  let banner;
  if (stage === "riding") {
    banner = {
      statusLabel: "ON BOARD",
      heading: `You're on the ${legMeta.name} jeep`,
      subtext:
        remainingM !== null
          ? `${formatKm(remainingM)} to ${isLastLeg ? "your drop-off stop" : "your transfer stop"} · riding ${leg.route_name}`
          : `Picked up by the driver — riding ${leg.route_name}`,
    };
  } else if (stage === "alighting") {
    banner = isLastLeg
      ? {
          statusLabel: "DROP-OFF",
          heading: "Get off here",
          subtext: walkAfter
            ? `${Math.round(walkAfter.distance_m)} m walk to ${destinationLabel}`
            : `You've reached ${destinationLabel}`,
        }
      : {
          statusLabel: "TRANSFER",
          heading: `Get off — transfer to the ${nextMeta.name} jeep`,
          subtext: `Walk to the ${nextLeg.route_name} stop, then wait for the next ${nextMeta.name} jeep`,
        };
  } else if (stage === "final_walk") {
    banner = {
      statusLabel: "WALKING",
      heading: `Walk to ${destinationLabel}`,
      subtext: walkAfter
        ? `${Math.round(walkAfter.distance_m)} m · about ${Math.max(1, Math.round(walkAfter.duration_min))} min`
        : "Almost there",
    };
  } else {
    banner = {
      statusLabel: "TRIP COMPLETED",
      heading: "You've arrived!",
      subtext: `Thank you for riding with cAIabe — ${destinationLabel}`,
    };
  }

  // Waiting, then one ride step per jeep leg (with a transfer step between),
  // then the final walk and arrival: ride k is step 1+2k, the transfer into
  // leg k is step 2k, the final walk is step 2n, arrival is 2n+1.
  const steps = [{ id: "board", name: "Picked up at the stop", timestampLabel: "Done" }];
  jeepLegs.forEach((jeepLeg, index) => {
    const meta = getRouteColorMeta(jeepLeg.color, jeepLeg.route_name);
    if (index > 0) {
      steps.push({
        id: `transfer-${index}`,
        name: `Transfer to the ${meta.name} jeep`,
        timestampLabel: "Walk + wait",
      });
    }
    steps.push({
      id: `ride-${index}`,
      name: `Ride the ${meta.name} jeep`,
      timestampLabel: `${jeepLeg.route_name} · ${Math.round(jeepLeg.duration_min)} min`,
    });
  });
  steps.push({
    id: "walk",
    name: `Walk to ${destinationLabel}`,
    timestampLabel: walkAfter && isLastLeg ? `${Math.round(walkAfter.distance_m)} m` : "",
  });
  steps.push({ id: "arrive", name: "Arrive", timestampLabel: "" });

  let activeStepIndex;
  if (stage === "riding") activeStepIndex = 1 + 2 * legIndex;
  else if (stage === "alighting") activeStepIndex = isLastLeg ? 2 * jeepCount : 2 * (legIndex + 1);
  else if (stage === "final_walk") activeStepIndex = 2 * jeepCount;
  else activeStepIndex = 2 * jeepCount + 1;

  const fareSoFar = jeepLegs.slice(0, legIndex + 1).reduce((sum, jeepLeg) => sum + (jeepLeg.fare ?? 0), 0);
  const totalFare = route?.fare ?? fareSoFar;

  const handleAdvance = () => {
    if (stage === "riding") startAlighting();
    else if (stage === "arrived") navigate("/");
    else goToNextStep();
  };

  const handleSaveRoute = () => {
    if (!route?.cardKey) return;
    if (isSaved) {
      removeSavedRouteByKey(route.cardKey);
    } else {
      saveRoute({
        routeKey: route.cardKey,
        label: tripSearch ? `${tripSearch.origin} → ${tripSearch.destination}` : route.title,
        origin: tripSearch?.origin ?? "",
        destination: tripSearch?.destination ?? "",
        originPlace: tripSearch?.originPlace ?? null,
        destinationPlace: tripSearch?.destinationPlace ?? null,
        routeId: route.id,
      });
    }
    setIsSaved((previous) => !previous);
  };

  return (
    <main className="on-route-page">
      <div className="on-route-page__map-container">
        <MapView
          origin={tripSearch?.originPlace}
          destination={tripSearch?.destinationPlace}
          routes={route ? [route] : []}
          jeepneys={stage === "riding" && boarded ? [boarded] : []}
          zoom={14}
        />
        {stage !== "arrived" && <DemoSpeedChip speed={demoSpeed} onChange={handleDemoSpeedChange} />}
      </div>

      <div className="on-route-page__panel">
        <JourneyStatusBanner
          statusLabel={banner.statusLabel}
          heading={banner.heading}
          subtext={banner.subtext}
        />

        {stage === "riding" && (
          <div className="demo-ride-progress" aria-label="Progress to your stop">
            <div className="demo-ride-progress__track">
              <div className="demo-ride-progress__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <span className="demo-ride-progress__label">
              {isLastLeg ? "To your drop-off" : "To your transfer"} · {Math.round(progress * 100)}%
            </span>
          </div>
        )}

        {stage === "arrived" ? (
          <dl className="demo-ride-summary">
            <div>
              <dt>Total fare</dt>
              <dd>₱{totalFare.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Estimated trip time</dt>
              <dd>{Math.round(route?.travelMinutes ?? 0)} min</dd>
            </div>
            <div>
              <dt>Jeepneys</dt>
              <dd>
                {jeepCount}
                {route?.transferCount > 0 ? ` · ${route.transferCount} transfer` : ""}
              </dd>
            </div>
            {route?.carbon?.saved_co2_kg > 0 && (
              <div>
                <dt>CO₂ saved vs driving alone (est.)</dt>
                <dd>{route.carbon.saved_co2_kg.toFixed(2)} kg</dd>
              </div>
            )}
          </dl>
        ) : (
          <JourneyTimeline steps={steps} activeStepIndex={activeStepIndex} />
        )}

        <JourneyFareFooter
          fareSoFar={stage === "arrived" ? totalFare : fareSoFar}
          totalFare={totalFare}
          advanceButtonLabel={stage === "arrived" ? "Finish Trip" : "Skip ahead (demo)"}
          onAdvance={handleAdvance}
          onSaveRoute={handleSaveRoute}
          isRouteSaved={isSaved}
        />
      </div>
    </main>
  );
}

export default DemoOnRoute;
