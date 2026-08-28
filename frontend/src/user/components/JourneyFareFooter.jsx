import "./JourneyFareFooter.css";

function formatFare(fare) {
  return `₱${fare.toFixed(2)}`;
}

function JourneyFareFooter({ fareSoFar, totalFare, advanceButtonLabel, onAdvance, onSaveRoute }) {
  return (
    <footer className="journey-fare-footer">
      <div className="journey-fare-footer__stats">
        <span className="journey-fare-footer__stat">
          <span className="journey-fare-footer__stat-label">FARE SO FAR</span>
          <span className="journey-fare-footer__stat-value">{formatFare(fareSoFar)}</span>
        </span>
        <span className="journey-fare-footer__stat journey-fare-footer__stat--right">
          <span className="journey-fare-footer__stat-label">TOTAL TRIP</span>
          <span className="journey-fare-footer__stat-value">{formatFare(totalFare)}</span>
        </span>
      </div>

      <button type="button" className="journey-fare-footer__advance-button" onClick={onAdvance}>
        {advanceButtonLabel}
      </button>
      <button type="button" className="journey-fare-footer__save-button" onClick={onSaveRoute}>
        Save this route for next time
      </button>
    </footer>
  );
}

export default JourneyFareFooter;
