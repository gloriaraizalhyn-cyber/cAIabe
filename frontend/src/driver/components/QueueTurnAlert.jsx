import { useState } from "react";
import "./QueueTurnAlert.css";

// Shown when the backend (queue-advance) has flagged this driver as next-2
// in the queue (queue_entries.notified_at set, responded_at still null).
// Per the PRD, this is the ONLY moment the system actively intervenes while
// a driver is waiting — it is not tied to GPS/physical presence in any way.
// If the driver doesn't respond in time, queue-advance soft-skips them
// server-side (clears notified_at), which naturally hides this alert on the
// next poll/broadcast — no client-side timeout needed.
function QueueTurnAlert({ queuePosition, isSubmitting, onLiningUp, onLeaveTemporarily, onEndShiftForTheDay }) {
  const [alertPhase, setAlertPhase] = useState("prompt");

  const handleSkipMe = () => setAlertPhase("skip_options");

  return (
    <div className="queue-turn-alert__backdrop">
      <div className="queue-turn-alert" role="alertdialog" aria-modal="true">
        <p className="queue-turn-alert__kicker">
          {queuePosition != null ? `YOUR TURN IS COMING UP — YOU'RE #${queuePosition}` : "YOUR TURN IS COMING UP"}
        </p>
        <h2 className="queue-turn-alert__heading">Head back to your vehicle.</h2>

        {alertPhase === "prompt" && (
          <div className="queue-turn-alert__actions">
            <button
              type="button"
              className="queue-turn-alert__button queue-turn-alert__button--primary"
              onClick={onLiningUp}
              disabled={isSubmitting}
            >
              Lining up
            </button>
            <button
              type="button"
              className="queue-turn-alert__button queue-turn-alert__button--secondary"
              onClick={handleSkipMe}
              disabled={isSubmitting}
            >
              Skip me
            </button>
          </div>
        )}

        {alertPhase === "skip_options" && (
          <div className="queue-turn-alert__actions">
            <button
              type="button"
              className="queue-turn-alert__button queue-turn-alert__button--secondary"
              onClick={onLeaveTemporarily}
              disabled={isSubmitting}
            >
              Leave temporarily
            </button>
            <button
              type="button"
              className="queue-turn-alert__button queue-turn-alert__button--danger"
              onClick={onEndShiftForTheDay}
              disabled={isSubmitting}
            >
              Done for the day
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default QueueTurnAlert;
