import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MapView from "../../shared/components/MapView.jsx";
import WalkToBayCard from "../components/WalkToBayCard.jsx";
import NearestJeepCard from "../components/NearestJeepCard.jsx";
import { useLiveDriverPositions } from "../../shared/hooks/useLiveDriverPositions.js";
import { getRouteColorMeta } from "../../shared/utils/routeColorHelpers.js";
import { supabase } from "../../shared/lib/supabaseClient.js";
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

  const passengerPosition = livePassengerPosition ?? searchedOriginPosition;

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
    };

    fetchEta();
    const intervalId = setInterval(fetchEta, 15000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [waitingPhase, realRouteId, passengerPosition?.lat, passengerPosition?.lng]);

  const clearWaitingState = async () => {
    if (!waitingIdRef.current) return;
    const waitingId = waitingIdRef.current;
    waitingIdRef.current = null;
    await supabase.functions.invoke("waiting-clear", { body: { waiting_id: waitingId } });
  };

  const handleArrivedAtBay = async () => {
    setWaitingPhase("waiting_for_jeep");

    if (!realRouteId || !passengerPosition) return;

    const { data, error } = await supabase.functions.invoke("waiting-start", {
      body: {
        route_id: realRouteId,
        lat: passengerPosition.lat,
        lng: passengerPosition.lng,
        discount_type: passengerType,
      },
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
    navigate("/on-route", {
      state: {
        routeId: realRouteId,
        route: routeData,
        passengerType,
        tripSearch: location.state?.tripSearch,
      },
    });
  };

  // Authoritative Route Metadata & Seed Colors
  const routeMeta = getRouteColorMeta(
    routeData?.accentColor || routeData?.color,
    routeData?.title || routeData?.name
  );
  const routeName = routeData?.title || routeData?.name || `${routeMeta.name} Line`;
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

  const originLabel = location.state?.tripSearch?.origin || "Current Location";
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
    aiWaitRecommendation: {
      recommendationType: finalHasSeatsAvailable ? "go" : "wait",
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
      </div>

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
        />
      )}
    </main>
  );
}

export default WaitingForJeepPage;
