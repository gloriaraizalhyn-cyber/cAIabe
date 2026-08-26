import "./NextToGoMapCanvas.css";

// Purely illustrative placeholder — not the real Google Map. Shows the
// driver's own position plus any passengers currently waiting along the
// route, each with a distance readout.
function NextToGoMapCanvas({ terminalName, waitingPassengers }) {
  return (
    <div className="next-to-go-map">
      <div className="next-to-go-map__road" />

      <div className="next-to-go-map__top-bar">
        <span className="next-to-go-map__next-to-go-badge">NEXT TO GO</span>
        <span className="next-to-go-map__terminal-name">{terminalName}</span>
      </div>

      {waitingPassengers.map((passenger) => (
        <div
          key={passenger.id}
          className="next-to-go-map__passenger-marker"
          style={{ left: `${passenger.mapPositionPercent.x}%`, top: `${passenger.mapPositionPercent.y}%` }}
        >
          <span className="next-to-go-map__passenger-dot" />
          <span className="next-to-go-map__passenger-label">
            Waiting &middot; {passenger.distanceKm} km
          </span>
        </div>
      ))}

      <div className="next-to-go-map__you-marker" style={{ left: "22%", top: "58%" }}>
        YOU
      </div>
    </div>
  );
}

export default NextToGoMapCanvas;
