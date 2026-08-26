import { useState } from "react";
import { useLocation } from "react-router-dom";
import JourneyStatusBanner from "../components/JourneyStatusBanner.jsx";
import JourneyTimeline from "../components/JourneyTimeline.jsx";
import JourneyFareFooter from "../components/JourneyFareFooter.jsx";
import { ROUTE_OPTIONS_FIXTURE } from "../../shared/constants/tripSearchFixtures.js";
import "./OnRoutePage.css";

function findRouteWithJourney(routeId) {
  return ROUTE_OPTIONS_FIXTURE.find((route) => route.id === routeId && route.onRouteJourney);
}

function OnRoutePage() {
  const location = useLocation();

  const selectedRoute =
    findRouteWithJourney(location.state?.routeId) ??
    ROUTE_OPTIONS_FIXTURE.find((route) => route.onRouteJourney);

  const { steps, phaseOrder, phases } = selectedRoute.onRouteJourney;

  const [currentPhaseKey, setCurrentPhaseKey] = useState(
    location.state?.initialPhaseKey ?? phaseOrder[0]
  );
  const currentPhase = phases[currentPhaseKey];

  const handleAdvance = () => {
    if (currentPhase.nextPhaseKey) {
      setCurrentPhaseKey(currentPhase.nextPhaseKey);
    }
  };

  const handleSaveRoute = () => {};

  return (
    <main className="on-route-page">
      <div className="on-route-page__panel">
        <JourneyStatusBanner
          statusLabel={currentPhase.statusLabel}
          heading={currentPhase.heading}
          subtext={currentPhase.subtext}
        />
        <JourneyTimeline steps={steps} activeStepIndex={currentPhase.activeStepIndex} />
        <JourneyFareFooter
          fareSoFar={currentPhase.fareSoFar}
          totalFare={selectedRoute.fare}
          advanceButtonLabel={currentPhase.advanceButtonLabel}
          onAdvance={handleAdvance}
          onSaveRoute={handleSaveRoute}
        />
      </div>
    </main>
  );
}

export default OnRoutePage;
