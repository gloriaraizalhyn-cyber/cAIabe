import { formatDistance, passengerWord } from "../utils/plainDemand.js";
import "./DemandStatGrid.css";

// Only a clear change is worth telling a driver; "stable" and "not enough
// data yet" are noise, so they are simply not shown.
const TREND_DISPLAY = {
  increasing: { icon: "↑", label: "More coming" },
  decreasing: { icon: "↓", label: "Fewer than before" },
};

// The plain-language summary shared by the driver demand cards. Internal
// scores are deliberately not shown: a driver needs the action and the reason,
// not a second technical rating to interpret.
function DemandStatGrid({ demandScore = null, compatibleCount, nearestDistanceKm, trend }) {
  const trendDisplay = TREND_DISPLAY[trend?.direction] ?? null;
  const distance = formatDistance(nearestDistanceKm);
  const count = Number(compatibleCount) || 0;
  const waitingText =
    count > 0
      ? `${count} ${passengerWord(count)} waiting${distance ? ` ${distance} away` : ""}.`
      : "No passengers waiting right now.";

  return (
    <div className="demand-stat-grid" aria-label="Passenger demand summary">
      <p className="demand-stat-grid__summary">{waitingText}</p>
      {trendDisplay && (
        <p className="demand-stat-grid__trend">
          {trendDisplay.icon} {trendDisplay.label}
        </p>
      )}
    </div>
  );
}

export default DemandStatGrid;
