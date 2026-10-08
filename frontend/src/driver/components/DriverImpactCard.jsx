import { useState } from "react";
import { Clock, Leaf, Fuel } from "lucide-react";
import "./DriverImpactCard.css";

function formatPeso(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("en-PH", { maximumFractionDigits: 0 });
}

function formatKg(value) {
  return (Number(value) || 0).toFixed(1);
}

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
];

function Stat({ tone, icon, label, peso, sub }) {
  return (
    <div className={`driver-impact-card__stat driver-impact-card__stat--${tone}`}>
      <span className="driver-impact-card__stat-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="driver-impact-card__stat-copy">
        <p className="driver-impact-card__label">{label}</p>
        <p className="driver-impact-card__big">
          <span className="driver-impact-card__peso">₱</span>
          {peso}
        </p>
        <p className="driver-impact-card__sub">{sub}</p>
      </div>
    </div>
  );
}

// Dashboard card: one period at a time (Today / This week), two big numbers,
// readable at a glance. Everything is an estimate and labelled as such.
function DriverImpactCard({ summary, isLoading, error }) {
  const [periodKey, setPeriodKey] = useState("today");

  if (error) return null; // never block the dashboard over a stats failure

  const period = summary?.periods?.[periodKey];
  const savedPhp = period?.total_saved_php ?? 0;
  const co2Saved = period?.total_saved_co2_kg ?? 0;
  const wastedPhp = period?.idle?.cost_php ?? 0;
  const idleMinutes = Math.round(period?.idle?.minutes ?? 0);

  return (
    <section className="driver-impact-card" aria-label="Your fuel and CO2 impact">
      <header className="driver-impact-card__head">
        <div>
          <p className="driver-impact-card__eyebrow">Your impact</p>
          <h2 className="driver-impact-card__title">Fuel and CO₂</h2>
        </div>

        <div className="driver-impact-card__tabs" role="tablist" aria-label="Time period">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={periodKey === p.key}
              className={`driver-impact-card__tab${periodKey === p.key ? " driver-impact-card__tab--active" : ""}`}
              onClick={() => setPeriodKey(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {!summary ? (
        <p className="driver-impact-card__empty">{isLoading ? "Loading your numbers…" : "No data yet."}</p>
      ) : (
        <>
          <div className="driver-impact-card__stats">
            <Stat
              tone="good"
              icon={<Leaf size={18} strokeWidth={2.4} />}
              label="Fuel saved"
              peso={formatPeso(savedPhp)}
              sub={`${formatKg(co2Saved)} kg CO₂ not released`}
            />
            <Stat
              tone="bad"
              icon={<Fuel size={18} strokeWidth={2.4} />}
              label="Wasted idling"
              peso={formatPeso(wastedPhp)}
              sub={`${idleMinutes} min stopped on the road`}
            />
          </div>

          <p className="driver-impact-card__footnote">
            <Clock size={13} strokeWidth={2.4} aria-hidden="true" />
            <span>
              Estimates only, based on {summary.km_per_liter} km per liter
              {summary.km_per_liter_is_default ? " (default for your vehicle)" : " (your own figure)"}.
            </span>
          </p>
        </>
      )}
    </section>
  );
}

export default DriverImpactCard;

