import "../../shared/styles/cardShell.css";
import "./WalkToBayCard.css";

const VOWEL_SOUND_PATTERN = /^[aeiou]/i;

function WalkToBayCard({ stepNumber = 1, totalSteps = 2, waitingAtBay, onArrivedAtBay }) {
  const jeepColor = waitingAtBay?.jeepColorName || "Red";
  const routeName = waitingAtBay?.jeepneyLineCode || "Selected Route";
  const bayName = waitingAtBay?.bayName || "Terminal Bay";

  return (
    <section className="card-shell walk-to-bay-card">
      <p className="walk-to-bay-card__step">
        STEP {stepNumber} OF {totalSteps}
      </p>
      <h1 className="walk-to-bay-card__title">Walk to the {bayName}</h1>
      <p className="walk-to-bay-card__body">
        The jeepney you are waiting for is color <strong style={{ textTransform: "capitalize" }}>{jeepColor}</strong> ({routeName}). Walk to the {bayName} and tap below once you arrive — drivers on this route will see you waiting in real time.
      </p>
      <button type="button" className="walk-to-bay-card__arrived-button" onClick={onArrivedAtBay}>
        I'm here!
      </button>
    </section>
  );
}

export default WalkToBayCard;
