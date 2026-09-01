import DemandStatGrid from "./DemandStatGrid.jsx";
import "./ParkedDemandCard.css";

const RECOMMENDATION_META = {
  go: { emoji: "🟢", label: "GO" },
  wait: { emoji: "🟡", label: "WAIT" },
};

// Lets a parked/queued driver "check the system for waiting passengers on
// his route" (per the product spec) even before being promoted to
// next-to-go — same Sak.AI demand engine driver-demand-check already powers
// for WaitOrGoCard, just rendered as a plain stacked panel card here instead
// of a floating map overlay (this page has no full-bleed map behind it the
// way NextToGoPage/DrivingPage do, so WaitOrGoCard's absolute positioning
// doesn't apply). Deliberately omits WaitOrGoCard's "Recommended action:
// LEAVE TERMINAL" line — a driver who isn't next-to-go yet can't act on
// that regardless of demand, so showing it here would be misleading.
function ParkedDemandCard({ data, isLoading, error }) {
  if (error) {
    return (
      <section className="parked-demand-card">
        <p className="parked-demand-card__pending-text">Couldn't read passenger demand right now.</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="parked-demand-card">
        <p className="parked-demand-card__pending-text">Reading passenger demand along your route…</p>
      </section>
    );
  }

  const meta = RECOMMENDATION_META[data.recommendation] ?? RECOMMENDATION_META.wait;

  return (
    <section className="parked-demand-card">
      <div className="parked-demand-card__header">
        <span className="parked-demand-card__kicker">PASSENGER DEMAND ON YOUR ROUTE</span>
        {isLoading && <span className="parked-demand-card__refreshing">Updating…</span>}
      </div>

      <div className="parked-demand-card__badge-row">
        <span className="parked-demand-card__badge">
          {meta.emoji} {meta.label}
        </span>
      </div>

      <p className="parked-demand-card__headline">{data.headline}</p>
      <p className="parked-demand-card__body">{data.body}</p>

      <DemandStatGrid
        demandScore={data.demand_score}
        compatibleCount={data.compatible_passenger_count}
        nearestDistanceKm={data.nearest_distance_km}
        trend={data.trend}
      />
    </section>
  );
}

export default ParkedDemandCard;
