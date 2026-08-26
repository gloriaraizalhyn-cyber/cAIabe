import "./DrivingMapCanvas.css";

// Purely illustrative placeholder — not the real Google Map. Shows the
// driver's own position (with their unit nickname) and the nearest waiting
// pickup along the route.
function DrivingMapCanvas({ unitNickname, nextPickup, capacityStatus }) {
  return (
    <div className="driving-map">
      <div className="driving-map__road" />

      <div
        className="driving-map__pickup-pin"
        style={{
          left: `${nextPickup.mapPositionPercent.x}%`,
          top: `${nextPickup.mapPositionPercent.y}%`,
        }}
      >
        <span className="driving-map__pickup-dot" />
        <div className="driving-map__pickup-tooltip">
          <span className="driving-map__pickup-tooltip-label">NEXT STOP</span>
          <span className="driving-map__pickup-tooltip-name">{nextPickup.locationName}</span>
          <span className="driving-map__pickup-tooltip-meta">
            {nextPickup.waitingPassengerCount} pasahero &middot; {nextPickup.distanceMeters} m
          </span>
        </div>
      </div>

      <div className="driving-map__you-marker" style={{ left: "20%", top: "58%" }}>
        <span
          className={
            capacityStatus === "full"
              ? "driving-map__you-dot driving-map__you-dot--full"
              : "driving-map__you-dot"
          }
        >
          You
        </span>
        <span className="driving-map__you-label">{unitNickname}</span>
      </div>
    </div>
  );
}

export default DrivingMapCanvas;
