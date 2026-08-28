import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, LocateFixed, Navigation, Compass, AlertCircle } from "lucide-react";
import { useGoogleMapsLoader } from "../../shared/hooks/useGoogleMapsLoader.js";
import {
  PLACE_SUGGESTIONS_FIXTURE,
  SERVICE_AREA_BOUNDS,
  isWithinServiceBounds,
} from "../../shared/constants/tripSearchFixtures.js";
import "./LocationAutocompleteInput.css";

const SUGGESTION_DEBOUNCE_MS = 250;

// A reusable location input field that strictly isolates suggestions to the
// Pampanga jeepney route and terminal network. Instant matches for local
// terminals and route stops appear as you type, complemented by bounded
// Google Places predictions.
function LocationAutocompleteInput({
  label,
  value,
  placeholder,
  showGpsButton = false,
  onChange,
  onSelectPlace,
}) {
  const { isLoaded } = useGoogleMapsLoader();
  const [isFocused, setIsFocused] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [googlePredictions, setGooglePredictions] = useState([]);
  const [outOfAreaWarning, setOutOfAreaWarning] = useState(null);

  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const debounceTimeoutRef = useRef(null);
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    if (!isLoaded || !window.google?.maps?.places) return;
    autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
    placesServiceRef.current = new window.google.maps.places.PlacesService(
      document.createElement("div")
    );
  }, [isLoaded]);

  // Compute local Pampanga terminal & route stop matches instantly
  const localMatches = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return [];
    return PLACE_SUGGESTIONS_FIXTURE.filter((place) => {
      const matchLabel = place.label.toLowerCase().includes(query);
      const matchSubtitle = place.subtitle?.toLowerCase().includes(query);
      const matchCategory = place.category?.toLowerCase().includes(query);
      return matchLabel || matchSubtitle || matchCategory;
    }).map((place) => ({
      id: place.id,
      label: place.label,
      subtitle: place.subtitle ?? "Pampanga Route Network",
      category: place.category ?? "landmark",
      lat: place.lat,
      lng: place.lng,
      isLocal: true,
    }));
  }, [value]);

  // Query Google Places strictly bounded to the Pampanga service area
  useEffect(() => {
    if (!isLoaded || !isFocused || value.trim().length === 0 || !autocompleteServiceRef.current) {
      setGooglePredictions([]);
      return undefined;
    }

    clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => {
      const requestId = ++latestRequestIdRef.current;
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: value.trim(),
          componentRestrictions: { country: "ph" },
          bounds: new window.google.maps.LatLngBounds(
            { lat: SERVICE_AREA_BOUNDS.south, lng: SERVICE_AREA_BOUNDS.west },
            { lat: SERVICE_AREA_BOUNDS.north, lng: SERVICE_AREA_BOUNDS.east }
          ),
          strictBounds: true,
        },
        (predictions, status) => {
          if (requestId !== latestRequestIdRef.current) return;
          if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
            setGooglePredictions([]);
            return;
          }
          setGooglePredictions(predictions);
        }
      );
    }, SUGGESTION_DEBOUNCE_MS);

    return () => clearTimeout(debounceTimeoutRef.current);
  }, [value, isFocused, isLoaded]);

  // Combine suggestions: Local Pampanga terminals & stops first, then Google predictions
  const combinedSuggestions = useMemo(() => {
    const localLabels = new Set(localMatches.map((m) => m.label.toLowerCase()));
    const filteredGoogle = googlePredictions
      .filter((p) => !localLabels.has(p.description.toLowerCase()))
      .map((p) => ({
        id: p.place_id,
        label: p.structured_formatting?.main_text || p.description,
        subtitle: p.structured_formatting?.secondary_text || "Angeles City, Pampanga",
        category: "google",
        prediction: p,
        isLocal: false,
      }));

    return [...localMatches, ...filteredGoogle];
  }, [localMatches, googlePredictions]);

  const handleSelectLocal = (place) => {
    setOutOfAreaWarning(null);
    setIsFocused(false);
    onSelectPlace({
      id: place.id,
      label: place.label,
      lat: place.lat,
      lng: place.lng,
    });
  };

  const handleSelectGoogle = (prediction) => {
    if (!placesServiceRef.current) return;
    setIsFocused(false);
    placesServiceRef.current.getDetails(
      { placeId: prediction.place_id, fields: ["geometry", "name", "formatted_address"] },
      (place, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
          return;
        }
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();

        // Enforce boundary check: only allow locations inside Pampanga route/terminal coverage
        if (!isWithinServiceBounds({ lat, lng })) {
          setOutOfAreaWarning("This location is outside the active Pampanga route area.");
          return;
        }

        setOutOfAreaWarning(null);
        onSelectPlace({
          id: prediction.place_id,
          label: prediction.description,
          lat,
          lng,
        });
      }
    );
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    setOutOfAreaWarning(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        if (!isWithinServiceBounds(here)) {
          setOutOfAreaWarning("Your current location is outside the Pampanga route coverage area.");
          setIsLocating(false);
          return;
        }

        onSelectPlace({
          id: "current-location",
          label: "Current Location",
          lat: here.lat,
          lng: here.lng,
        });
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
      }
    );
  };

  return (
    <div className="location-input">
      <label className="location-input__label">{label}</label>
      <div className="location-input__field">
        <input
          type="text"
          className="location-input__text"
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            setOutOfAreaWarning(null);
            onChange(event.target.value);
          }}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
        />
        {showGpsButton && (
          <button
            type="button"
            className="location-input__gps-button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            aria-label="Use current location"
          >
            {isLocating ? (
              <LocateFixed size={18} strokeWidth={2.25} className="location-input__gps-icon--spinning" />
            ) : (
              <MapPin size={18} strokeWidth={2.25} />
            )}
          </button>
        )}
      </div>

      {outOfAreaWarning && (
        <div className="location-input__warning">
          <AlertCircle size={14} />
          <span>{outOfAreaWarning}</span>
        </div>
      )}

      {isFocused && combinedSuggestions.length > 0 && (
        <ul className="location-input__suggestions">
          {combinedSuggestions.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="location-input__suggestion"
                onMouseDown={() => {
                  if (item.isLocal) {
                    handleSelectLocal(item);
                  } else {
                    handleSelectGoogle(item.prediction);
                  }
                }}
              >
                <div className="location-input__suggestion-icon-wrapper">
                  {item.category === "terminal" ? (
                    <Navigation size={15} strokeWidth={2.25} className="location-input__icon--terminal" />
                  ) : item.category === "stop" ? (
                    <Compass size={15} strokeWidth={2.25} className="location-input__icon--stop" />
                  ) : (
                    <MapPin size={15} strokeWidth={2.25} className="location-input__icon--landmark" />
                  )}
                </div>
                <div className="location-input__suggestion-content">
                  <div className="location-input__suggestion-title-row">
                    <span className="location-input__suggestion-title">{item.label}</span>
                    {item.category === "terminal" && (
                      <span className="location-input__badge location-input__badge--terminal">Terminal</span>
                    )}
                    {item.category === "stop" && (
                      <span className="location-input__badge location-input__badge--stop">Route Stop</span>
                    )}
                  </div>
                  {item.subtitle && (
                    <span className="location-input__suggestion-subtitle">{item.subtitle}</span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LocationAutocompleteInput;
