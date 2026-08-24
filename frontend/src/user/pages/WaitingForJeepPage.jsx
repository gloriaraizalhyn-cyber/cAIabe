import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import JeepWaitingMapCanvas from "../components/JeepWaitingMapCanvas.jsx";
import WalkToBayCard from "../components/WalkToBayCard.jsx";
import NearestJeepCard from "../components/NearestJeepCard.jsx";
import { ROUTE_OPTIONS_FIXTURE } from "../../shared/constants/tripSearchFixtures.js";
import "./WaitingForJeepPage.css";

function WaitingForJeepPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const selectedRoute =
    ROUTE_OPTIONS_FIXTURE.find((route) => route.id === location.state?.routeId) ??
    ROUTE_OPTIONS_FIXTURE[0];

  const [waitingPhase, setWaitingPhase] = useState("walking_to_bay");

  const handleArrivedAtBay = () => {
    setWaitingPhase("waiting_for_jeep");
  };

  const handleSeeOtherOptions = () => {
    navigate("/routes", { state: { tripSearch: location.state?.tripSearch } });
  };

  const handleWaitForJeep = () => {
    navigate("/on-route", { state: { routeId: selectedRoute.id } });
  };

  return (
    <main className="waiting-for-jeep-page">
      <JeepWaitingMapCanvas waitingPhase={waitingPhase} waitingAtBay={selectedRoute.waitingAtBay} />

      {waitingPhase === "walking_to_bay" ? (
        <WalkToBayCard
          stepNumber={1}
          totalSteps={selectedRoute.legs.length}
          waitingAtBay={selectedRoute.waitingAtBay}
          onArrivedAtBay={handleArrivedAtBay}
        />
      ) : (
        <NearestJeepCard
          waitingAtBay={selectedRoute.waitingAtBay}
          onWaitForJeep={handleWaitForJeep}
          onSeeOtherOptions={handleSeeOtherOptions}
        />
      )}
    </main>
  );
}

export default WaitingForJeepPage;
