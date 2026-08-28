import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MapView from "../../shared/components/MapView.jsx";
import JourneyStatusBanner from "../components/JourneyStatusBanner.jsx";
import JourneyTimeline from "../components/JourneyTimeline.jsx";
import JourneyFareFooter from "../components/JourneyFareFooter.jsx";
import { ROUTE_OPTIONS_FIXTURE } from "../../shared/constants/tripSearchFixtures.js";
import { useLiveDriverPositions } from "../../shared/hooks/useLiveDriverPositions.js";
import { getRouteColorMeta } from "../../shared/utils/routeColorHelpers.js";
import "./OnRoutePage.css";

function findRouteWithJourney(routeId) {
  return ROUTE_OPTIONS_FIXTURE.find((route) => route.id === routeId && route.onRouteJourney);
}

function OnRoutePage() {
  const location = useLocation();
  const navigate = useNavigate();

  const passedRoute = location.state?.route ?? null;
  const realRouteId = location.state?.routeId ?? passedRoute?.id ?? null;

  const selectedRoute =
    findRouteWithJourney(realRouteId) ??
    passedRoute ??
    ROUTE_OPTIONS_FIXTURE.find((route) => route.onRouteJourney);

  const routeMeta = getRouteColorMeta(
    passedRoute?.accentColor || passedRoute?.color,
    passedRoute?.title || passedRoute?.name
  );
  const routeName = passedRoute?.title || passedRoute?.name || selectedRoute?.title || `${routeMeta.name} Line`;

  const originMarker =
    location.state?.tripSearch?.originPlace ??
    passedRoute?.mapSegments?.[0]?.points?.[0] ?? { lat: 15.147, lng: 120.585 };

  const destinationMarker =
    location.state?.tripSearch?.destinationPlace ??
    passedRoute?.destinationPlace ??
    passedRoute?.mapSegments?.[0]?.points?.slice(-1)[0] ??
    null;

  const { jeepneys } = useLiveDriverPositions(realRouteId);

  const journeyData = selectedRoute.onRouteJourney || {
    phaseOrder: ["riding", "approaching_stop", "alight"],
    phases: {
      riding: {
        statusLabel: "ON ROUTE",
        heading: `Riding the ${routeMeta.name} Jeep`,
        subtext: `Traveling along ${routeName} towards destination`,
        fareSoFar: passedRoute?.fare || 15.0,
        advanceButtonLabel: "Approaching Stop",
        nextPhaseKey: "approaching_stop",
        activeStepIndex: 1,
      },
      approaching_stop: {
        statusLabel: "NEXT STOP",
        heading: "Prepare to alight",
        subtext: "Signal 'Para po' when nearing your destination",
        fareSoFar: passedRoute?.fare || 15.0,
        advanceButtonLabel: "Arrived at Destination",
        nextPhaseKey: "alight",
        activeStepIndex: 2,
      },
      alight: {
        statusLabel: "TRIP COMPLETED",
        heading: "You have arrived!",
        subtext: "Thank you for riding with cAIabe",
        fareSoFar: passedRoute?.fare || 15.0,
        advanceButtonLabel: "Finish Trip",
        nextPhaseKey: null,
        activeStepIndex: 3,
      },
    },
    steps: [
      { stepNumber: 1, title: "Boarded at Bay", time: "Completed" },
      { stepNumber: 2, title: `Riding ${routeMeta.name} Jeep (${routeName})`, time: "In Progress" },
      { stepNumber: 3, title: "Alight at Destination", time: "Estimated ~10 min" },
    ],
  };

  const { steps, phaseOrder, phases } = journeyData;

  const [currentPhaseKey, setCurrentPhaseKey] = useState(
    location.state?.initialPhaseKey ?? phaseOrder[0]
  );
  const currentPhase = phases[currentPhaseKey] || phases[phaseOrder[0]];

  const handleAdvance = () => {
    if (currentPhase.nextPhaseKey) {
      setCurrentPhaseKey(currentPhase.nextPhaseKey);
    } else {
      navigate("/");
    }
  };

  const handleSaveRoute = () => {};

  return (
    <main className="on-route-page">
      <div className="on-route-page__map-container">
        <MapView
          origin={originMarker}
          destination={destinationMarker}
          routes={passedRoute ? [passedRoute] : []}
          jeepneys={jeepneys}
          center={originMarker ?? undefined}
          zoom={14}
          showDirections={!passedRoute?.mapSegments?.length && Boolean(originMarker && destinationMarker)}
        />
      </div>

      <div className="on-route-page__panel">
        <JourneyStatusBanner
          statusLabel={currentPhase.statusLabel}
          heading={currentPhase.heading}
          subtext={currentPhase.subtext}
        />
        <JourneyTimeline steps={steps} activeStepIndex={currentPhase.activeStepIndex} />
        <JourneyFareFooter
          fareSoFar={currentPhase.fareSoFar}
          totalFare={passedRoute?.fare || selectedRoute.fare || 15.0}
          advanceButtonLabel={currentPhase.advanceButtonLabel}
          onAdvance={handleAdvance}
          onSaveRoute={handleSaveRoute}
        />
      </div>
    </main>
  );
}

export default OnRoutePage;
