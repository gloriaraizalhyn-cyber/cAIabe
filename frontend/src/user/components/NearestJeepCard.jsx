import { Sparkles } from "lucide-react";
import "../../shared/styles/cardShell.css";
import "./NearestJeepCard.css";

function NearestJeepCard({ waitingAtBay, onWaitForJeep, onSeeOtherOptions }) {
  const { nearestJeep, aiWaitRecommendation, jeepColorName } = waitingAtBay;
  const isGoRecommendation = aiWaitRecommendation.recommendationType === "go";

  return (
    <section className="card-shell nearest-jeep-card">
      <div className="nearest-jeep-card__header">
        <p className="nearest-jeep-card__label">NEAREST {jeepColorName} JEEP</p>
        <span
          className={
            nearestJeep.hasSeatsAvailable
              ? "nearest-jeep-card__availability-badge nearest-jeep-card__availability-badge--seats"
              : "nearest-jeep-card__availability-badge nearest-jeep-card__availability-badge--full"
          }
        >
          {nearestJeep.hasSeatsAvailable ? "SEATS AVAILABLE" : "FULL"}
        </span>
      </div>

      <p className="nearest-jeep-card__eta">
        <span className="nearest-jeep-card__eta-value">{nearestJeep.etaMinutes}</span>
        <span className="nearest-jeep-card__eta-unit">
          min away &middot; {nearestJeep.distanceKm} km
        </span>
      </p>

      <div
        className={
          isGoRecommendation
            ? "nearest-jeep-card__ai-note nearest-jeep-card__ai-note--go"
            : "nearest-jeep-card__ai-note nearest-jeep-card__ai-note--wait"
        }
      >
        <span className="nearest-jeep-card__ai-badge">
          <Sparkles size={12} strokeWidth={2.5} />
          AI
        </span>
        <p>
          <strong>{aiWaitRecommendation.headline}</strong>
          <br />
          {aiWaitRecommendation.body}
        </p>
      </div>

      <div className="nearest-jeep-card__actions">
        <button type="button" className="nearest-jeep-card__wait-button" onClick={onWaitForJeep}>
          Wait for this jeep
        </button>
        <button type="button" className="nearest-jeep-card__other-options-button" onClick={onSeeOtherOptions}>
          Go, other options
        </button>
      </div>
    </section>
  );
}

export default NearestJeepCard;
