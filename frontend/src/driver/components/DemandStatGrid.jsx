import { formatDistance } from "../utils/plainDemand.js";
import "./DemandStatGrid.css";

// Only a clear change is worth telling a driver; "stable" and "not enough
// data yet" are noise, so they are simply not shown.
const TREND_DISPLAY = {
  increasing: { icon: "↑", label: "More coming" },
  decreasing: { icon: "↓", label: "Fewer than before" },
};

// The stat block shared by WaitOrGoCard, OperatingStatusCard and
// ParkedDemandCard — all read the same driver-demand-check response. Kept to
// what a driver can act on: how many are waiting, how far the nearest is, and
// whether more are coming. The 0-100 score is for the "More details" view
// only (pass `demandScore` to show it).
function DemandStatGrid({ demandScore = null, compatibleCount, nearestDistanceKm, trend }) {
  const trendDisplay = TREND_DISPLAY[trend?.direction] ?? null;
  const distance = formatDistance(nearestDistanceKm);

  return (
    <dl className="demand-stat-grid">
      <div className="demand-stat-grid__item">
        <dt className="demand-stat-grid__label">Passengers waiting</dt>
        <dd className="demand-stat-grid__value">{compatibleCount ?? 0}</dd>
      </div>
      <div className="demand-stat-grid__item">
        <dt className="demand-stat-grid__label">Nearest</dt>
        <dd className="demand-stat-grid__value">{distance ? `${distance} away` : "None yet"}</dd>
      </div>
      {trendDisplay && (
        <div className="demand-stat-grid__item demand-stat-grid__item--wide">
          <dt className="demand-stat-grid__label">Passengers</dt>
          <dd className="demand-stat-grid__value">
            {trendDisplay.icon} {trendDisplay.label}
          </dd>
        </div>
      )}
      {demandScore !== null && (
        <div className="demand-stat-grid__item demand-stat-grid__item--wide">
          <dt className="demand-stat-grid__label">Demand score</dt>
          <dd className="demand-stat-grid__value">{demandScore}/100</dd>
        </div>
      )}
    </dl>
  );
}

export default DemandStatGrid;
