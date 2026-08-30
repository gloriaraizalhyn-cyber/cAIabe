import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import DemandStatGrid from "./DemandStatGrid.jsx";
import "./OperatingStatusCard.css";

const STATUS_META = {
  continue: { emoji: "🟢", label: "CONTINUE OPERATING" },
  continue_caution: { emoji: "🟡", label: "CONTINUE WITH CAUTION" },
  garage: { emoji: "🔵", label: "GARAGE" },
};

// Sak.AI's "CONTINUE or GARAGE?" panel — shown while the driver is out on
// the route. Reuses the same driver-demand-check response as WaitOrGoCard
// (data.operating), weighed against the real recent-vs-prior request trend
// via calculateOperatingDemand() server-side. Always framed as a suggestion
// — the driver makes the final call.
function OperatingStatusCard({ data, isLoading, onUseTerminalLocation }) {
  const [expanded, setExpanded] = useState(false);

  if (!data?.operating) {
    if (!onUseTerminalLocation) return null;
    return (
      <section className="operating-status-card operating-status-card--pending">
        <p className="operating-status-card__body">Waiting for your location to read passenger demand…</p>
        <button type="button" className="operating-status-card__demo-button" onClick={onUseTerminalLocation}>
          No GPS? Use terminal location instead
        </button>
      </section>
    );
  }

  const operating = data.operating;
  const meta = STATUS_META[operating.recommendation] ?? STATUS_META.continue_caution;

  return (
    <section className={`operating-status-card operating-status-card--${operating.recommendation}`}>
      <button
        type="button"
        className="operating-status-card__header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="operating-status-card__badge">
          {meta.emoji} {meta.label}
        </span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      <p className="operating-status-card__body">{operating.body}</p>

      {expanded && (
        <>
          {operating.reasons?.length > 0 && (
            <ul className="operating-status-card__reasons">
              {operating.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <DemandStatGrid
            demandScore={data.demand_score}
            compatibleCount={data.compatible_passenger_count}
            nearestDistanceKm={data.nearest_distance_km}
            trend={data.trend}
          />
          <p className="operating-status-card__disclaimer">
            A suggestion, not a command — you decide when to head back.
          </p>
        </>
      )}

      {isLoading && <span className="operating-status-card__refreshing">Updating…</span>}
    </section>
  );
}

export default OperatingStatusCard;
