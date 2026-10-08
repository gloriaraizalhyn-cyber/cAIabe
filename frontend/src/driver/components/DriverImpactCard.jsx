import "./DriverImpactCard.css";

function formatPeso(value) {
  const n = Number(value) || 0;
  return `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`;
}

function formatKg(value) {
  return `${(Number(value) || 0).toFixed(1)} kg`;
}

function PeriodColumn({ title, period }) {
  const wastedPhp = period?.idle?.cost_php ?? 0;
  const savedPhp = period?.total_saved_php ?? 0;
  const co2Saved = period?.total_saved_co2_kg ?? 0;
  const idleMinutes = Math.round(period?.idle?.minutes ?? 0);

  return (
    <div className="driver-impact-card__column">
      <h3 className="driver-impact-card__period">{title}</h3>

      <p className="driver-impact-card__label">Fuel saved</p>
      <p className="driver-impact-card__big driver-impact-card__big--good">{formatPeso(savedPhp)}</p>
      <p className="driver-impact-card__sub">{formatKg(co2Saved)} CO₂ not released</p>

      <p className="driver-impact-card__label">Fuel wasted idling</p>
      <p className="driver-impact-card__big driver-impact-card__big--bad">{formatPeso(wastedPhp)}</p>
      <p className="driver-impact-card__sub">{idleMinutes} min stopped on the road</p>
    </div>
  );
}

// Dashboard card: today vs this week, big numbers, no controls — meant to be
// readable at a glance. Everything is an estimate and labelled as such.
function DriverImpactCard({ summary, isLoading, error }) {
  if (error) return null; // never block the dashboard over a stats failure

  return (
    <section className="driver-impact-card" aria-label="Your fuel and CO2 impact">
      <h2 className="driver-impact-card__title">Your Fuel &amp; CO₂</h2>

      {!summary ? (
        <p className="driver-impact-card__sub">{isLoading ? "Loading your numbers…" : "No data yet."}</p>
      ) : (
        <>
          <div className="driver-impact-card__columns">
            <PeriodColumn title="Today" period={summary.periods?.today} />
            <PeriodColumn title="This week" period={summary.periods?.week} />
          </div>
          <p className="driver-impact-card__footnote">
            Estimates only. Uses {summary.km_per_liter} km per liter
            {summary.km_per_liter_is_default ? " (default for your vehicle)" : " (your own figure)"}.
          </p>
        </>
      )}
    </section>
  );
}

export default DriverImpactCard;
