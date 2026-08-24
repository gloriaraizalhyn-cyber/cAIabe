import { Sparkles } from "lucide-react";
import LocationAutocompleteInput from "./LocationAutocompleteInput.jsx";
import {
  SAVED_ROUTES_FIXTURE,
  AI_SEARCH_TIP_FIXTURE,
} from "../../shared/constants/tripSearchFixtures.js";
import "./TripSearchCard.css";

function TripSearchCard({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  onSelectOriginPlace,
  onSelectDestinationPlace,
  onApplySavedRoute,
  onFindRoutes,
}) {
  const canFindRoutes = origin.trim().length > 0 && destination.trim().length > 0;

  return (
    <section className="trip-search-card">
      <h1 className="trip-search-card__title">Where are you going?</h1>
      <p className="trip-search-card__subtitle">
        Type where you are and where you're going. cAIabe picks the best jeep combo.
      </p>

      <div className="trip-search-card__fields">
        <LocationAutocompleteInput
          label="From"
          value={origin}
          placeholder="Your starting point"
          showGpsButton
          onChange={onOriginChange}
          onSelectPlace={onSelectOriginPlace}
        />
        <LocationAutocompleteInput
          label="To"
          value={destination}
          placeholder="Where to?"
          onChange={onDestinationChange}
          onSelectPlace={onSelectDestinationPlace}
        />
      </div>

      <p className="trip-search-card__section-label">Saved Routes</p>
      <div className="trip-search-card__saved-routes">
        {SAVED_ROUTES_FIXTURE.map((savedRoute) => (
          <button
            key={savedRoute.id}
            type="button"
            className="trip-search-card__saved-route-chip"
            onClick={() => onApplySavedRoute(savedRoute)}
          >
            {savedRoute.label} <span>{savedRoute.jeepneyLineCode}</span>
          </button>
        ))}
      </div>

      <div className="trip-search-card__ai-tip">
        <span className="trip-search-card__ai-badge">
          <Sparkles size={12} strokeWidth={2.5} />
          AI
        </span>
        <p>{AI_SEARCH_TIP_FIXTURE}</p>
      </div>

      <button
        type="button"
        className="trip-search-card__find-button"
        disabled={!canFindRoutes}
        onClick={onFindRoutes}
      >
        Find routes
      </button>
    </section>
  );
}

export default TripSearchCard;
