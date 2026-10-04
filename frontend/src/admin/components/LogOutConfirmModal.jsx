import { LogOut } from "lucide-react";
import "./LogOutConfirmModal.css";

function LogOutConfirmModal({ onConfirm, onCancel, isLoggingOut }) {
  return (
    <div className="log-out-confirm-modal__backdrop">
      <div className="log-out-confirm-modal" role="alertdialog" aria-modal="true">
        <span className="log-out-confirm-modal__icon">
          <LogOut size={22} strokeWidth={2.25} />
        </span>
        <h2 className="log-out-confirm-modal__title">Log out?</h2>
        <p className="log-out-confirm-modal__body">
          You'll need to log in again to review driver applications.
        </p>
        <div className="log-out-confirm-modal__actions">
          <button
            type="button"
            className="log-out-confirm-modal__cancel-button"
            onClick={onCancel}
            disabled={isLoggingOut}
          >
            Cancel
          </button>
          <button
            type="button"
            className="log-out-confirm-modal__confirm-button"
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
