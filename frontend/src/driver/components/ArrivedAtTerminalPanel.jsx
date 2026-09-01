import "./ArrivedAtTerminalPanel.css";

function ArrivedAtTerminalPanel({
  queuePosition,
  assignedRouteLabel,
  geofenceStatus,
  isTemporarilyAway,
  onViewQueue,
  onSkipQueueWait,
  isSkippingQueueWait,
  onEndShiftForTheDay,
  isEndingShift,
}) {
  // Chosen "Leave temporarily" — they keep their driver/queue record but are
  // excluded from FIFO/notify/promote until they physically return to the
  // terminal geofence, at which point they rejoin at the back with a fresh
  // timestamp (see driver-location-update). No numeric position to show.
  if (isTemporarilyAway) {
    return (
      <section className="arrived-at-terminal-panel">
        <div className="arrived-at-terminal-panel__status">
          <span className="arrived-at-terminal-panel__status-dot arrived-at-terminal-panel__status-dot--away" />
          Temporarily Away
        </div>
        <p className="arrived-at-terminal-panel__message">
          You stepped out of the active queue. Return to the terminal to rejoin at the back of the line — your old
          spot isn't held.
        </p>

        <div className="arrived-at-terminal-panel__waiting-status">Waiting for you to return</div>

        <button
          type="button"
          className="arrived-at-terminal-panel__skip-button"
          onClick={onEndShiftForTheDay}
          disabled={isEndingShift}
        >
          {isEndingShift ? "Ending shift…" : "Done for the day instead"}
        </button>
      </section>
    );
  }

  // Position #1 means there's no one ahead — nothing left to queue for, so
  // the action becomes "go see the live map" instead of "go see the queue".
  const isNextToGo = queuePosition === 1;
  const isOutsideGeofence = geofenceStatus === "outside";

  return (
    <section className="arrived-at-terminal-panel">
      <div className="arrived-at-terminal-panel__status">
        <span className="arrived-at-terminal-panel__status-dot" />
        You've Arrived
      </div>
      <p className="arrived-at-terminal-panel__message">You've been added to the queue.</p>

      <div className="arrived-at-terminal-panel__field">
        <span className="arrived-at-terminal-panel__field-label">Queue Position</span>
        <span className="arrived-at-terminal-panel__queue-position">#{queuePosition}</span>
      </div>

      <div className="arrived-at-terminal-panel__field">
        <span className="arrived-at-terminal-panel__field-label">Assigned Route</span>
        <span className="arrived-at-terminal-panel__field-value">{assignedRouteLabel}</span>
      </div>

      {geofenceStatus && (
        <div
          className={`arrived-at-terminal-panel__geofence arrived-at-terminal-panel__geofence--${
            isOutsideGeofence ? "outside" : "inside"
          }`}
        >
          {isOutsideGeofence ? "🟡 Outside terminal — your spot is still held" : "🟢 At terminal"}
        </div>
      )}

      <div className="arrived-at-terminal-panel__waiting-status">Waiting for your turn</div>

      <button type="button" className="arrived-at-terminal-panel__view-queue-button" onClick={onViewQueue}>
        {isNextToGo ? "View Map" : "View Queue"}
      </button>

      {onSkipQueueWait && (
        <button
          type="button"
          className="arrived-at-terminal-panel__skip-button"
          onClick={onSkipQueueWait}
          disabled={isSkippingQueueWait}
        >
          {isSkippingQueueWait ? "Skipping…" : "Skip wait (testing) — go to front now"}
        </button>
      )}
    </section>
  );
}

export default ArrivedAtTerminalPanel;
