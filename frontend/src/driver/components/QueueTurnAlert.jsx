import "./QueueTurnAlert.css";

// Shown when the backend (queue-advance) has flagged this driver's turn as
// approaching (queue_entries.notified_at set, responded_at still null).
// This is the only moment the system actively interrupts a waiting driver —
// being outside the terminal geofence otherwise never triggers a popup on
// its own (see driver-location-update). If the driver doesn't respond in
// time, queue-advance soft-skips them server-side (clears notified_at),
// which naturally hides this alert on the next poll/broadcast — no
// client-side timeout needed.
function QueueTurnAlert({ queuePosition }) {
  // There used to be an "urgent" version for a driver at #1 who was "outside
  // the terminal" ("please return now"). It is gone: that depends on the
  // terminal-geofence status, which is switched off server-side
  // (GEOFENCE_ENABLED in driver-location-update) — so every queued driver was
  // "outside" by default and was told to return when they were already there.
  return (
    <div className="queue-turn-alert__backdrop">
      <div className="queue-turn-alert" role="alertdialog" aria-modal="true">
        <p className="queue-turn-alert__kicker">
          {queuePosition != null
            ? `YOUR TURN IS COMING UP — YOU'RE #${queuePosition}`
            : "YOUR TURN IS COMING UP"}
        </p>
        <h2 className="queue-turn-alert__heading">Head back to your vehicle.</h2>
      </div>
    </div>
  );
}

export default QueueTurnAlert;
