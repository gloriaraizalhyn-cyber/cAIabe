import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MapView from "../../shared/components/MapView.jsx";
import WalkToBayCard from "../components/WalkToBayCard.jsx";
import NearestJeepCard from "../components/NearestJeepCard.jsx";
import { useLiveDriverPositions } from "../../shared/hooks/useLiveDriverPositions.js";
import { useMovementDetector } from "../../shared/hooks/useMovementDetector.js";
import { getRouteColorMeta } from "../../shared/utils/routeColorHelpers.js";
import { supabase } from "../../shared/lib/supabaseClient.js";
import { isDemoPassengerFrame } from "../../demo/demoTripParams.js";
import { getDemoSpeed, sendFleetSpeed, setDemoSpeed } from "../../demo/lib/demoFleetCommands.js";
import DemoSpeedChip from "../components/DemoSpeedChip.jsx";
import "./WaitingForJeepPage.css";

function haversineDistanceKm(p1, p2) {
  const R = 6371;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Demo stage only: how close an open jeep must get to the waiting passenger
// to pick her up, and how long the "picked up" message shows before the
// screen switches to the riding view.
const DEMO_PICKUP_RADIUS_KM = 0.1;
const DEMO_PICKUP_NOTICE_MS = 2500;
// Transfer: how long the "walk to the next stop" step shows before she starts waiting there.
const DEMO_TRANSFER_WALK_MS = 4500;

function WaitingForJeepPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const passedRoute = location.state?.route ?? null;
  const [routeData, setRouteData] = useState(passedRoute);

  const realRouteId = location.state?.routeId ?? passedRoute?.id ?? null;
  const passengerType = location.state?.passengerType ?? "regular";
  const searchedOriginPosition = location.state?.tripSearch?.originPlace ?? null;
  const searchedDestinationPosition = location.state?.tripSearch?.destinationPlace ?? null;

  // Fetch route details if only routeId was passed
  useEffect(() => {
    if (!routeData && realRouteId) {
      supabase
        .from("routes")
        .select("id, name, color")
        .eq("id", realRouteId)
        .single()
        .then(({ data }) => {
          if (data) {
            setRouteData({
              id: data.id,
              title: data.name,
              accentColor: data.color,
              jeepColorName: data.color,
              legs: [{ id: "leg-1", kind: "jeep", title: `${data.name} jeepney` }],
            });
          }
        });
    }
  }, [realRouteId, routeData]);

  // Multi-leg trips (demo stage): which jeep leg of the itinerary this screen
  // is for. 0 is the first jeep she boards; 1+ are transfers, where she walks
  // to the next route's stop instead of waiting where she searched from.
  const legIndex = location.state?.legIndex ?? 0;
  const jeepLegs = useMemo(
    () => (routeData?.itinerary ?? []).filter((leg) => leg.kind === "jeep"),
    [routeData]
  );
  const activeLeg = jeepLegs[legIndex] ?? null;
  const isTransferLeg = legIndex > 0 && Boolean(activeLeg);
  const transferWalk = useMemo(() => {
    if (!isTransferLeg) return null;
    const itinerary = routeData?.itinerary ?? [];
    const legPosition = itinerary.indexOf(activeLeg);
    const previous = itinerary[legPosition - 1];
    return previous?.kind === "walk" ? previous : null;
  }, [isTransferLeg, routeData, activeLeg]);

  const [livePassengerPosition, setLivePassengerPosition] = useState(null);
  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLivePassengerPosition({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // A transfer waits at the next route's stop, not where she first searched
  // from (the stage's panes have no real GPS to override it either).
  const passengerPosition = isTransferLeg
    ? { lat: activeLeg.from.lat, lng: activeLeg.from.lng }
    : (livePassengerPosition ?? searchedOriginPosition);

  // Track ALL active jeepneys strictly for this selected route
  const { jeepneys, isConnected } = useLiveDriverPositions(realRouteId);

  const [waitingPhase, setWaitingPhase] = useState("walking_to_bay");
  const waitingIdRef = useRef(null);

  // Precise, road-network ETA to the nearest live jeepney via Google's
  // Routes API — replaces the straight-line/assumed-speed guess below once
  // it lands. Polled while actually waiting at the bay; the haversine guess
  // stays as the instant fallback until the first response arrives (or if
  // the call ever fails).
  const [preciseEta, setPreciseEta] = useState(null);

  // AI wait/go call from the same nearby-jeepney-eta poll (Gemini-backed
  // server-side, with a deterministic fallback baked into the function
  // itself) — null until the first response lands, same as preciseEta.
  const [aiRecommendation, setAiRecommendation] = useState(null);

  useEffect(() => {
    if (waitingPhase !== "waiting_for_jeep" || !realRouteId || !passengerPosition) {
      return undefined;
    }

    let cancelled = false;

    const fetchEta = async () => {
      const { data, error } = await supabase.functions.invoke("nearby-jeepney-eta", {
        body: { route_id: realRouteId, lat: passengerPosition.lat, lng: passengerPosition.lng },
      });
      if (cancelled || error || !data?.etas?.length) return;

      const nearest = data.etas[0];
      setPreciseEta({
        distanceKm: nearest.distance_meters / 1000,
        etaMinutes: Math.max(1, Math.round(nearest.duration_seconds / 60)),
        hasSeatsAvailable: nearest.capacity_state !== "full",
      });

      if (data.recommendation) {
        setAiRecommendation({
          recommendationType: data.recommendation.recommendation,
          headline: data.recommendation.headline,
          body: data.recommendation.body,
        });
      }
    };

    fetchEta();
    const intervalId = setInterval(fetchEta, 30000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [waitingPhase, realRouteId, passengerPosition?.lat, passengerPosition?.lng]);

  // Driver-side "Wait for more" notice (see NextToGoPage.jsx / driver-notify-wait) —
  // tells a waiting passenger this unit likely won't leave soon, without
  // ever revealing the driver's actual passenger count.
  const [driverWaitNotice, setDriverWaitNotice] = useState(null);
  useEffect(() => {
    if (!realRouteId) return undefined;
    const channel = supabase
      .channel(`route:${realRouteId}:waiting`)
      .on("broadcast", { event: "driver_wait_notice" }, ({ payload }) => {
        setDriverWaitNotice({ estimatedDelayMinutes: payload.estimated_delay_minutes });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [realRouteId]);

  // Demo stage only. The stage's panes have geolocation blocked, so the
  // GPS-speed boarding detection below can never fire there. Instead, once the
  // passenger has tapped "I'm here", the first live jeep that still has seats
  // open (not "full") and reaches her bay picks her up automatically. A full
  // jeep drives past, exactly as it would in real life.
  const isDemoPassenger = isDemoPassengerFrame();
  const [pickedUpBy, setPickedUpBy] = useState(null);

  // A loop route can pass the same stop twice (the grey route passes Astro
  // Park once heading toward the transfer, and again near the end of its
  // lap, where the jeep finishes its route at the terminal before ever
  // reaching her destination). Only a jeep heading the way the planned ride
  // goes can pick her up, so each jeep's heading is compared with the first
  // stretch of the leg's own path. Needs a previous position, so a jeep is
  // judged from its second update onward.
  const lastJeepPositionsRef = useRef({});

  useEffect(() => {
    if (!isDemoPassenger || waitingPhase !== "waiting_for_jeep" || pickedUpBy || !passengerPosition) return;

    const legPath = activeLeg?.path ?? [];
    const cosLat = Math.cos((passengerPosition.lat * Math.PI) / 180);
    const legStart = legPath[0];
    const legAhead = legPath[Math.min(8, legPath.length - 1)];
    const legHeading =
      legStart && legAhead
        ? { x: (legAhead.lng - legStart.lng) * cosLat, y: legAhead.lat - legStart.lat }
        : null;

    let arriving = null;
    for (const jeep of jeepneys) {
      // This effect re-runs on every render, so only shift a jeep's stored
      // position when it has actually moved; otherwise "previous" would
      // always equal "current" and no heading could ever be read.
      const tracked = lastJeepPositionsRef.current[jeep.id];
      if (!tracked) {
        lastJeepPositionsRef.current[jeep.id] = { lat: jeep.lat, lng: jeep.lng, previous: null };
      } else if (tracked.lat !== jeep.lat || tracked.lng !== jeep.lng) {
        lastJeepPositionsRef.current[jeep.id] = {
          lat: jeep.lat,
          lng: jeep.lng,
          previous: { lat: tracked.lat, lng: tracked.lng },
        };
      }
      const previous = lastJeepPositionsRef.current[jeep.id].previous;

      if (jeep.capacityState === "full") continue;
      if (haversineDistanceKm(passengerPosition, { lat: jeep.lat, lng: jeep.lng }) > DEMO_PICKUP_RADIUS_KM) continue;

      if (legHeading) {
        if (!previous) continue;
        const moved = { x: (jeep.lng - previous.lng) * cosLat, y: jeep.lat - previous.lat };
        if (moved.x === 0 && moved.y === 0) continue;
        const goesTheRightWay = moved.x * legHeading.x + moved.y * legHeading.y > 0;
        if (!goesTheRightWay) continue;
      }
      arriving = jeep;
      break;
    }
    if (arriving) setPickedUpBy(arriving.id);
  }, [isDemoPassenger, waitingPhase, pickedUpBy, passengerPosition, jeepneys, activeLeg]);

  useEffect(() => {
    if (!pickedUpBy) return undefined;
    const timer = setTimeout(async () => {
      await clearWaitingState();
      navigate("/on-route", {
        state: {
          routeId: realRouteId,
          route: routeData,
          passengerType,
          tripSearch: location.state?.tripSearch,
          pickedUpBy,
          legIndex,
        },
      });
    }, DEMO_PICKUP_NOTICE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedUpBy]);

  const clearWaitingState = async () => {
    if (!waitingIdRef.current) return;
    const waitingId = waitingIdRef.current;
    waitingIdRef.current = null;
    await supabase.functions.invoke("waiting-clear", { body: { waiting_id: waitingId } });
  };

  // Committing to a jeep ("Wait for this jeep") doesn't mean you're on board
  // yet — it just starts watching your own GPS for the sustained, vehicle
  // speed movement that means the jeep actually pulled away with you on it.
  // Detection only runs once committed (see the `null` gate below), so
  // walking to/around the bay beforehand can't false-trigger it.
  const [isWatchingForDeparture, setIsWatchingForDeparture] = useState(false);
  const hasStartedMoving = useMovementDetector(isWatchingForDeparture ? passengerPosition : null);

  useEffect(() => {
    if (!hasStartedMoving) return;
    (async () => {
      await clearWaitingState();
      navigate("/on-route", {
        state: {
          routeId: realRouteId,
          route: routeData,
          passengerType,
          tripSearch: location.state?.tripSearch,
        },
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStartedMoving]);

  const handleArrivedAtBay = async () => {
    setWaitingPhase("waiting_for_jeep");

    if (!realRouteId || !passengerPosition) return;

    const { data, error } = await supabase.functions.invoke("waiting-start", {
      body: {
        route_id: realRouteId,
        lat: passengerPosition.lat,
        lng: passengerPosition.lng,
        discount_type: passengerType,
        // Feeds the carbon impact panel's "rider trips" count — distance
        // only, never location. Absent for fixture routes (no carbon).
        // A transfer leg sends none: the trip is already counted once, at the
        // first boarding.
        ride_distance_km: isTransferLeg ? undefined : passedRoute?.carbon?.ride_distance_km,
      },
    });
    if (!error && data?.waiting_id) {
      waitingIdRef.current = data.waiting_id;
    }
  };

  // ---- demo stage: transfer walk + fast-forward ----
  const [demoSpeed, setDemoSpeedState] = useState(getDemoSpeed);
  const handleDemoSpeedChange = (speed) => {
    setDemoSpeed(speed);
    setDemoSpeedState(speed);
  };

  // After getting off the first jeep she walks to the next route's stop;
  // the walk is shown for a few seconds, then she starts waiting there
  // exactly as if she had tapped "I'm here".
  useEffect(() => {
    if (!isDemoPassenger || !isTransferLeg || waitingPhase !== "walking_to_bay") return undefined;
    const timer = setTimeout(handleArrivedAtBay, DEMO_TRANSFER_WALK_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoPassenger, isTransferLeg, waitingPhase]);

  // While she waits, fast-forward the route's jeeps toward her and keep their
  // seats open, so the unit that reaches her can actually pick her up. The
  // speed is reset when she boards (see DemoOnRoute).
  useEffect(() => {
    if (!isDemoPassenger || waitingPhase !== "waiting_for_jeep" || pickedUpBy) return;
    sendFleetSpeed(activeLeg?.route_name, demoSpeed, { openSeats: true });
  }, [isDemoPassenger, waitingPhase, pickedUpBy, activeLeg?.route_name, demoSpeed]);

  const handleSeeOtherOptions = async () => {
    await clearWaitingState();
    navigate("/routes", { state: { tripSearch: location.state?.tripSearch } });
  };

  const handleWaitForJeep = () => {
    setIsWatchingForDeparture(true);
  };

  // Authoritative Route Metadata & Seed Colors
  const routeMeta = getRouteColorMeta(
    isTransferLeg ? activeLeg.color : routeData?.accentColor || routeData?.color,
    isTransferLeg ? activeLeg.route_name : routeData?.title || routeData?.name
  );
  const routeName = isTransferLeg
    ? activeLeg.route_name
    : routeData?.title || routeData?.name || `${routeMeta.name} Line`;
  const jeepColorName = routeMeta.name;

  // Origin (A) and Destination (B) Markers
  const originMarker =
    passengerPosition ??
    searchedOriginPosition ??
    routeData?.mapSegments?.[0]?.points?.[0] ?? { lat: 15.147, lng: 120.585 };

  const destinationMarker =
    searchedDestinationPosition ??
    routeData?.destinationPlace ??
    routeData?.mapSegments?.[0]?.points?.slice(-1)[0] ??
    null;

  const originLabel = isTransferLeg ? "Transfer stop" : location.state?.tripSearch?.origin || "Current Location";
  const destinationLabel = location.state?.tripSearch?.destination || "Destination Point";

  // AI Estimated Travel & Arrival Time
  const travelMinutes = routeData?.travelMinutes || 15;
  const now = new Date();
  const arrivalDate = new Date(now.getTime() + travelMinutes * 60000);
  const arrivalTime = arrivalDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  // Compute live nearest jeepney
  let nearestDistKm = 1.2;
  let hasSeatsAvailable = true;

  if (jeepneys.length > 0 && passengerPosition) {
    let minDist = Infinity;
    jeepneys.forEach((jeep) => {
      const d = haversineDistanceKm(passengerPosition, { lat: jeep.lat, lng: jeep.lng });
      if (d < minDist) {
        minDist = d;
        hasSeatsAvailable = jeep.capacityState !== "full";
      }
    });
    if (minDist !== Infinity) nearestDistKm = minDist;
  }

  const etaMinutes = Math.max(1, Math.round(nearestDistKm / 0.35));

  // Prefer the precise Routes-API ETA once it's available; fall back to the
  // straight-line estimate above until then (or if the call fails).
  const finalDistanceKm = preciseEta?.distanceKm ?? nearestDistKm;
  const finalEtaMinutes = preciseEta?.etaMinutes ?? etaMinutes;
  const finalHasSeatsAvailable = preciseEta?.hasSeatsAvailable ?? hasSeatsAvailable;

  const dynamicWaitingAtBay = {
    bayName: routeData?.bayName || "Terminal Loading Bay",
    jeepneyLineCode: routeName,
    jeepColorName: jeepColorName,
    nearestJeep: {
      etaMinutes: finalEtaMinutes,
      distanceKm: finalDistanceKm.toFixed(1),
      hasSeatsAvailable: finalHasSeatsAvailable,
    },
    // Server-side (Gemini-backed) recommendation from the nearby-jeepney-eta
    // poll takes precedence once it lands; this local guess only covers the
    // walking-to-bay phase and the brief window before the first response.
    // recommendationType follows nearby-jeepney-eta's convention, which is
    // the opposite of what it sounds like: "wait" is the reassuring case (a
    // boardable jeep is close, stand by) and "go" is the warning case (this
    // one's full or too far — consider other options) — see
    // decideRecommendation() there. NearestJeepCard's tone mapping
    // (isGoRecommendation → "urgent") is written for that convention, so
    // getting this backwards here is what made a FULL jeep flash a calm
    // green note for the instant before the real server recommendation
    // lands.
    aiWaitRecommendation: aiRecommendation ?? {
      recommendationType: finalHasSeatsAvailable ? "wait" : "go",
      headline: finalHasSeatsAvailable
        ? `The jeepney you are waiting for is color ${jeepColorName}`
        : `${jeepColorName} Jeep Approaching — Next Unit Behind`,
      body: finalHasSeatsAvailable
        ? `The incoming ${jeepColorName} jeepney (${routeName}) has seats open and is approximately ${finalEtaMinutes} min away (${finalDistanceKm.toFixed(1)} km). Head to the bay to board.`
        : `The closest ${jeepColorName} jeep is at full capacity. Please stand by at the bay as the next available unit is approaching on this route.`,
    },
  };

  return (
    <main className="waiting-for-jeep-page">
      {/* Live Map View with Marker A, Marker B, Route Polyline, and Moving Jeeps */}
      <MapView
        origin={originMarker}
        destination={destinationMarker}
        routes={routeData ? [routeData] : []}
        jeepneys={jeepneys}
        center={originMarker ?? undefined}
        zoom={15}
        showDirections={!routeData?.mapSegments?.length && Boolean(originMarker && destinationMarker)}
      />

      {/* Floating AI Route & Navigation Guide Banner */}
      <div className="waiting-for-jeep-page__nav-guide">
        <div className="waiting-for-jeep-page__nav-top">
          <span
            className="waiting-for-jeep-page__route-badge"
            style={{
              background: routeMeta.badgeBg,
              borderColor: routeMeta.badgeBorder,
              color: routeMeta.badgeText,
            }}
          >
            <span
              className="waiting-for-jeep-page__route-dot"
              style={{ background: routeMeta.hex }}
            />
            {routeMeta.name} Jeep
          </span>
          <span className="waiting-for-jeep-page__route-title">{routeName}</span>
        </div>

        <div className="waiting-for-jeep-page__nav-locations">
          <div className="waiting-for-jeep-page__loc-item">
            <span className="waiting-for-jeep-page__loc-pin waiting-for-jeep-page__loc-pin--a">A</span>
            <span className="waiting-for-jeep-page__loc-text" title={originLabel}>
              {originLabel}
            </span>
          </div>
          <span className="waiting-for-jeep-page__loc-arrow">➔</span>
          <div className="waiting-for-jeep-page__loc-item">
            <span className="waiting-for-jeep-page__loc-pin waiting-for-jeep-page__loc-pin--b">B</span>
            <span className="waiting-for-jeep-page__loc-text" title={destinationLabel}>
              {destinationLabel}
            </span>
          </div>
        </div>

        <div className="waiting-for-jeep-page__nav-eta">
          <span className="waiting-for-jeep-page__eta-badge">✨ AI Route Guide</span>
          <span className="waiting-for-jeep-page__eta-text">
            Estimated arrival in <strong>~{travelMinutes} min</strong> ({arrivalTime})
          </span>
        </div>

        {driverWaitNotice && (
          <div className="waiting-for-jeep-page__wait-notice">
            <span>⏳</span>
            <p>
              This {jeepColorName} unit likely won't leave for about{" "}
              <strong>{driverWaitNotice.estimatedDelayMinutes} more minutes</strong>.
            </p>
            <button
              type="button"
              className="waiting-for-jeep-page__wait-notice-dismiss"
              onClick={() => setDriverWaitNotice(null)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {isDemoPassenger && isTransferLeg && waitingPhase === "walking_to_bay" && !pickedUpBy && (
        <div className="waiting-for-jeep-page__pickup-banner waiting-for-jeep-page__pickup-banner--transfer" role="status">
          <span aria-hidden="true">🚶</span>
          <div>
            <strong>Transfer — walk to the {jeepColorName} jeep stop</strong>
            <span>
              {transferWalk ? `About ${Math.round(transferWalk.distance_m)} m (${Math.round(transferWalk.duration_min)} min). ` : ""}
              Then wait for the next {jeepColorName} jeep.
            </span>
          </div>
        </div>
      )}

      {isDemoPassenger && <DemoSpeedChip speed={demoSpeed} onChange={handleDemoSpeedChange} />}

      {pickedUpBy && (
        <div className="waiting-for-jeep-page__pickup-banner" role="status">
          <span aria-hidden="true">🚐</span>
          <div>
            <strong>Picked up — you're on the {jeepColorName} jeep</strong>
            <span>The driver has you on board. Starting your ride…</span>
          </div>
        </div>
      )}

      {realRouteId && jeepneys.length === 0 && (
        <p className="waiting-for-jeep-page__live-status">
          {isConnected ? `Connected — waiting for ${jeepColorName} jeep GPS broadcasts…` : "Connecting…"}
        </p>
      )}

      {waitingPhase === "walking_to_bay" ? (
        <WalkToBayCard
          stepNumber={1}
          totalSteps={routeData?.legs?.length || 2}
          waitingAtBay={dynamicWaitingAtBay}
          onArrivedAtBay={handleArrivedAtBay}
        />
      ) : (
        <NearestJeepCard
          waitingAtBay={dynamicWaitingAtBay}
          onWaitForJeep={handleWaitForJeep}
          onSeeOtherOptions={handleSeeOtherOptions}
          isWatchingForDeparture={isWatchingForDeparture}
        />
      )}
    </main>
  );
}

export default WaitingForJeepPage;
