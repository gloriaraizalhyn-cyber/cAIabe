import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MapView from "../../shared/components/MapView.jsx";
import TripSearchCard from "../components/TripSearchCard.jsx";
import TripResultsPanel from "../components/TripResultsPanel.jsx";
import { PLACE_SUGGESTIONS_FIXTURE } from "../../shared/constants/tripSearchFixtures.js";
import { searchRoutes, RouteSearchError } from "../../shared/api/routeSearchApi.js";
import { mapRouteSearchResultToCardModel } from "../../shared/utils/mapRouteSearchResult.js";
import "./FindRoutesPage.css";

function findPlaceByLabel(label) {
  return PLACE_SUGGESTIONS_FIXTURE.find((place) => place.label === label) ?? null;
}

function FindRoutesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const restoredTripSearch = location.state?.tripSearch ?? null;
  // Only set on the initial navigation from the "tell us about yourself"
  // step — later visits to this page (edit trip, restored search) don't
  // carry it, so this just falls back to the regular fare.
  const [passengerType] = useState(location.state?.passengerType ?? "regular");

  const [viewMode, setViewMode] = useState(restoredTripSearch ? "loading" : "search");
  const [origin, setOrigin] = useState(restoredTripSearch?.origin ?? "");
  const [destination, setDestination] = useState(restoredTripSearch?.destination ?? "");
  const [originPlace, setOriginPlace] = useState(restoredTripSearch?.originPlace ?? null);
  const [destinationPlace, setDestinationPlace] = useState(restoredTripSearch?.destinationPlace ?? null);
  const [routes, setRoutes] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");

  const runSearch = async (originForSearch, destinationForSearch) => {
    setViewMode("loading");
    try {
      const result = await searchRoutes({
        origin: originForSearch,
        destination: destinationForSearch,
        discountType: passengerType,
      });
      const mappedRoutes = [
        mapRouteSearchResultToCardModel(result.recommended, { isBestPick: true }),
        ...(result.alternatives ?? []).map((route) => mapRouteSearchResultToCardModel(route)),
      ];
      setRoutes(mappedRoutes);
      setViewMode("results");
    } catch (error) {
      setErrorMessage(
        error instanceof RouteSearchError ? error.message : "Something went wrong. Please try again."
      );
      setViewMode("error");
    }
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

  const handleApplySavedRoute = (savedRoute) => {
    setOrigin(savedRoute.origin);
    setDestination(savedRoute.destination);
    setOriginPlace(findPlaceByLabel(savedRoute.origin));
    setDestinationPlace(findPlaceByLabel(savedRoute.destination));
  };

  const handleFindRoutes = () => {
    if (!originPlace || !destinationPlace) return;
    runSearch(originPlace, destinationPlace);
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
      <MapView origin={originPlace} destination={destinationPlace} routes={[]} />

      <div className="find-routes-page__overlay">
        {viewMode === "search" && (
          <TripSearchCard
            origin={origin}
            destination={destination}
            originPlace={originPlace}
            destinationPlace={destinationPlace}
            onOriginChange={setOrigin}
            onDestinationChange={setDestination}
            onSelectOriginPlace={handleSelectOriginPlace}
            onSelectDestinationPlace={handleSelectDestinationPlace}
            onApplySavedRoute={handleApplySavedRoute}
            onFindRoutes={handleFindRoutes}
          />
        )}

        {viewMode === "loading" && (
          <section className="find-routes-page__status-card">
            <p className="find-routes-page__status-title">Finding your best jeep combo…</p>
          </section>
        )}

        {viewMode === "error" && (
          <section className="find-routes-page__status-card">
            <p className="find-routes-page__status-title">Couldn't find a route</p>
            <p className="find-routes-page__status-body">{errorMessage}</p>
            <button type="button" className="find-routes-page__status-button" onClick={handleEditTrip}>
              Edit trip
            </button>
          </section>
        )}

        {viewMode === "results" && (
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
