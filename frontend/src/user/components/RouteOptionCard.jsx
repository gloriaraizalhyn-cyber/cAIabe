import { Plus, Minus, Footprints, Clock, ArrowRightLeft, Bus } from "lucide-react";
import AiNote from "../../shared/components/AiNote.jsx";
import "./RouteOptionCard.css";

function formatFare(fare) {
  return `₱${fare.toFixed(2)}`;
}

function isWhiteJeepColor(color) {
  if (!color?.startsWith("#")) return false;
  const hex = color.slice(1);
  const value = hex.length === 3
    ? hex.split("").map((part) => part + part).join("")
    : hex;
  if (value.length !== 6) return false;
  const channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  return Math.min(...channels) >= 190 && Math.max(...channels) - Math.min(...channels) <= 35;
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
  const hasWhiteJeep = route.jeepColors.some(isWhiteJeepColor);

  const handleCardKeyDown = (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onToggleExpanded();
  };

  return (
    <article
      className={
        isBestPick
          ? "route-option-card route-option-card--best-pick"
          : "route-option-card"
      }
      style={{ "--route-accent": route.accentColor }}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      onClick={onToggleExpanded}
      onKeyDown={handleCardKeyDown}
    >
      {isBestPick && (
        <div className="route-option-card__best-pick-header">
          <span className="route-option-card__best-pick-label">CAIABEST PICK</span>
          <div className="route-option-card__sort-filters" onClick={(event) => event.stopPropagation()}>
            {SORT_METRIC_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  sortMetric === option.value
                    ? `route-option-card__sort-filter route-option-card__sort-filter--active${hasWhiteJeep ? " route-option-card__sort-filter--white" : ""}`
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
              <span
                key={index}
                className={`route-option-card__jeep-dot${isWhiteJeepColor(color) ? " route-option-card__jeep-dot--white" : ""}`}
                style={{ background: color }}
              />
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
          <Clock size={14} strokeWidth={2.25} />
          {route.travelMinutes} mins
        </span>
        <span className="route-option-card__stat">
          <ArrowRightLeft size={14} strokeWidth={2.25} />
          {route.transferCount > 0 ? `${route.transferCount} transfer` : "No transfer"}
        </span>
        <span
          className="route-option-card__toggle"
          aria-hidden="true"
        >
          {isExpanded ? <Minus size={16} strokeWidth={2.25} /> : <Plus size={16} strokeWidth={2.25} />}
        </span>
      </div>

      {isExpanded && (
        <div className="route-option-card__details">
          {route.aiNote && (
            <AiNote tone="calm" text={route.aiNote} className="route-option-card__ai-note" />
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
            <button
              type="button"
              className="route-option-card__take-button"
              onClick={(event) => {
                event.stopPropagation();
                onTakeRoute(route);
              }}
            >
              Take this route
            </button>
            <button
              type="button"
              className="route-option-card__save-button"
              onClick={(event) => {
                event.stopPropagation();
                onSaveRoute(route);
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export default RouteOptionCard;
