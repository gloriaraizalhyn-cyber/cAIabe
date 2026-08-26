import "./JeepWaitingMapCanvas.css";

// Purely illustrative placeholder for the walking/waiting screens — not the
// real Google Map. Once live driver GPS is wired in, this can be swapped
// for MapView with real coordinates; for now it just needs to look right.
function JeepWaitingMapCanvas({ waitingPhase, waitingAtBay }) {
  return (
    <div className="jeep-waiting-map">
      <div className="jeep-waiting-map__road" />

      {waitingPhase === "walking_to_bay" && (
        <>
          <div className="jeep-waiting-map__bay-pin" style={{ left: "48%", top: "36%" }}>
            <span className="jeep-waiting-map__bay-dot" />
            <div className="jeep-waiting-map__bay-tooltip">
              <span className="jeep-waiting-map__bay-name">{waitingAtBay.bayName}</span>
              <span className="jeep-waiting-map__bay-meta">
                {waitingAtBay.walkDurationMinutes} min walk &middot; {waitingAtBay.walkDistanceMeters} m
              </span>
            </div>
          </div>
          <div className="jeep-waiting-map__you-marker" style={{ left: "40%", top: "58%" }}>
            YOU
          </div>
        </>
      )}

      {waitingPhase === "waiting_for_jeep" && (
        <>
          <div className="jeep-waiting-map__top-bar">
            <span className="jeep-waiting-map__line-code-badge">{waitingAtBay.jeepneyLineCode}</span>
            <span className="jeep-waiting-map__top-bar-text">
              Showing only {waitingAtBay.jeepneyLineCode} jeeps near you
            </span>
            <span className="jeep-waiting-map__legend">
              <span className="jeep-waiting-map__legend-item">
                <span className="jeep-waiting-map__legend-dot jeep-waiting-map__legend-dot--seats" />
                SEATS
              </span>
              <span className="jeep-waiting-map__legend-item">
                <span className="jeep-waiting-map__legend-dot jeep-waiting-map__legend-dot--full" />
                FULL
              </span>
            </span>
          </div>

          {waitingAtBay.nearbyJeeps.map((nearbyJeep) => (
            <div
              key={nearbyJeep.id}
              className={
                nearbyJeep.hasSeatsAvailable
                  ? "jeep-waiting-map__jeep-marker jeep-waiting-map__jeep-marker--seats"
                  : "jeep-waiting-map__jeep-marker jeep-waiting-map__jeep-marker--full"
              }
              style={{ left: `${nearbyJeep.mapPositionPercent.x}%`, top: `${nearbyJeep.mapPositionPercent.y}%` }}
            >
              {nearbyJeep.unitNickname && (
                <span className="jeep-waiting-map__jeep-label">
                  {nearbyJeep.unitNickname}
                  <span
                    className={
                      nearbyJeep.hasSeatsAvailable
                        ? "jeep-waiting-map__availability-chip jeep-waiting-map__availability-chip--seats"
                        : "jeep-waiting-map__availability-chip jeep-waiting-map__availability-chip--full"
                    }
                  >
                    {nearbyJeep.hasSeatsAvailable ? "Seats available" : "Full"}
                  </span>
                </span>
              )}
            </div>
          ))}

          <div className="jeep-waiting-map__wait-marker" style={{ left: "22%", top: "58%" }}>
            <span className="jeep-waiting-map__wait-dot">WAIT</span>
            <span className="jeep-waiting-map__wait-text">
              You're visible to {waitingAtBay.nearestJeep.unitNickname} jeep drivers
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default JeepWaitingMapCanvas;
