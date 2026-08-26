import "./ShiftSummaryCard.css";

function ShiftSummaryCard({ assignedRouteLabel, assignedTerminalName, onStartShift }) {
  return (
    <section className="shift-summary-card">
      <div className="shift-summary-card__field">
        <span className="shift-summary-card__field-label">Assigned Route</span>
        <span className="shift-summary-card__field-value">{assignedRouteLabel}</span>
      </div>
      <div className="shift-summary-card__field">
        <span className="shift-summary-card__field-label">Assigned Terminal</span>
        <span className="shift-summary-card__field-value">{assignedTerminalName}</span>
      </div>
      <div className="shift-summary-card__status">
        <span className="shift-summary-card__status-dot" />
        Shift Not Started
      </div>
      <button type="button" className="shift-summary-card__start-button" onClick={onStartShift}>
        Start Shift
      </button>
    </section>
  );
}

export default ShiftSummaryCard;
