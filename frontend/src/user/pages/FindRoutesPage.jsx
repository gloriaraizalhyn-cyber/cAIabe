import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MapView from "../../shared/components/MapView.jsx";
import TripSearchCard from "../components/TripSearchCard.jsx";
import TripResultsPanel from "../components/TripResultsPanel.jsx";
import {
  PLACE_SUGGESTIONS_FIXTURE,
  ROUTE_OPTIONS_FIXTURE,
} from "../../shared/constants/tripSearchFixtures.js";
import "./FindRoutesPage.css";

function findPlaceByLabel(label) {
  return PLACE_SUGGESTIONS_FIXTURE.find((place) => place.label === label) ?? null;
}

function FindRoutesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const restoredTripSearch = location.state?.tripSearch ?? null;

  const [viewMode, setViewMode] = useState(restoredTripSearch ? "results" : "search");
  const [origin, setOrigin] = useState(restoredTripSearch?.origin ?? "");
  const [destination, setDestination] = useState(restoredTripSearch?.destination ?? "");
  const [originPlace, setOriginPlace] = useState(restoredTripSearch?.originPlace ?? null);
  const [destinationPlace, setDestinationPlace] = useState(restoredTripSearch?.destinationPlace ?? null);

  const handleSelectOriginPlace = (place) => {
    setOrigin(place.label);
    setOriginPlace(place);
  };

  const handleSelectDestinationPlace = (place) => {
    setDestination(place.label);
    setDestinationPlace(place);
  };

  const handleApplySavedRoute = (savedRoute) => {
    setOrigin(savedRoute.origin);
    setDestination(savedRoute.destination);
    setOriginPlace(findPlaceByLabel(savedRoute.origin));
    setDestinationPlace(findPlaceByLabel(savedRoute.destination));
  };

  const handleFindRoutes = () => {
    setViewMode("results");
  };

  const handleEditTrip = () => {
    setViewMode("search");
  };

  const handleTakeRoute = (route) => {
    navigate("/waiting", {
      state: {
        routeId: route.id,
        tripSearch: { origin, destination, originPlace, destinationPlace },
      },
    });
  };
  const handleSaveRoute = () => {};

  return (
    <main className="find-routes-page">
      <MapView
        origin={originPlace}
        destination={destinationPlace}
        routes={viewMode === "results" ? ROUTE_OPTIONS_FIXTURE : []}
      />

      <div className="find-routes-page__overlay">
        {viewMode === "search" ? (
          <TripSearchCard
            origin={origin}
            destination={destination}
            onOriginChange={setOrigin}
            onDestinationChange={setDestination}
            onSelectOriginPlace={handleSelectOriginPlace}
            onSelectDestinationPlace={handleSelectDestinationPlace}
            onApplySavedRoute={handleApplySavedRoute}
            onFindRoutes={handleFindRoutes}
          />
        ) : (
          <TripResultsPanel
            origin={origin}
            destination={destination}
            onEditTrip={handleEditTrip}
            onTakeRoute={handleTakeRoute}
            onSaveRoute={handleSaveRoute}
          />
        )}
      </div>
    </main>
  );
}

export default FindRoutesPage;
