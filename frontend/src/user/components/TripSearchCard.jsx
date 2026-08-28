import { useRef, useState } from "react";
import { Bookmark, ArrowUpDown, LocateFixed, Mic, ChevronRight } from "lucide-react";
import LocationAutocompleteInput from "./LocationAutocompleteInput.jsx";
import MascotReveal from "./MascotReveal.jsx";
import { SAVED_ROUTES_FIXTURE } from "../../shared/constants/tripSearchFixtures.js";
import "./TripSearchCard.css";

// How much of the sheet's total height stays off-screen (below the
// viewport) in its default "peek" state on mobile — the rest is what
// dragging the handle up reveals. Only meaningful below the mobile
// breakpoint; on desktop the card isn't fixed/full-height so this is inert.
const SHEET_PEEK_RATIO = 0.71;

function TripSearchCard({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  onSelectOriginPlace,
  onSelectDestinationPlace,
  onSwapPlaces,
  onApplySavedRoute,
  onOpenVoiceAssistant,
  onFindRoutes,
  isSearching,
  searchError,
}) {
  const canFindRoutes = origin.trim().length > 0 && destination.trim().length > 0 && !isSearching;

  const [isLocating, setIsLocating] = useState(false);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onSelectOriginPlace({
          id: "current-location",
          label: "Current Location",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setIsLocating(false);
      },
      () => setIsLocating(false)
    );
  };

  // Every saved route starts bookmarked (that's what put it in this list);
  // the line-code badge doubles as the un-save toggle. Frontend-only for
  // now — no backend field to persist this yet, so it just flips the
  // badge's visual state rather than removing the chip.
  const [bookmarkedRouteIds, setBookmarkedRouteIds] = useState(
    () => new Set(SAVED_ROUTES_FIXTURE.map((savedRoute) => savedRoute.id))
  );

  const toggleBookmark = (routeId) => {
    setBookmarkedRouteIds((current) => {
      const next = new Set(current);
      if (next.has(routeId)) {
        next.delete(routeId);
      } else {
        next.add(routeId);
      }
      return next;
    });
  };

  // Mobile bottom-sheet drag-to-expand. dragStateRef holds the in-progress
  // gesture (not state, so pointermove doesn't re-render on every pixel);
  // liveDragY mirrors it into a rendered inline transform only while
  // actively dragging, and is cleared on release so the CSS class
  // transition takes over for the final snap.
  const dragStateRef = useRef(null);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [liveDragY, setLiveDragY] = useState(null);

  const peekOffsetPx = () => window.innerHeight * SHEET_PEEK_RATIO;

  const handleDragPointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      startY: event.clientY,
      baseline: isSheetExpanded ? 0 : peekOffsetPx(),
    };
    setLiveDragY(dragStateRef.current.baseline);
  };

  const handleDragPointerMove = (event) => {
    if (!dragStateRef.current) return;
    const { startY, baseline } = dragStateRef.current;
    const delta = event.clientY - startY;
    const max = peekOffsetPx();
    setLiveDragY(Math.min(Math.max(baseline + delta, 0), max));
  };

  const handleDragPointerUp = () => {
    if (!dragStateRef.current) return;
    const max = peekOffsetPx();
    setIsSheetExpanded((liveDragY ?? dragStateRef.current.baseline) < max / 2);
    dragStateRef.current = null;
    setLiveDragY(null);
  };

  return (
    <section
      className={`trip-search-card${isSheetExpanded ? " trip-search-card--expanded" : ""}`}
      style={liveDragY !== null ? { transform: `translateY(${liveDragY}px)`, transition: "none" } : undefined}
    >
      <div
        className="trip-search-card__drag-handle"
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
        onPointerCancel={handleDragPointerUp}
      >
        <span className="trip-search-card__drag-handle-bar" />
      </div>

      <div className="trip-search-card__header-row">
        <div className="trip-search-card__header-copy">
          <h1 className="trip-search-card__title">
            Nokarin ta
            <br />
            munta, Jo?
          </h1>
          <p className="trip-search-card__instruction">
            Enter where you are and where you want to go.
          </p>
        </div>
        <MascotReveal className="trip-search-card__mascot" />
      </div>

      <div className="trip-search-card__fields-header">
        <button
          type="button"
          className="trip-search-card__current-location-button"
          onClick={handleUseCurrentLocation}
          disabled={isLocating}
        >
          <LocateFixed
            size={13}
            strokeWidth={2.5}
            className={isLocating ? "trip-search-card__current-location-icon--spinning" : undefined}
          />
          {isLocating ? "Locating…" : "Current location"}
        </button>
      </div>

      <div className="trip-search-card__fields">
        <LocationAutocompleteInput
          label="From"
          value={origin}
          placeholder="Your starting point"
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
        <button
          type="button"
          className="trip-search-card__swap-button"
          onClick={onSwapPlaces}
          aria-label="Swap origin and destination"
        >
          <ArrowUpDown size={17} strokeWidth={2.5} />
        </button>
      </div>

      <div className="trip-search-card__quick-actions">
        <button
          type="button"
          className="trip-search-card__voice-card"
          onClick={onOpenVoiceAssistant}
        >
          <span className="trip-search-card__quick-action-label">Voice Assistant</span>
          <span className="trip-search-card__voice-icon-wrap">
            <span className="trip-search-card__voice-ring trip-search-card__voice-ring--1" />
            <span className="trip-search-card__voice-ring trip-search-card__voice-ring--2" />
            <span className="trip-search-card__voice-ring trip-search-card__voice-ring--3" />
            <Mic size={40} strokeWidth={2} className="trip-search-card__voice-icon" />
          </span>
        </button>

        <div className="trip-search-card__saved-routes-card">
          <div className="trip-search-card__saved-routes-header">
            <span className="trip-search-card__quick-action-label">Saved Routes</span>
            <ChevronRight size={15} strokeWidth={2.5} className="trip-search-card__saved-routes-chevron" />
          </div>
          <div className="trip-search-card__saved-routes">
            {SAVED_ROUTES_FIXTURE.slice(0, 3).map((savedRoute) => {
              const isBookmarked = bookmarkedRouteIds.has(savedRoute.id);
              return (
                <div key={savedRoute.id} className="trip-search-card__saved-route-chip">
                  <button
                    type="button"
                    className="trip-search-card__saved-route-label"
                    onClick={() => onApplySavedRoute(savedRoute)}
                  >
                    {savedRoute.label}
                  </button>
                  <button
                    type="button"
                    className={`trip-search-card__saved-route-bookmark${
                      isBookmarked ? " trip-search-card__saved-route-bookmark--active" : ""
                    }`}
                    aria-pressed={isBookmarked}
                    aria-label={isBookmarked ? "Remove from saved routes" : "Save this route"}
                    onClick={() => toggleBookmark(savedRoute.id)}
                  >
                    <Bookmark size={13} strokeWidth={2.25} fill={isBookmarked ? "currentColor" : "none"} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {searchError && <p className="trip-search-card__error">{searchError}</p>}

      <button
        type="button"
        className="trip-search-card__find-button"
        disabled={!canFindRoutes}
        onClick={onFindRoutes}
      >
        {isSearching ? "Finding routes…" : "Find routes"}
      </button>
    </section>
  );
}

export default TripSearchCard;
