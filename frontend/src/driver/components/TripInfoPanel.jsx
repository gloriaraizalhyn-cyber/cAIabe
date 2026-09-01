import "./TripInfoPanel.css";

// The schema has no real passenger-count sensor — capacity is only ever
// reported as a driver-toggled available/full state (see
// driver-capacity-toggle) — so this shows that real signal directly rather
// than fabricating a specific headcount. Same "Full" (red) / "Seats open"
// (green) convention as the passenger-facing map markers in MapView.jsx.
function TripInfoPanel({ fuelInfo, capacityStatus }) {
  const isFull = capacityStatus === "full";
  const fuel = fuelInfo?.fuel;
  const waitingCount = fuelInfo?.waiting_passenger_count;

  return (
    <div className="trip-info-panel">
      <div className="trip-info-panel__stat">
        <span className="trip-info-panel__stat-label">Seats</span>
        <span
          className={`trip-info-panel__stat-value${
            isFull ? " trip-info-panel__stat-value--full" : " trip-info-panel__stat-value--open"
          }`}
        >
          {isFull ? "Full" : "Open"}
        </span>
      </div>

      <div className="trip-info-panel__stat">
        <span className="trip-info-panel__stat-label">Est. fuel used</span>
        <span className="trip-info-panel__stat-value">
          {fuel ? `${fuel.liters} L · ₱${fuel.cost}` : "…"}
        </span>
        {fuelInfo?.warning && (
          <span className="trip-info-panel__warning-tag">Heavy traffic</span>
        )}
      </div>

      {typeof waitingCount === "number" && (
        <div className="trip-info-panel__stat">
          <span className="trip-info-panel__stat-label">Passenger demand</span>
          <span className="trip-info-panel__stat-value">
            {waitingCount > 0
              ? `${waitingCount} waiting on your route`
              : "None waiting right now"}
          </span>
        </div>
      )}
    </div>
  );
}

export default TripInfoPanel;
