import { useCallback, useRef, useState } from "react";
import { Bookmark, ArrowUpDown, LocateFixed, Mic, ChevronRight } from "lucide-react";
import LocationAutocompleteInput from "./LocationAutocompleteInput.jsx";
import MascotReveal from "./MascotReveal.jsx";
import { savedRouteLabel } from "../../shared/utils/savedRoutesStorage.js";
import SavedRoutesDialog from "./SavedRoutesDialog.jsx";
import BackButton from "../../shared/components/BackButton.jsx";
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
  savedRoutes = [],
  onApplySavedRoute,
  onRemoveSavedRoute,
  onOpenVoiceAssistant,
  onFindRoutes,
  isSearching,
  searchError,
}) {
  const canFindRoutes = origin.trim().length > 0 && destination.trim().length > 0 && !isSearching;

  const [isLocating, setIsLocating] = useState(false);

  // "Saved Routes" card -> dialog listing everything saved on this device.
  const [isSavedDialogOpen, setIsSavedDialogOpen] = useState(false);
  const closeSavedDialog = useCallback(() => setIsSavedDialogOpen(false), []);
  const handleApplyFromDialog = (savedRoute) => {
    onApplySavedRoute?.(savedRoute);
    setIsSavedDialogOpen(false);
  };

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
    const { baseline } = dragStateRef.current;
    const finalY = liveDragY ?? baseline;
    if (Math.abs(finalY - baseline) < 6) {
      // A tap on the handle toggles the sheet.
      setIsSheetExpanded(!isSheetExpanded);
    } else if (isSheetExpanded) {
      // Pulling down only closes it once it has been dragged a little way.
      setIsSheetExpanded(finalY < max * 0.15);
    } else {
      // Pulling up opens it after roughly the first sixth of the travel,
      // instead of needing to cross the halfway point.
      setIsSheetExpanded(finalY < max * 0.85);
    }
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

      <BackButton fallback="/about-you" variant="link" className="trip-search-card__back" />

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
          <button
            type="button"
            className="trip-search-card__saved-routes-header"
            aria-haspopup="dialog"
            onClick={() => setIsSavedDialogOpen(true)}
          >
            <span className="trip-search-card__quick-action-label">Saved Routes</span>
            <ChevronRight size={15} strokeWidth={2.5} className="trip-search-card__saved-routes-chevron" />
          </button>
          <div className="trip-search-card__saved-routes">
            {savedRoutes.length === 0 ? (
              <button
                type="button"
                className="trip-search-card__saved-routes-empty"
                onClick={() => setIsSavedDialogOpen(true)}
              >
                No saved routes yet — tap Save on a route's results to add one here.
              </button>
            ) : (
              savedRoutes.slice(0, 3).map((savedRoute) => (
                <div key={savedRoute.id} className="trip-search-card__saved-route-chip">
                  <button
                    type="button"
                    className="trip-search-card__saved-route-label"
                    onClick={() => onApplySavedRoute(savedRoute)}
                  >
                    {savedRouteLabel(savedRoute)}
                  </button>
                  <button
                    type="button"
                    className="trip-search-card__saved-route-bookmark trip-search-card__saved-route-bookmark--active"
                    aria-pressed="true"
                    aria-label="Remove from saved routes"
                    onClick={() => onRemoveSavedRoute?.(savedRoute.routeKey)}
                  >
                    <Bookmark size={13} strokeWidth={2.25} fill="currentColor" />
                  </button>
                </div>
              ))
            )}
            {savedRoutes.length > 3 && (
              <button
                type="button"
                className="trip-search-card__saved-routes-more"
                onClick={() => setIsSavedDialogOpen(true)}
              >
                View all {savedRoutes.length}
              </button>
            )}
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

      {isSavedDialogOpen && (
        <SavedRoutesDialog
          routes={savedRoutes}
          onClose={closeSavedDialog}
          onApply={handleApplyFromDialog}
          onRemove={(routeKey) => onRemoveSavedRoute?.(routeKey)}
        />
      )}
    </section>
  );
}

export default TripSearchCard;

