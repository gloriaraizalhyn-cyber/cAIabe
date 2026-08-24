import "./TripCompleteModal.css";

function TripCompleteModal({ terminalName, tripTimeMinutes, newQueueSlot, onClose }) {
  return (
    <div className="trip-complete-modal__backdrop">
      <div className="trip-complete-modal" role="alertdialog" aria-modal="true">
        <h2 className="trip-complete-modal__heading">You've reached the end of your route.</h2>
        <p className="trip-complete-modal__body">
          cAIabe detected you back inside {terminalName}. Your status is now{" "}
          <strong className="trip-complete-modal__parked">Parked</strong>.
        </p>

        <div className="trip-complete-modal__stats">
          <div className="trip-complete-modal__stat-row">
            <span className="trip-complete-modal__stat-label">Trip time</span>
            <span className="trip-complete-modal__stat-value">{tripTimeMinutes} min</span>
          </div>
          <div className="trip-complete-modal__stat-row">
            <span className="trip-complete-modal__stat-label">New queue slot</span>
            <span className="trip-complete-modal__stat-value trip-complete-modal__stat-value--accent">
              #{newQueueSlot}
            </span>
          </div>
        </div>

        <p className="trip-complete-modal__note">
          While parked, your unit is hidden from passenger maps.
        </p>

        <button type="button" className="trip-complete-modal__close-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

export default TripCompleteModal;
