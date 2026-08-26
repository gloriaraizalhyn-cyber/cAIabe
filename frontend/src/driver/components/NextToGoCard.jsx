import "../../shared/styles/cardShell.css";
import "./NextToGoCard.css";

function NextToGoCard({ waitingCount, queuePosition, onWaitForMore }) {
  return (
    <section className="card-shell next-to-go-card">
      {queuePosition != null && (
        <p className="next-to-go-card__queue-position">Queue position #{queuePosition}</p>
      )}
      <h1 className="next-to-go-card__heading">{waitingCount} waiting along your route</h1>
      <p className="next-to-go-card__body">
        Choosing <strong>Wait</strong> tells them this unit likely won't leave within 30 min. They
        never see your passenger count.
      </p>
      <div className="next-to-go-card__actions">
        <button type="button" className="next-to-go-card__wait-button" onClick={onWaitForMore}>
          Wait for more
        </button>
        <div className="next-to-go-card__status-pill">Starts automatically when it's your turn</div>
      </div>
    </section>
  );
}

export default NextToGoCard;
