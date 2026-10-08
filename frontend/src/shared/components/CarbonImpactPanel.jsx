import { Leaf } from "lucide-react";
import { useCarbonImpact } from "../hooks/useCarbonImpact.js";
import "./CarbonImpactPanel.css";

function formatKg(kg) {
  const value = Number(kg) || 0;
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

// Whole litres once it's 10 or more, one decimal below that.
function formatLiters(liters) {
  const value = Number(liters) || 0;
  return value >= 10 ? Math.round(value).toString() : value.toFixed(1);
}

function times(count) {
  return count === 1 ? "1 time" : `${count} times`;
}

// Fleet-wide fuel and pollution savings for today. Worded for ordinary people,
// not engineers: fuel in litres, and CO₂ as "pollution". Internally this is
// still the same fuel model as the rest of the app (fuel.ts).
// Every number is an estimate built on the same fuel model as the rest of
// the app (fuel.ts); the footnote says so. variant="dark" matches the demo
// stage's projector theme, "light" the admin dashboard.
//
// "Avoided" (headline) = queue time at the terminal with engines off.
// Roadside idling is shown separately as burn CAUGHT, never added to the
// avoided total. Riders are deliberately NOT counted here: the app can't
// know how many people actually chose to ride (the backend still logs
// rider_trip events, but nothing reads them into this panel).
function CarbonImpactPanel({ variant = "light", compact = false }) {
  const { summary, error } = useCarbonImpact();

  if (error) {
    return (
      <section className={`carbon-impact carbon-impact--${variant}`}>
        <p className="carbon-impact__error">Carbon impact unavailable — run add_carbon_impact.sql.</p>
      </section>
    );
  }

  const queue = summary?.queue_engine_off;
  const idle = summary?.roadside_idle;

  return (
    <section
      className={`carbon-impact carbon-impact--${variant}${compact ? " carbon-impact--compact" : ""}`}
      aria-label="Fuel saved today"
    >
      <div className="carbon-impact__headline">
        <span className="carbon-impact__badge">
          <Leaf size={14} strokeWidth={2.5} />
          Saved today
        </span>
        <span className="carbon-impact__total">
          {queue ? formatLiters(queue.liters) : "…"}
          <span className="carbon-impact__unit"> liters of fuel</span>
        </span>
      </div>
      <p className="carbon-impact__sub">
        {queue ? `That keeps ${formatKg(queue.co2_kg)} kg of CO₂ pollution out of the air.` : ""}
      </p>

      <div className="carbon-impact__tiles">
        <div className="carbon-impact__tile carbon-impact__tile--warning">
          <span className="carbon-impact__tile-label">Fuel wasted idling</span>
          <span className="carbon-impact__tile-value">{idle ? `${formatLiters(idle.liters)} L` : "…"}</span>
          <span className="carbon-impact__tile-detail">
            {idle
              ? idle.episodes > 0
                ? `Drivers stopped on the road with the engine on, ${times(idle.episodes)}`
                : "No one idled on the road"
              : ""}
          </span>
        </div>
      </div>

      {!compact && (
        <p className="carbon-impact__footnote">
          These are estimates. We assume drivers switch their engines off while they wait in the
          queue, and count how much fuel that saves compared with leaving them running.
        </p>
      )}
    </section>
  );
}

export default CarbonImpactPanel;
