import "./RoadsideIdleCard.css";

const STATUS_META = {
  monitoring: { emoji: "🟡", label: "MONITORING" },
  idling: { emoji: "⚠️", label: "POTENTIAL IDLING" },
  prolonged: { emoji: "⚠️", label: "PROLONGED IDLING" },
};

function formatMmSs(minutes) {
  const totalSeconds = Math.max(0, Math.round(minutes * 60));
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

// Sak.AI's roadside-idling card — outside the terminal, stationary, past a
// duration threshold (see useRoadsideIdleTracker.js). Renders nothing while
// not relevant, per the PRD's own "don't show fuel cost constantly"
// instruction. Badge/headline/body/fuel figures always come from the
// server (roadsideIdle — driver-demand-check's response), never invented
// client-side; liveMinutes (the hook's local ticking timer) only drives the
// mm:ss display so it doesn't visibly stall between ~12s poll ticks.
function RoadsideIdleCard({ roadsideIdle, liveMinutes }) {
  if (!roadsideIdle) return null;

  const meta = STATUS_META[roadsideIdle.status] ?? STATUS_META.monitoring;
  const fuel = roadsideIdle.fuel;

  return (
    <section className={`roadside-idle-card roadside-idle-card--${roadsideIdle.status}`}>
      <div className="roadside-idle-card__header">
        <span className="roadside-idle-card__badge">
          {meta.emoji} {meta.label}
        </span>
        <span className="roadside-idle-card__timer">{formatMmSs(liveMinutes)}</span>
      </div>

      {roadsideIdle.headline && <p className="roadside-idle-card__headline">{roadsideIdle.headline}</p>}
      {roadsideIdle.body && <p className="roadside-idle-card__body">{roadsideIdle.body}</p>}

      {fuel && (
        <div className="roadside-idle-card__fuel">
          <span className="roadside-idle-card__fuel-label">Estimated fuel while idling</span>
          <span className="roadside-idle-card__fuel-value">
            {fuel.min_liters}–{fuel.max_liters} L (₱{fuel.min_cost}–₱{fuel.max_cost})
          </span>
        </div>
      )}
    </section>
  );
}

export default RoadsideIdleCard;
