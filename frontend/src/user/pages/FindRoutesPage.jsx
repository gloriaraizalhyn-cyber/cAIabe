import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MapView from "../../shared/components/MapView.jsx";
import TripSearchCard from "../components/TripSearchCard.jsx";
import TripResultsPanel from "../components/TripResultsPanel.jsx";
import { PLACE_SUGGESTIONS_FIXTURE } from "../../shared/constants/tripSearchFixtures.js";
import { adaptRouteSearchResult } from "../utils/adaptRouteSearchResult.js";
import { supabase } from "../../shared/lib/supabaseClient.js";
import "./FindRoutesPage.css";

function findPlaceByLabel(label) {
  return PLACE_SUGGESTIONS_FIXTURE.find((place) => place.label === label) ?? null;
}

function FindRoutesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const restoredTripSearch = location.state?.tripSearch ?? null;
  const passengerType = location.state?.passengerType ?? "regular";

  const [viewMode, setViewMode] = useState(restoredTripSearch ? "results" : "search");
  const [origin, setOrigin] = useState(restoredTripSearch?.origin ?? "");
  const [destination, setDestination] = useState(restoredTripSearch?.destination ?? "");
  const [originPlace, setOriginPlace] = useState(restoredTripSearch?.originPlace ?? null);
  const [destinationPlace, setDestinationPlace] = useState(restoredTripSearch?.destinationPlace ?? null);
  const [routes, setRoutes] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

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

  const handleFindRoutes = async () => {
    if (!originPlace || !destinationPlace) {
      setSearchError("Pick an origin and destination from the suggestions first.");
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    const { data, error } = await supabase.functions.invoke("route-search", {
      body: {
        origin: { lat: originPlace.lat, lng: originPlace.lng },
        destination: { lat: destinationPlace.lat, lng: destinationPlace.lng },
        discount_type: passengerType,
      },
    });

    setIsSearching(false);

    if (error || data?.error) {
      // Stay on the search screen so the real reason is visible — switching
      // to the results view here would bury it behind a generic "no routes
      // found" empty state.
      setSearchError(error?.message ?? data.error ?? "Route search failed. Please try again.");
      setRoutes([]);
      return;
    }

    setRoutes(adaptRouteSearchResult(data));
    setViewMode("results");
  };

  const handleEditTrip = () => {
    setViewMode("search");
  };

  const handleTakeRoute = (route) => {
    navigate("/waiting", {
      state: {
        routeId: route.id,
        passengerType,
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
        routes={viewMode === "results" ? routes : []}
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
            isSearching={isSearching}
            searchError={searchError}
          />
        ) : (
          <TripResultsPanel
            origin={origin}
            destination={destination}
            routes={routes}
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
