import { Plus, Minus, Footprints, Clock, ArrowRightLeft, Sparkles, Bus } from "lucide-react";
import "./RouteOptionCard.css";

function formatFare(fare) {
  return `₱${fare.toFixed(2)}`;
}

function RouteLeg({ leg }) {
  return (
    <div className="route-option-card__leg">
      <span
        className="route-option-card__leg-icon"
        style={leg.kind === "jeep" ? { background: leg.color } : undefined}
      >
        {leg.kind === "jeep" ? <Bus size={14} strokeWidth={2.25} /> : <Footprints size={14} strokeWidth={2.25} />}
      </span>
      <span className="route-option-card__leg-text">
        <span className="route-option-card__leg-title">{leg.title}</span>
        <span className="route-option-card__leg-subtitle">{leg.subtitle}</span>
      </span>
      <span className="route-option-card__leg-duration">{leg.duration}</span>
    </div>
  );
}

const SORT_METRIC_OPTIONS = [
  { value: "time", label: "Time" },
  { value: "fare", label: "Fare" },
  { value: "distance", label: "Distance" },
];

function RouteOptionCard({
  route,
  isBestPick,
  isExpanded,
  onToggleExpanded,
  onTakeRoute,
  onSaveRoute,
  sortMetric,
  onChangeSortMetric,
}) {
  return (
    <article
      className={
        isBestPick
          ? "route-option-card route-option-card--best-pick"
          : "route-option-card"
      }
      style={{ "--route-accent": route.accentColor }}
    >
      {isBestPick && (
        <div className="route-option-card__best-pick-header">
          <span className="route-option-card__best-pick-label">CAIABEST PICK</span>
          <div className="route-option-card__sort-filters">
            {SORT_METRIC_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  sortMetric === option.value
                    ? "route-option-card__sort-filter route-option-card__sort-filter--active"
                    : "route-option-card__sort-filter"
                }
                onClick={() => onChangeSortMetric(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="route-option-card__summary">
        <div className="route-option-card__identity">
          <span className="route-option-card__jeep-dots">
            {route.jeepColors.map((color, index) => (
              <span key={index} className="route-option-card__jeep-dot" style={{ background: color }} />
            ))}
          </span>
          <span className="route-option-card__identity-text">
            <span className="route-option-card__title">{route.title}</span>
            <span className="route-option-card__subtitle">{route.subtitle}</span>
          </span>
        </div>
        <div className="route-option-card__price">
          <span className="route-option-card__fare">{formatFare(route.fare)}</span>
          <span className="route-option-card__distance">{route.distanceKm} km</span>
        </div>
      </div>

      <div className="route-option-card__stats">
        <span className="route-option-card__stat">
          <Footprints size={14} strokeWidth={2.25} />
          {route.walkMinutes} min walk
        </span>
        <span className="route-option-card__stat">
          <Clock size={14} strokeWidth={2.25} />
          {route.travelMinutes} mins
        </span>
        <span className="route-option-card__stat">
          <ArrowRightLeft size={14} strokeWidth={2.25} />
          {route.transferCount > 0 ? `${route.transferCount} TRANSFER` : "NO TRANSFER"}
        </span>
        <button
          type="button"
          className="route-option-card__toggle"
          onClick={onToggleExpanded}
          aria-label={isExpanded ? "Collapse route details" : "Expand route details"}
          aria-expanded={isExpanded}
        >
          {isExpanded ? <Minus size={16} strokeWidth={2.25} /> : <Plus size={16} strokeWidth={2.25} />}
        </button>
      </div>

      {isExpanded && (
        <div className="route-option-card__details">
          {route.aiNote && (
            <div className="route-option-card__ai-note">
              <span className="route-option-card__ai-badge">
                <Sparkles size={12} strokeWidth={2.5} />
                AI
              </span>
              <p>{route.aiNote}</p>
            </div>
          )}

          {route.legs.length > 0 ? (
            <div className="route-option-card__legs">
              {route.legs.map((leg) => (
                <RouteLeg key={leg.id} leg={leg} />
              ))}
            </div>
          ) : (
            <div className="route-option-card__walk-summary">
              <p>
                <Footprints size={14} strokeWidth={2.25} />
                Walk {route.walkToBoardMeters} m to board
              </p>
              <p>
                <Footprints size={14} strokeWidth={2.25} />
                Walk {route.walkFromAlightMeters} m from your stop
              </p>
            </div>
          )}

          <div className="route-option-card__timing">
            <span>
              <span className="route-option-card__timing-value">{route.leaveTime}</span>
              <span className="route-option-card__timing-label">LEAVE</span>
            </span>
            <span>
              <span className="route-option-card__timing-value route-option-card__timing-value--accent">
                {route.travelMinutes} min
              </span>
              <span className="route-option-card__timing-label">TRAVEL TIME</span>
            </span>
            <span>
              <span className="route-option-card__timing-value">{route.arriveTime}</span>
              <span className="route-option-card__timing-label">ARRIVE</span>
            </span>
          </div>

          {route.availabilityNote && (
            <p className="route-option-card__availability">
              <span className="route-option-card__availability-dot" />
              {route.availabilityNote}
            </p>
          )}

          <div className="route-option-card__actions">
            <button type="button" className="route-option-card__take-button" onClick={() => onTakeRoute(route)}>
              Take this route
            </button>
            <button type="button" className="route-option-card__save-button" onClick={() => onSaveRoute(route)}>
              Save
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export default RouteOptionCard;
