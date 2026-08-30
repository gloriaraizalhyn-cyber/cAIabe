import "./TripInfoPanel.css";

// Demo-only: the schema has no real passenger-count column (capacity is
// tracked as a plain available/full toggle), so this maps that existing
// real signal to a representative number and labels it clearly rather than
// pretending it's a measured count.
const MAX_CAPACITY_DEMO = 20;
const AVAILABLE_PASSENGER_COUNT_DEMO = 14;

function TripInfoPanel({ fuelInfo, capacityStatus }) {
  const passengerCount = capacityStatus === "full" ? MAX_CAPACITY_DEMO : AVAILABLE_PASSENGER_COUNT_DEMO;
  const fuel = fuelInfo?.fuel;
  const waitingCount = fuelInfo?.waiting_passenger_count;

  return (
    <div className="trip-info-panel">
      <div className="trip-info-panel__stat">
        <span className="trip-info-panel__stat-label">Passengers</span>
        <span className="trip-info-panel__stat-value">
          {passengerCount}/{MAX_CAPACITY_DEMO}
        </span>
        <span className="trip-info-panel__demo-tag">Demo data</span>
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
