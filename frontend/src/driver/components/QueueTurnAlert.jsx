import { useState } from "react";
import "./QueueTurnAlert.css";

// Shown when the backend (queue-advance) has flagged this driver's turn as
// approaching (queue_entries.notified_at set, responded_at still null).
// This is the only moment the system actively interrupts a waiting driver —
// being outside the terminal geofence otherwise never triggers a popup on
// its own (see driver-location-update). If the driver doesn't respond in
// time, queue-advance soft-skips them server-side (clears notified_at),
// which naturally hides this alert on the next poll/broadcast — no
// client-side timeout needed.
function QueueTurnAlert({
  queuePosition,
  geofenceStatus,
  isSubmitting,
  onLiningUp,
  onLeaveTemporarily,
  onEndShiftForTheDay,
}) {
  const [alertPhase, setAlertPhase] = useState("prompt");

  const handleSkipMe = () => setAlertPhase("skip_options");

  // At #1 while outside the terminal, dispatch is on hold for this driver
  // specifically (see queue-advance's geofence-gated promotion) — worth
  // more urgent copy than the standard "coming up" heads-up.
  const isUrgent = queuePosition === 1 && geofenceStatus === "outside";

  return (
    <div className="queue-turn-alert__backdrop">
      <div className="queue-turn-alert" role="alertdialog" aria-modal="true">
        <p className="queue-turn-alert__kicker">
          {isUrgent
            ? "YOUR TURN IS NOW — YOU'RE #1"
            : queuePosition != null
            ? `YOUR TURN IS COMING UP — YOU'RE #${queuePosition}`
            : "YOUR TURN IS COMING UP"}
        </p>
        <h2 className="queue-turn-alert__heading">
          {isUrgent
            ? "You're outside the terminal — please return now to continue your turn."
            : "Head back to your vehicle."}
        </h2>

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
