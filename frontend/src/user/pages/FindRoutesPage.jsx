import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MapView from "../../shared/components/MapView.jsx";
import TripSearchCard from "../components/TripSearchCard.jsx";
import TripResultsPanel from "../components/TripResultsPanel.jsx";
import { adaptRouteSearchResult } from "../utils/adaptRouteSearchResult.js";
import {
  getSavedRoutes,
  saveRoute,
  removeSavedRouteByKey,
  savedRouteLabel,
  startsFromCurrentLocation,
} from "../../shared/utils/savedRoutesStorage.js";
import { supabase } from "../../shared/lib/supabaseClient.js";
import { readDemoTripSearch, readDemoPassengerType } from "../../demo/demoTripParams.js";
import "./FindRoutesPage.css";

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
  // The demo stage runs this page in an iframe, which can only be handed a
  // URL — never router state. readDemoTripSearch rebuilds the same shape
  // from query params; both helpers return null when those params are
  // absent, so normal navigation is unaffected.
  const restoredTripSearch = location.state?.tripSearch ?? readDemoTripSearch();
  const passengerType = location.state?.passengerType ?? readDemoPassengerType() ?? "regular";

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
  const [savedRoutes, setSavedRoutes] = useState(() => getSavedRoutes());
  const savedRouteKeys = useMemo(() => new Set(savedRoutes.map((route) => route.routeKey)), [savedRoutes]);

  // The GPS lookup below answers asynchronously (up to ~10 s, then a second
  // reverse-geocode round trip). If the passenger has already chosen an origin
  // by then — a saved route, a suggestion, a swap, or typing — it must not
  // overwrite their choice. originIsGpsRef records where the origin came from,
  // so a saved route knows whether it started at "current location".
  const userSetOriginRef = useRef(false);
  const originIsGpsRef = useRef(false);

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

  // added additional useEffect from GPT

  useEffect(() => {
  // Don't overwrite an origin from a restored/saved trip.
  if (restoredTripSearch?.originPlace) return;

  if (!navigator.geolocation) {
    setSearchError("Your browser does not support location services.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      if (userSetOriginRef.current) return; // they already picked an origin

      const { latitude, longitude } = position.coords;

      console.log("GPS coordinates:", {
        latitude,
        longitude,
      });

      // Set the coordinates immediately.
      // Route-search needs these coordinates, not the readable address.
      const currentLocation = {
        label: "Current location",
        lat: latitude,
        lng: longitude,
      };

      originIsGpsRef.current = true;
      setOrigin("Current location");
      setOriginPlace(currentLocation);

      // Now try to get a readable address.
      try {
        if (window.google?.maps?.Geocoder) {
          const geocoder = new window.google.maps.Geocoder();

          const response = await geocoder.geocode({
            location: {
              lat: latitude,
              lng: longitude,
            },
          });

          // Checked again: the passenger may have chosen an origin while the
          // address lookup was in flight.
          if (!userSetOriginRef.current && response.results?.length > 0) {
            const readableLocation =
              response.results[0].formatted_address;

            console.log(
              "Readable current location:",
              readableLocation
            );

            setOrigin(readableLocation);

            // Keep the GPS coordinates while updating only the label.
            setOriginPlace((previous) => ({
              ...previous,
              label: readableLocation,
            }));
          }
        }
      } catch (error) {
        console.error("Reverse geocoding error:", error);
      }
    },
    (error) => {
      console.error("Geolocation error:", error);

      setSearchError(
        "Unable to get your current location. Please allow location access."
      );
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
}, [restoredTripSearch?.originPlace]);

// Third useEffect

useEffect(() => {
  if (!destination || destinationPlace) return;

  let cancelled = false;
  let retryTimer;

  const geocodeDestination = () => {
    // Google Maps JavaScript API may still be loading.
    if (!window.google?.maps?.Geocoder) {
      retryTimer = setTimeout(geocodeDestination, 500);
      return;
    }

    const geocoder = new window.google.maps.Geocoder();

    geocoder.geocode(
      {
        address: destination,
      },
      (results, status) => {
        if (cancelled) return;

        if (status === "OK" && results?.length > 0) {
          const result = results[0];
          const location = result.geometry.location;

          const place = {
            label: result.formatted_address || destination,
            lat: location.lat(),
            lng: location.lng(),
          };

          console.log("Destination geocoded:", place);

          setDestination(place.label);
          setDestinationPlace(place);
        } else {
          console.error(
            "Destination geocoding failed:",
            status,
            destination
          );

          setSearchError(
            `Could not find the destination "${destination}".`
          );
        }
      }
    );
  };

  geocodeDestination();

  return () => {
    cancelled = true;

    if (retryTimer) {
      clearTimeout(retryTimer);
    }
  };
}, [destination, destinationPlace]);

  // Typing an origin: from here on the passenger owns it, GPS must not touch it.
  const handleOriginTextChange = (text) => {
    userSetOriginRef.current = true;
    originIsGpsRef.current = false;
    setOrigin(text);
  };

  const handleSelectOriginPlace = (place) => {
    userSetOriginRef.current = true;
    originIsGpsRef.current = false;
    setOrigin(place.label);
    setOriginPlace(place);
  };

  const handleSelectDestinationPlace = (place) => {
    setDestination(place.label);
    setDestinationPlace(place);
  };

  const handleSwapPlaces = () => {
    userSetOriginRef.current = true;
    originIsGpsRef.current = false;
    setOrigin(destination);
    setDestination(origin);
    setOriginPlace(destinationPlace);
    setDestinationPlace(originPlace);
  };

  // Tapping a saved route uses it: fills both fields and finds the routes.
  // A route saved from "current location" keeps starting from wherever the
  // passenger is NOW (the GPS point it was saved at is stale), so only its
  // destination is restored and the live GPS origin is used.
  const handleApplySavedRoute = (savedRoute) => {
    setSearchError(null);
    setDestination(savedRoute.destination);
    setDestinationPlace(savedRoute.destinationPlace);

    if (startsFromCurrentLocation(savedRoute)) {
      if (originPlace && originIsGpsRef.current) {
        // GPS already answered — search from where they are right now.
        if (savedRoute.destinationPlace) runSearch(originPlace, savedRoute.destinationPlace);
        return;
      }
      if (!originPlace && !userSetOriginRef.current) {
        // GPS still working: it will fill the origin in; they tap Find routes.
        setSearchError("Getting your current location… tap Find routes in a moment.");
        return;
      }
      // Otherwise they've chosen a different start by hand; fall through and
      // restore the place this route was saved from.
    }

    userSetOriginRef.current = true;
    originIsGpsRef.current = false;
    setOrigin(savedRoute.origin);
    setOriginPlace(savedRoute.originPlace);
    if (savedRoute.originPlace && savedRoute.destinationPlace) {
      runSearch(savedRoute.originPlace, savedRoute.destinationPlace);
    }
  };

  const handleRemoveSavedRoute = (routeKey) => {
    removeSavedRouteByKey(routeKey);
    setSavedRoutes(getSavedRoutes());
  };

  /*const handleFindRoutes = () => {
    if (!originPlace || !destinationPlace) {
      setSearchError("Pick an origin and destination from the suggestions first.");
      return;
    }
    runSearch(originPlace, destinationPlace);
  };*/

  const handleFindRoutes = () => {
  console.log("Find Routes clicked");
  console.log("Origin:", origin);
  console.log("Origin place:", originPlace);
  console.log("Destination:", destination);
  console.log("Destination place:", destinationPlace);

  if (!originPlace) {
    setSearchError("Still getting your current location. Please wait a moment.");
    return;
  }

  if (!destinationPlace) {
    setSearchError("Still finding your destination. Please wait a moment.");
    return;
  }

  runSearch(originPlace, destinationPlace);
};

  const handleOpenVoiceAssistant = () => {
    navigate("/voice-search");
  };

  const handleEditTrip = () => {
    setViewMode("search");
  };

  const handleTakeRoute = (route) => {
    navigate("/waiting", {
      state: {
        routeId: route.id,
        route,
        passengerType,
        tripSearch: { origin, destination, originPlace, destinationPlace },
      },
    });
  };
  const handleSaveRoute = (route) => {
    const routeKey = route.cardKey ?? route.id;
    if (savedRouteKeys.has(routeKey)) {
      removeSavedRouteByKey(routeKey);
    } else {
      saveRoute({
        routeKey,
        label: savedRouteLabel({
          origin,
          destination,
          originIsCurrentLocation: originIsGpsRef.current,
        }),
        origin,
        destination,
        originPlace,
        destinationPlace,
        routeId: route.id,
        originIsCurrentLocation: originIsGpsRef.current,
      });
    }
    setSavedRoutes(getSavedRoutes());
  };

  return (
    <main className="find-routes-page">
      <MapView
        origin={originPlace}
        destination={destinationPlace}
        routes={
          viewMode === "results" ? (focusedRoute ? [focusedRoute] : routes) : []
        }
        showDirections={Boolean(originPlace && destinationPlace)}
      />

      <div className="find-routes-page__overlay">
        {viewMode === "search" ? (
          <TripSearchCard
            origin={origin}
            destination={destination}
            onOriginChange={handleOriginTextChange}
            onDestinationChange={setDestination}
            onSelectOriginPlace={handleSelectOriginPlace}
            onSelectDestinationPlace={handleSelectDestinationPlace}
            onSwapPlaces={handleSwapPlaces}
            savedRoutes={savedRoutes}
            onApplySavedRoute={handleApplySavedRoute}
            onRemoveSavedRoute={handleRemoveSavedRoute}
            onOpenVoiceAssistant={handleOpenVoiceAssistant}
            onFindRoutes={handleFindRoutes}
            isSearching={isSearching}
            searchError={searchError}
          />
        ) : (
          <TripResultsPanel
            origin={origin}
            destination={destination}
            routes={routes}
            savedRouteKeys={savedRouteKeys}
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
