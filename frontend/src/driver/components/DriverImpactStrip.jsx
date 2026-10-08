import { Leaf } from "lucide-react";
import "./DriverImpactStrip.css";

function formatKg(kg) {
  const value = Number(kg) || 0;
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function formatPeso(value) {
  return `₱${(Number(value) || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

// The driver's own slice of the fleet "Saved today" panel (see
// CarbonImpactPanel), in the words a driver uses: pesos of fuel saved while
// waiting with the engine off, and pesos wasted by sitting on the road with it
// running. No scores, no rider count (the app can't know how many people chose
// to ride). All estimates; figures come from get_driver_impact_summary.
function DriverImpactStrip({ summary }) {
  const today = summary?.periods?.today;
  const idle = today?.idle;
  const stops = idle?.episodes ?? 0;

  return (
    <div className="driver-impact-strip" aria-label="Your savings today">
      <div className="driver-impact-strip__headline">
        <span className="driver-impact-strip__badge">
          <Leaf size={12} strokeWidth={2.5} />
          Your savings today
        </span>
        <span className="driver-impact-strip__total">
          {today ? formatPeso(today.total_saved_php) : "…"}
          <span className="driver-impact-strip__unit"> of fuel saved</span>
        </span>
      </div>
      {today && (
        <p className="driver-impact-strip__sub">
          That keeps {formatKg(today.total_saved_co2_kg)} kg of CO₂ pollution out of the air.
        </p>
      )}

      <div className="driver-impact-strip__tiles">
        <div className="driver-impact-strip__tile driver-impact-strip__tile--warning">
          <span className="driver-impact-strip__label">Fuel wasted idling</span>
          <span className="driver-impact-strip__value">{idle ? formatPeso(idle.cost_php) : "…"}</span>
          <span className="driver-impact-strip__detail">
            {idle
              ? stops > 0
                ? `Stopped with the engine on ${stops === 1 ? "1 time" : `${stops} times`}`
                : "No idling today"
              : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

export default DriverImpactStrip;
