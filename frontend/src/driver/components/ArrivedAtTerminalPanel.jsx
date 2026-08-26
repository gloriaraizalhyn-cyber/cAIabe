import "./ArrivedAtTerminalPanel.css";

function ArrivedAtTerminalPanel({ queuePosition, assignedRouteLabel, onViewQueue }) {
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

      <div className="arrived-at-terminal-panel__waiting-status">Waiting for your turn</div>

      <button type="button" className="arrived-at-terminal-panel__view-queue-button" onClick={onViewQueue}>
        View Queue
      </button>
    </section>
  );
}

export default ArrivedAtTerminalPanel;
