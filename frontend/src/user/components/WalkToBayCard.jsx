import "../../shared/styles/cardShell.css";
import "./WalkToBayCard.css";

const VOWEL_SOUND_PATTERN = /^[aeiou]/i;

function WalkToBayCard({ stepNumber, totalSteps, waitingAtBay, onArrivedAtBay }) {
  const jeepColorArticle = VOWEL_SOUND_PATTERN.test(waitingAtBay.jeepColorName) ? "an" : "a";

  return (
    <section className="card-shell walk-to-bay-card">
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
