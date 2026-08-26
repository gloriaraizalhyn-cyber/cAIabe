import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { useGoogleMapsLoader } from "../../shared/hooks/useGoogleMapsLoader.js";
import "./LocationAutocompleteInput.css";

const SUGGESTION_DEBOUNCE_MS = 250;
// Bias suggestions toward the Clark/Angeles area without hard-restricting —
// matches where the rest of the app's placeholder data is centered.
const SUGGESTION_BIAS_CENTER = { lat: 15.1697, lng: 120.5891 };
const SUGGESTION_BIAS_RADIUS_METERS = 20000;

// A single reusable "from"/"to" field: typing queries Google Places
// Autocomplete for real matching places. The "use current location" action
// lives one level up (TripSearchCard) since it needs to sit as its own
// labeled button beside the swap control, not inside either field.
function LocationAutocompleteInput({
  label,
  value,
  placeholder,
  onChange,
  onSelectPlace,
}) {
  const { isLoaded } = useGoogleMapsLoader();
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const autocompleteServiceRef = useRef(null);
  const placesServiceRef = useRef(null);
  const debounceTimeoutRef = useRef(null);
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    if (!isLoaded) return;
    autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
    // PlacesService needs a Map or a div to attach to, but never actually
    // renders anything — a detached div is the standard way to use it
    // headlessly. Using this (not Geocoder) keeps place-detail lookups on
    // the same Places API the predictions already use.
    placesServiceRef.current = new window.google.maps.places.PlacesService(
      document.createElement("div")
    );
  }, [isLoaded]);

  useEffect(() => {
    if (!isLoaded || !isFocused || value.trim().length === 0) {
      setSuggestions([]);
      return undefined;
    }

    clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => {
      const requestId = ++latestRequestIdRef.current;
      autocompleteServiceRef.current.getPlacePredictions(
        {
          input: value.trim(),
          componentRestrictions: { country: "ph" },
          location: new window.google.maps.LatLng(
            SUGGESTION_BIAS_CENTER.lat,
            SUGGESTION_BIAS_CENTER.lng
          ),
          radius: SUGGESTION_BIAS_RADIUS_METERS,
        },
        (predictions, status) => {
          if (requestId !== latestRequestIdRef.current) return;
          if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
            setSuggestions([]);
            return;
          }
          setSuggestions(predictions);
        }
      );
    }, SUGGESTION_DEBOUNCE_MS);

    return () => clearTimeout(debounceTimeoutRef.current);
  }, [value, isFocused, isLoaded]);

  const handleSuggestionClick = (prediction) => {
    setIsFocused(false);
    setSuggestions([]);
    placesServiceRef.current.getDetails(
      { placeId: prediction.place_id, fields: ["geometry"] },
      (place, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
          return;
        }
        onSelectPlace({
          id: prediction.place_id,
          label: prediction.description,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });
      }
    );
  };

  return (
    <div className="location-input">
      <div className="location-input__header">
        <label className="location-input__label">{label}</label>
      </div>

      <div className="location-input__field">
        <input
          type="text"
          className="location-input__text"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
        />
      </div>

      {suggestions.length > 0 && (
        <ul className="location-input__suggestions">
          {suggestions.map((prediction) => (
            <li key={prediction.place_id}>
              <button
                type="button"
                className="location-input__suggestion"
                onMouseDown={() => handleSuggestionClick(prediction)}
              >
                <MapPin size={14} strokeWidth={2.25} />
                {prediction.description}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LocationAutocompleteInput;
