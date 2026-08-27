import "../../shared/styles/cardShell.css";
import useBottomSheetDrag from "../../shared/hooks/useBottomSheetDrag.js";
import "./WalkToBayCard.css";

const VOWEL_SOUND_PATTERN = /^[aeiou]/i;

function WalkToBayCard({ stepNumber, totalSteps, waitingAtBay, onArrivedAtBay }) {
  const { isExpanded, liveDragY, handlePointerDown, handlePointerMove, handlePointerUp } = useBottomSheetDrag();
  const jeepColorArticle = VOWEL_SOUND_PATTERN.test(waitingAtBay.jeepColorName) ? "an" : "a";

  return (
    <section
      className={`card-shell card-shell--compact walk-to-bay-card${isExpanded ? " card-shell--expanded" : ""}`}
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
      <p className="walk-to-bay-card__step">
        STEP {stepNumber} OF {totalSteps}
      </p>
      <h1 className="walk-to-bay-card__title">Walk to the {waitingAtBay.bayName}</h1>
      <p className="walk-to-bay-card__body">
        Then wait for {jeepColorArticle} <strong>{waitingAtBay.jeepColorName}</strong> jeep. Tap
        below once you're standing at the bay — drivers on {waitingAtBay.jeepneyLineCode} will
        see you waiting.
      </p>
      <button type="button" className="walk-to-bay-card__arrived-button" onClick={onArrivedAtBay}>
        I'm here!
      </button>
    </section>
  );
}

export default WalkToBayCard;
