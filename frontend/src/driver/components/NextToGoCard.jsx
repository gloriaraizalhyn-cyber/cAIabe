import useBottomSheetDrag from "../../shared/hooks/useBottomSheetDrag.js";
import "../../shared/styles/cardShell.css";
import DriverImpactStrip from "./DriverImpactStrip.jsx";
import "./NextToGoCard.css";

function NextToGoCard({ waitingCount, queuePosition, onWaitForMore, waitNoticeSent = false, impactSummary = null }) {
  const { isExpanded, liveDragY, handlePointerDown, handlePointerMove, handlePointerUp } = useBottomSheetDrag();

  return (
    <section
      className={`card-shell card-shell--compact next-to-go-card${isExpanded ? " card-shell--expanded" : ""}`}
      style={liveDragY !== null ? { transform: `translateY(${liveDragY}px)`, transition: "none" } : undefined}
    >
      <div
        className="card-shell__drag-handle"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span className="card-shell__drag-handle-bar" />
      </div>
      {queuePosition != null && (
        <p className="next-to-go-card__queue-position">Queue position #{queuePosition}</p>
      )}
      <h1 className="next-to-go-card__heading">
        {waitingCount} {waitingCount === 1 ? "passenger" : "passengers"} waiting
      </h1>
      <p className="next-to-go-card__body">
        Tap <strong>Wait</strong> if you want to wait for more passengers. They will be told this
        jeep won't leave soon.
      </p>
      {impactSummary && <DriverImpactStrip summary={impactSummary} />}
      <div className="next-to-go-card__actions">
        <button
          type="button"
          className="next-to-go-card__wait-button"
          onClick={onWaitForMore}
          disabled={waitNoticeSent}
        >
          {waitNoticeSent ? "Waiting passengers notified" : "Wait for more"}
        </button>
        <div className="next-to-go-card__status-pill">You leave automatically on your turn</div>
      </div>
    </section>
  );
}

export default NextToGoCard;
