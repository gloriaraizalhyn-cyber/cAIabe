import { useEffect, useState } from "react";
import { X } from "lucide-react";
import DemandStatGrid from "./DemandStatGrid.jsx";
import { describeWaitOrGo } from "../utils/plainDemand.js";
import "./WaitOrGoCard.css";

const RECOMMENDATION_META = {
  go: { emoji: "🟢", label: "GO" },
  wait: { emoji: "🟡", label: "WAIT" },
};

// Sak.AI's "WAIT or GO?" panel — shown while the driver is next up at the
// terminal. Every number here comes straight from driver-demand-check
// (real passenger_waiting_state rows on this driver's route, scored by
// calculateDriverDemand()); nothing is invented client-side.
//
// What a driver sees by default is deliberately small: the call (GO or WAIT),
// one plain sentence, how many passengers are waiting and how far the nearest
// is. The score, confidence, AI explanation and reasons are one tap away under
// "More details" for anyone who wants to see how the call was made.
function WaitOrGoCard({ data, isLoading, error, onUseTerminalLocation, onSkipToDriving, isSkippingToDriving }) {
  const [showDetails, setShowDetails] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // A new call (WAIT -> GO or back) is worth a fresh look, so it reopens the card.
  useEffect(() => {
    setIsDismissed(false);
  }, [data?.recommendation]);

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
  const sentence = describeWaitOrGo({
    recommendation: data.recommendation,
    compatibleCount: data.compatible_passenger_count,
    nearestDistanceKm: data.nearest_distance_km,
  });

  if (isDismissed) {
    return (
      <button
        type="button"
        className="wait-or-go-card__reopen"
        onClick={() => setIsDismissed(false)}
      >
        {meta.emoji} {meta.label} · Wait or go?
      </button>
    );
  }

  return (
    <section className={`wait-or-go-card wait-or-go-card--${data.recommendation}`}>
      <div className="wait-or-go-card__header">
        <span className="wait-or-go-card__kicker">WAIT OR GO?</span>
        {isLoading && <span className="wait-or-go-card__refreshing">Updating…</span>}
        <button
          type="button"
          className="wait-or-go-card__close"
          aria-label="Close"
          onClick={() => setIsDismissed(true)}
        >
          <X size={16} strokeWidth={2.6} />
        </button>
      </div>

      <div className="wait-or-go-card__badge-row">
        <span className="wait-or-go-card__badge">
          {meta.emoji} {meta.label}
        </span>
      </div>

      <p className="wait-or-go-card__headline">{sentence}</p>

      <DemandStatGrid
        compatibleCount={data.compatible_passenger_count}
        nearestDistanceKm={data.nearest_distance_km}
        trend={data.trend}
      />

      <button
        type="button"
        className="wait-or-go-card__details-toggle"
        onClick={() => setShowDetails((value) => !value)}
        aria-expanded={showDetails}
      >
        {showDetails ? "Hide details" : "More details"}
      </button>

      {showDetails && (
        <div className="wait-or-go-card__details">
          <p className="wait-or-go-card__body">{data.body}</p>
          {data.reasons?.length > 0 && (
            <ul className="wait-or-go-card__reasons">
              {data.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <p className="wait-or-go-card__fine-print">
            Demand score {data.demand_score}/100 · Confidence {data.confidence}%
          </p>
        </div>
      )}

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

