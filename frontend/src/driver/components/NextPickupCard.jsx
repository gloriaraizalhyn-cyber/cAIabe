import "../../shared/styles/cardShell.css";
import "./NextPickupCard.css";

function NextPickupCard({ nextPickup, capacityStatus, onSetCapacityStatus }) {
  return (
    <section className="card-shell next-pickup-card">
      <div className="next-pickup-card__header">
        <span className="next-pickup-card__label">NEXT WAITING PICKUP</span>
        <span className="next-pickup-card__waiting-badge">
          {nextPickup.waitingPassengerCount} WAITING
        </span>
      </div>

      <h1 className="next-pickup-card__name">{nextPickup.locationName}</h1>
      <p className="next-pickup-card__meta">
        {nextPickup.distanceMeters} m ahead &middot; arriving in ~{nextPickup.etaMinutes} min
      </p>

      <div className="next-pickup-card__toggle">
        <button
          type="button"
          className={
            capacityStatus === "full"
              ? "next-pickup-card__toggle-button next-pickup-card__toggle-button--full"
              : "next-pickup-card__toggle-button"
          }
          onClick={() => onSetCapacityStatus("full")}
        >
          Full
        </button>
        <button
          type="button"
          className={
            capacityStatus === "seats_open"
              ? "next-pickup-card__toggle-button next-pickup-card__toggle-button--seats-open"
              : "next-pickup-card__toggle-button"
          }
          onClick={() => onSetCapacityStatus("seats_open")}
        >
          Seats Open
        </button>
      </div>
    </section>
  );
}

export default NextPickupCard;
