import useBottomSheetDrag from "../../shared/hooks/useBottomSheetDrag.js";
import AiNote from "../../shared/components/AiNote.jsx";
import "../../shared/styles/cardShell.css";
import "./NearestJeepCard.css";

function NearestJeepCard({ waitingAtBay, onWaitForJeep, onSeeOtherOptions, isWatchingForDeparture = false }) {
  const { isExpanded, liveDragY, handlePointerDown, handlePointerMove, handlePointerUp } = useBottomSheetDrag();
  const jeepColorName = waitingAtBay?.jeepColorName || "Jeepney";
  const nearestJeep = waitingAtBay?.nearestJeep || {
    hasSeatsAvailable: true,
    etaMinutes: 3,
    distanceKm: "0.8",
  };
  const aiWaitRecommendation = waitingAtBay?.aiWaitRecommendation || {
    recommendationType: "go",
    headline: `The jeepney you are waiting for is color ${jeepColorName}`,
    body: "An active unit is approaching along this route.",
  };
  const isGoRecommendation = aiWaitRecommendation.recommendationType === "go";

  return (
    <section
      className={`card-shell card-shell--compact nearest-jeep-card${isExpanded ? " card-shell--expanded" : ""}`}
      style={liveDragY !== null ? { transform: `translateY(${liveDragY}px)`, transition: "none" } : undefined}
    >
      <div
        className="card-shell__drag-handle"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span className="card-shell__drag-handle-bar" />
      </div>
      <div className="nearest-jeep-card__header">
        <p className="nearest-jeep-card__label">NEAREST {jeepColorName.toUpperCase()} JEEP</p>
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

      <AiNote
        tone={isGoRecommendation ? "urgent" : "calm"}
        headline={aiWaitRecommendation.headline}
        body={aiWaitRecommendation.body}
        className="nearest-jeep-card__ai-note"
      />

      {isWatchingForDeparture && (
        <p className="nearest-jeep-card__departure-status">
          Watching your location — you'll be marked on board automatically once the jeep starts moving.
        </p>
      )}

      <div className="nearest-jeep-card__actions">
        <button
          type="button"
          className="nearest-jeep-card__wait-button"
          onClick={onWaitForJeep}
          disabled={isWatchingForDeparture}
        >
          {isWatchingForDeparture ? "Waiting for departure…" : "Wait for this jeep"}
        </button>
        <button type="button" className="nearest-jeep-card__other-options-button" onClick={onSeeOtherOptions}>
          Go, other options
        </button>
      </div>
    </section>
  );
}

export default NearestJeepCard;
