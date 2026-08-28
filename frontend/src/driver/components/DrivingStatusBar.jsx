import "./DrivingStatusBar.css";

function DrivingStatusBar({ routeColorName, routeColorHex, capacityStatus }) {
  const isSeatsOpen = capacityStatus === "seats_open";

  return (
    <header className="driving-status-bar">
      <span className="driving-status-bar__route">
        <span className="driving-status-bar__route-dot" style={{ background: routeColorHex }} />
        DRIVING &middot; {routeColorName.toUpperCase()}
      </span>
      <span
        className={
          isSeatsOpen
            ? "driving-status-bar__capacity-badge driving-status-bar__capacity-badge--seats-open"
            : "driving-status-bar__capacity-badge driving-status-bar__capacity-badge--full"
        }
      >
        {isSeatsOpen ? "SEATS OPEN" : "FULL"}
      </span>
    </header>
  );
}

export default DrivingStatusBar;
