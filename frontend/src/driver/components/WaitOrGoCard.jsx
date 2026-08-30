import DemandStatGrid from "./DemandStatGrid.jsx";
import "./WaitOrGoCard.css";

const RECOMMENDATION_META = {
  go: { emoji: "🟢", label: "GO", action: "LEAVE TERMINAL" },
  wait: { emoji: "🟡", label: "WAIT", action: "WAIT FOR MORE PASSENGERS" },
};

// Sak.AI's "WAIT or GO?" panel — shown while the driver is next up at the
// terminal. Every number here comes straight from driver-demand-check
// (real passenger_waiting_state rows on this driver's route, scored by
// calculateDriverDemand()); nothing is invented client-side.
function WaitOrGoCard({ data, isLoading, error, onUseTerminalLocation, onSkipToDriving, isSkippingToDriving }) {
  if (error) {
    return (
      <section className="wait-or-go-card wait-or-go-card--pending">
        <p className="wait-or-go-card__pending-text">
          Couldn't read passenger demand right now. Retrying…
        </p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="wait-or-go-card wait-or-go-card--pending">
        <p className="wait-or-go-card__pending-text">
          {onUseTerminalLocation
            ? "Waiting for your location to read passenger demand…"
            : "Reading passenger demand along your route…"}
        </p>
        {onUseTerminalLocation && (
          <button
            type="button"
            className="wait-or-go-card__demo-button"
            onClick={onUseTerminalLocation}
          >
            No GPS? Use terminal location instead
          </button>
        )}
      </section>
    );
  }

  const meta = RECOMMENDATION_META[data.recommendation] ?? RECOMMENDATION_META.wait;

  return (
    <section className={`wait-or-go-card wait-or-go-card--${data.recommendation}`}>
      <div className="wait-or-go-card__header">
        <span className="wait-or-go-card__kicker">AI RECOMMENDATION</span>
        {isLoading && <span className="wait-or-go-card__refreshing">Updating…</span>}
      </div>

      <div className="wait-or-go-card__badge-row">
        <span className="wait-or-go-card__badge">
          {meta.emoji} {meta.label}
        </span>
        <span className="wait-or-go-card__confidence">Confidence: {data.confidence}%</span>
      </div>

      <p className="wait-or-go-card__headline">{data.headline}</p>
      <p className="wait-or-go-card__body">{data.body}</p>

      {data.reasons?.length > 0 && (
        <div className="wait-or-go-card__why">
          <span className="wait-or-go-card__why-label">Why?</span>
          <ul className="wait-or-go-card__reasons">
            {data.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="wait-or-go-card__action">Recommended action: {meta.action}</p>

      <DemandStatGrid
        demandScore={data.demand_score}
        compatibleCount={data.compatible_passenger_count}
        nearestDistanceKm={data.nearest_distance_km}
        trend={data.trend}
      />

      {onSkipToDriving && (
        <button
          type="button"
          className="wait-or-go-card__demo-button wait-or-go-card__demo-button--footer"
          onClick={onSkipToDriving}
          disabled={isSkippingToDriving}
        >
          {isSkippingToDriving ? "Starting…" : "Skip wait (testing) — start driving now"}
        </button>
      )}
    </section>
  );
}

export default WaitOrGoCard;
