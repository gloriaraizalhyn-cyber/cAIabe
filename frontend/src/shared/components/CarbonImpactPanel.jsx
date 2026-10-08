import { Leaf } from "lucide-react";
import { useCarbonImpact } from "../hooks/useCarbonImpact.js";
import "./CarbonImpactPanel.css";

function formatKg(kg) {
  const value = Number(kg) || 0;
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function formatMinutes(minutes) {
  const value = Math.round(Number(minutes) || 0);
  if (value < 60) return `${value} min`;
  return `${Math.floor(value / 60)}h ${value % 60}m`;
}

// Fleet-wide fuel and carbon totals for today — the "Impact" view.
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
      aria-label="Fuel and carbon impact today"
    >
      <div className="carbon-impact__headline">
        <span className="carbon-impact__badge">
          <Leaf size={14} strokeWidth={2.5} />
          Impact today
        </span>
        <span className="carbon-impact__total">
          {queue ? formatKg(queue.co2_kg) : "…"}
          <span className="carbon-impact__unit"> kg CO₂ avoided</span>
        </span>
      </div>

      <div className="carbon-impact__tiles">
        <div className="carbon-impact__tile">
          <span className="carbon-impact__tile-label">Engine-off queue time</span>
          <span className="carbon-impact__tile-value">{queue ? formatMinutes(queue.minutes) : "…"}</span>
          <span className="carbon-impact__tile-detail">
            {queue ? `${queue.liters} L · ${formatKg(queue.co2_kg)} kg CO₂ if engines off` : ""}
          </span>
        </div>

        <div className="carbon-impact__tile carbon-impact__tile--warning">
          <span className="carbon-impact__tile-label">Idling caught</span>
          <span className="carbon-impact__tile-value">{idle?.episodes ?? "…"}</span>
          <span className="carbon-impact__tile-detail">
            {idle ? `${idle.liters} L · ${formatKg(idle.co2_kg)} kg CO₂ flagged` : ""}
          </span>
        </div>
      </div>

      {!compact && (
        <p className="carbon-impact__footnote">
          Estimated. Diesel 2.68 kg CO₂/L, gasoline 2.31 kg CO₂/L; jeepney idle burn 1.2–1.8 L/hr.
          Engine-off time assumes drivers switch their engines off while queued.
        </p>
      )}
    </section>
  );
}

export default CarbonImpactPanel;
