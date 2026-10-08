import { Leaf } from "lucide-react";
import "./DriverImpactStrip.css";

function formatMinutes(minutes) {
  const value = Math.round(Number(minutes) || 0);
  if (value < 60) return `${value} min`;
  return `${Math.floor(value / 60)}h ${value % 60}m`;
}

function formatKg(kg) {
  const value = Number(kg) || 0;
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function formatPeso(value) {
  return `₱${(Number(value) || 0).toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

// The driver's own slice of the fleet "Impact today" panel (see
// CarbonImpactPanel): CO2 avoided by engine-off time, how long this driver
// has been queued with the engine off, and the roadside idling Sak.AI caught.
// Deliberately has no rider count — the app can't know how many people chose
// to ride. All estimates; figures come from get_driver_impact_summary.
function DriverImpactStrip({ summary }) {
  const today = summary?.periods?.today;
  const queue = today?.queue_engine_off;
  const idle = today?.idle;

  return (
    <div className="driver-impact-strip" aria-label="Your impact today">
      <div className="driver-impact-strip__headline">
        <span className="driver-impact-strip__badge">
          <Leaf size={12} strokeWidth={2.5} />
          Your impact today
        </span>
        <span className="driver-impact-strip__total">
          {today ? formatKg(today.total_saved_co2_kg) : "…"}
          <span className="driver-impact-strip__unit"> kg CO₂ avoided</span>
        </span>
      </div>

      <div className="driver-impact-strip__tiles">
        <div className="driver-impact-strip__tile">
          <span className="driver-impact-strip__label">Engine-off queue time</span>
          <span className="driver-impact-strip__value">{queue ? formatMinutes(queue.minutes) : "…"}</span>
          <span className="driver-impact-strip__detail">
            {today ? `${formatPeso(today.total_saved_php)} fuel saved` : ""}
          </span>
        </div>

        <div className="driver-impact-strip__tile driver-impact-strip__tile--warning">
          <span className="driver-impact-strip__label">Idling caught</span>
          <span className="driver-impact-strip__value">{idle ? idle.episodes : "…"}</span>
          <span className="driver-impact-strip__detail">
            {idle ? `${formatPeso(idle.cost_php)} wasted · ${formatKg(idle.co2_kg)} kg CO₂` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

export default DriverImpactStrip;
