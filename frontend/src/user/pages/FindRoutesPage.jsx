import { useEffect, useState } from "react";
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

// supabase-js's FunctionsHttpError.message is just a generic "non-2xx
// status code" wrapper — the actual { error: "..." } body our edge
// functions send back is only reachable via the raw Response on `.context`.
async function extractFunctionErrorMessage(error) {
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.json();
      if (body?.error) return body.error;
    } catch {
      // response wasn't JSON — fall through to the generic message
    }
  }
  return error?.message ?? null;
}

function FindRoutesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const restoredTripSearch = location.state?.tripSearch ?? null;
  const passengerType = location.state?.passengerType ?? "regular";

  // Always start on "search" — even when restoring a previous trip, so the
  // pre-filled fields + "Finding routes…" state show while the replay
  // search below is in flight, rather than flashing an empty results panel.
  const [viewMode, setViewMode] = useState("search");
  const [origin, setOrigin] = useState(restoredTripSearch?.origin ?? "");
  const [destination, setDestination] = useState(restoredTripSearch?.destination ?? "");
  const [originPlace, setOriginPlace] = useState(restoredTripSearch?.originPlace ?? null);
  const [destinationPlace, setDestinationPlace] = useState(restoredTripSearch?.destinationPlace ?? null);
  const [routes, setRoutes] = useState([]);
  const [focusedRoute, setFocusedRoute] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const runSearch = async (originForSearch, destinationForSearch) => {
    setIsSearching(true);
    setSearchError(null);

    const { data, error } = await supabase.functions.invoke("route-search", {
      body: {
        origin: { lat: originForSearch.lat, lng: originForSearch.lng },
        destination: { lat: destinationForSearch.lat, lng: destinationForSearch.lng },
        discount_type: passengerType,
      },
    });

    setIsSearching(false);

    if (error || data?.error) {
      // Stay on the search screen so the real reason is visible — switching
      // to the results view here would bury it behind a generic "no routes
      // found" empty state.
      const message = error ? await extractFunctionErrorMessage(error) : data.error;
      setSearchError(message ?? "Route search failed. Please try again.");
      setRoutes([]);
      return;
    }

    setRoutes(adaptRouteSearchResult(data));
    setViewMode("results");
  };

  // Restoring a previous search (e.g. "Go, other options" from the waiting
  // screen) only carries the origin/destination, not the fetched results —
  // re-run the search rather than showing an empty results panel.
  useEffect(() => {
    if (restoredTripSearch?.originPlace && restoredTripSearch?.destinationPlace) {
      runSearch(restoredTripSearch.originPlace, restoredTripSearch.destinationPlace);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectOriginPlace = (place) => {
    setOrigin(place.label);
    setOriginPlace(place);
  };

  const handleSelectDestinationPlace = (place) => {
    setDestination(place.label);
    setDestinationPlace(place);
  };

  const handleSwapPlaces = () => {
    setOrigin(destination);
    setDestination(origin);
    setOriginPlace(destinationPlace);
    setDestinationPlace(originPlace);
  };

  const handleApplySavedRoute = (savedRoute) => {
    setOrigin(savedRoute.origin);
    setDestination(savedRoute.destination);
    setOriginPlace(findPlaceByLabel(savedRoute.origin));
    setDestinationPlace(findPlaceByLabel(savedRoute.destination));
  };

  const handleFindRoutes = () => {
    if (!originPlace || !destinationPlace) {
      setSearchError("Pick an origin and destination from the suggestions first.");
      return;
    }
    runSearch(originPlace, destinationPlace);
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
        routes={
          viewMode === "results" ? (focusedRoute ? [focusedRoute] : routes) : []
        }
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
            onSwapPlaces={handleSwapPlaces}
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
            onFocusRoute={setFocusedRoute}
          />
        )}
      </div>
    </main>
  );
}

export default FindRoutesPage;
