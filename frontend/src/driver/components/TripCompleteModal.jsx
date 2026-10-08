import { Check, EyeOff } from "lucide-react";
import AuthPattern from "../../shared/components/AuthPattern.jsx";
import "./TripCompleteModal.css";

function TripCompleteModal({ terminalName, tripTimeMinutes, newQueueSlot, onClose }) {
  return (
    <div className="trip-complete-modal__backdrop">
      <div className="trip-complete-modal" role="alertdialog" aria-modal="true">
        <AuthPattern className="trip-complete-modal__pattern" id="trip-complete-tile" scale={0.4} />

        <div className="trip-complete-modal__content">
          <span className="trip-complete-modal__icon" aria-hidden="true">
            <Check size={26} strokeWidth={3} />
          </span>

          <p className="trip-complete-modal__eyebrow">Trip complete</p>
          <h2 className="trip-complete-modal__heading">You've reached the end of your route.</h2>
          <p className="trip-complete-modal__body">
            cAIabe detected you back inside {terminalName}. Your status is now{" "}
            <strong className="trip-complete-modal__parked">Parked</strong>.
          </p>

          <div className="trip-complete-modal__stats">
            <div className="trip-complete-modal__stat">
              <span className="trip-complete-modal__stat-label">Trip time</span>
              <span className="trip-complete-modal__stat-value">
                {tripTimeMinutes}
                <span className="trip-complete-modal__stat-unit"> min</span>
              </span>
            </div>
            <div className="trip-complete-modal__stat trip-complete-modal__stat--accent">
              <span className="trip-complete-modal__stat-label">New queue slot</span>
              <span className="trip-complete-modal__stat-value">#{newQueueSlot}</span>
            </div>
          </div>

          <p className="trip-complete-modal__note">
            <EyeOff size={15} strokeWidth={2.4} aria-hidden="true" />
            <span>While parked, your unit is hidden from passenger maps.</span>
          </p>

          <button type="button" className="trip-complete-modal__close-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default TripCompleteModal;
