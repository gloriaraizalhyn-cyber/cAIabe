import { X } from "lucide-react";
import JeepColorCell from "./JeepColorCell.jsx";
import DriverAttachments from "./DriverAttachments.jsx";
import "./DriverSummaryModal.css";

function driverDisplayName(driver) {
  return driver.fullName ?? driver.email ?? "Unnamed driver";
}

function DriverSummaryModal({ driver, onClose }) {
  return (
    <div className="driver-summary-modal__backdrop" onClick={onClose}>
      <div
        className="driver-summary-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="driver-summary-modal__close-button"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} strokeWidth={2.25} />
        </button>

        <div className="driver-summary-modal__header">
          {driver.licensePhotoSignedUrl ? (
            <img
              src={driver.licensePhotoSignedUrl}
              alt={`${driverDisplayName(driver)}'s license`}
              className="driver-summary-modal__photo"
            />
          ) : (
            <div className="driver-summary-modal__no-photo">No photo on file</div>
          )}
          <div className="driver-summary-modal__header-text">
            <h2 className="driver-summary-modal__name">{driverDisplayName(driver)}</h2>
            <span
              className={`driver-summary-modal__status-badge driver-summary-modal__status-badge--${driver.verificationStatus}`}
            >
              {driver.verificationStatus}
            </span>
          </div>
        </div>

        <dl className="driver-summary-modal__fields">
          <div className="driver-summary-modal__field">
            <dt>Email</dt>
            <dd>{driver.email ?? "—"}</dd>
          </div>
          <div className="driver-summary-modal__field">
            <dt>Mobile</dt>
            <dd>{driver.mobileNumber ?? "—"}</dd>
          </div>
          <div className="driver-summary-modal__field">
            <dt>License number</dt>
            <dd>{driver.licenseNumber ?? "—"}</dd>
          </div>
          <div className="driver-summary-modal__field">
            <dt>Franchise/permit number</dt>
            <dd>{driver.franchisePermitNumber ?? "—"}</dd>
          </div>
          <div className="driver-summary-modal__field">
            <dt>Plate number</dt>
            <dd>{driver.plateNumber ?? "—"}</dd>
          </div>
          <div className="driver-summary-modal__field">
            <dt>Vehicle registration</dt>
            <dd>{driver.vehicleRegistrationNumber ?? "—"}</dd>
          </div>
          <div className="driver-summary-modal__field">
            <dt>Jeep color</dt>
            <dd>
              <JeepColorCell jeepColor={driver.jeepColor} />
            </dd>
          </div>
          <div className="driver-summary-modal__field">
            <dt>Vehicle type</dt>
            <dd>{driver.vehicleType ?? "—"}</dd>
          </div>
          <div className="driver-summary-modal__field">
            <dt>Route</dt>
            <dd>{driver.route?.name ?? "—"}</dd>
          </div>
          <div className="driver-summary-modal__field">
            <dt>Terminal</dt>
            <dd>{driver.terminal?.name ?? "—"}</dd>
          </div>
        </dl>

        <DriverAttachments driver={driver} />

        {driver.verificationStatus === "rejected" && driver.rejectionReason && (
          <div className="driver-summary-modal__remarks">
            <span className="driver-summary-modal__remarks-label">Rejection remarks</span>
            <p className="driver-summary-modal__remarks-text">{driver.rejectionReason}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default DriverSummaryModal;
