import { useState } from "react";
import { MapPin, LocateFixed } from "lucide-react";
import { PLACE_SUGGESTIONS_FIXTURE } from "../../shared/constants/tripSearchFixtures.js";
import "./LocationAutocompleteInput.css";

// A single reusable "from"/"to" field: typing filters a fixture place list,
// and (only when showGpsButton is set) a button fills the field with the
// device's current location via the browser Geolocation API.
function LocationAutocompleteInput({
  label,
  value,
  placeholder,
  showGpsButton = false,
  onChange,
  onSelectPlace,
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  const matchingSuggestions =
    isFocused && value.trim().length > 0
      ? PLACE_SUGGESTIONS_FIXTURE.filter((place) =>
          place.label.toLowerCase().includes(value.trim().toLowerCase())
        )
      : [];

  const handleSuggestionClick = (place) => {
    onSelectPlace(place);
    setIsFocused(false);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onSelectPlace({
          id: "current-location",
          label: "Current Location",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
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
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
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

      {matchingSuggestions.length > 0 && (
        <ul className="location-input__suggestions">
          {matchingSuggestions.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                className="location-input__suggestion"
                onMouseDown={() => handleSuggestionClick(place)}
              >
                <MapPin size={14} strokeWidth={2.25} />
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LocationAutocompleteInput;
