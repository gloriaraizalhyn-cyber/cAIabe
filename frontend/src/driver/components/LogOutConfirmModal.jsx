import { LogOut } from "lucide-react";
import "./LogOutConfirmModal.css";

function LogOutConfirmModal({ onConfirm, onCancel, isLoggingOut, isOnShift }) {
  return (
    <div className="driver-log-out-confirm-modal__backdrop">
      <div className="driver-log-out-confirm-modal" role="alertdialog" aria-modal="true">
        <span className="driver-log-out-confirm-modal__icon">
          <LogOut size={22} strokeWidth={2.25} />
        </span>
        <h2 className="driver-log-out-confirm-modal__title">Log out?</h2>
        <p className="driver-log-out-confirm-modal__body">
          {isOnShift
            ? "You're still on shift. Logging out will stop location sharing and remove you from the queue."
            : "You'll need to log in again to access your driver dashboard."}
        </p>
        <div className="driver-log-out-confirm-modal__actions">
          <button
            type="button"
            className="driver-log-out-confirm-modal__cancel-button"
            onClick={onCancel}
            disabled={isLoggingOut}
          >
            Cancel
          </button>
          <button
            type="button"
            className="driver-log-out-confirm-modal__confirm-button"
            onClick={onConfirm}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LogOutConfirmModal;
