import "./DemandStatGrid.css";

const TREND_DISPLAY = {
  increasing: { icon: "↑", label: "Rising" },
  decreasing: { icon: "↓", label: "Falling" },
  stable: { icon: "→", label: "Stable" },
  insufficient_data: { icon: "—", label: "Not enough data yet" },
};

// The stat block shared by WaitOrGoCard and OperatingStatusCard — both read
// from the same driver-demand-check response, just react differently to it.
function DemandStatGrid({ demandScore, compatibleCount, nearestDistanceKm, trend }) {
  const trendDisplay = TREND_DISPLAY[trend?.direction] ?? TREND_DISPLAY.insufficient_data;

  return (
    <dl className="demand-stat-grid">
      <div className="demand-stat-grid__item">
        <dt className="demand-stat-grid__label">Demand Score</dt>
        <dd className="demand-stat-grid__value">{demandScore}/100</dd>
      </div>
      <div className="demand-stat-grid__item">
        <dt className="demand-stat-grid__label">Compatible Riders</dt>
        <dd className="demand-stat-grid__value">{compatibleCount}</dd>
      </div>
      <div className="demand-stat-grid__item">
        <dt className="demand-stat-grid__label">Nearest Demand</dt>
        <dd className="demand-stat-grid__value">
          {nearestDistanceKm != null ? `${nearestDistanceKm} km` : "—"}
        </dd>
      </div>
      <div className="demand-stat-grid__item">
        <dt className="demand-stat-grid__label">Trend</dt>
        <dd className="demand-stat-grid__value">
          {trendDisplay.icon} {trendDisplay.label}
        </dd>
      </div>
    </dl>
  );
}

export default DemandStatGrid;
