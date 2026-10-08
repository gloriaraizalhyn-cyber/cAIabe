import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Bookmark, Trash2, X } from "lucide-react";
import "./SavedRoutesDialog.css";

// Lists every route the passenger saved on this device (they live in the
// browser's local storage — see shared/utils/savedRoutesStorage.js). Rendered
// in a portal because the mobile search card is a transformed bottom sheet,
// which would otherwise trap a fixed-position overlay inside it.

function formatSavedDate(createdAt) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function SavedRoutesDialog({ routes, onClose, onApply, onRemove }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="saved-routes-dialog"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="saved-routes-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-routes-dialog-title"
      >
        <div className="saved-routes-dialog__header">
          <div>
            <h2 id="saved-routes-dialog-title" className="saved-routes-dialog__title">
              Saved routes
            </h2>
            <p className="saved-routes-dialog__subtitle">
              {routes.length === 0
                ? "Kept on this device"
                : `${routes.length} saved on this device`}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="saved-routes-dialog__close"
            aria-label="Close saved routes"
            onClick={onClose}
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {routes.length === 0 ? (
          <div className="saved-routes-dialog__empty">
            <span className="saved-routes-dialog__empty-icon" aria-hidden="true">
              <Bookmark size={22} strokeWidth={2.25} />
            </span>
            <p className="saved-routes-dialog__empty-title">No saved routes yet</p>
            <p className="saved-routes-dialog__empty-body">
              Tap Save on a route&rsquo;s results and it will show up here for next time.
            </p>
          </div>
        ) : (
          <ul className="saved-routes-dialog__list">
            {routes.map((route) => {
              const savedOn = formatSavedDate(route.createdAt);
              // Labels are saved as "origin → destination"; only show the trip
              // line when it adds something the title does not already say.
              const labelIsTrip = route.label === `${route.origin} → ${route.destination}`;
              return (
                <li key={route.id ?? route.routeKey} className="saved-routes-dialog__item">
                  <div className="saved-routes-dialog__item-main">
                    <p className="saved-routes-dialog__item-label">{route.label}</p>
                    {!labelIsTrip && (route.origin || route.destination) && (
                      <p className="saved-routes-dialog__item-trip">
                        <span>{route.origin || "—"}</span>
                        <ArrowRight size={13} strokeWidth={2.5} aria-label="to" />
                        <span>{route.destination || "—"}</span>
                      </p>
                    )}
                    {savedOn && <p className="saved-routes-dialog__item-date">Saved {savedOn}</p>}
                  </div>
                  <div className="saved-routes-dialog__item-actions">
                    <button
                      type="button"
                      className="saved-routes-dialog__use"
                      onClick={() => onApply(route)}
                    >
                      Use route
                    </button>
                    <button
                      type="button"
                      className="saved-routes-dialog__remove"
                      aria-label={`Remove ${route.label} from saved routes`}
                      onClick={() => onRemove(route.routeKey)}
                    >
                      <Trash2 size={16} strokeWidth={2.25} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>,
    document.body
  );
}

export default SavedRoutesDialog;
