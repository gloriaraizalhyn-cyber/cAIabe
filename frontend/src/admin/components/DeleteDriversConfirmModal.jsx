import { AlertTriangle } from "lucide-react";
import "./DeleteDriversConfirmModal.css";

function DeleteDriversConfirmModal({ driverNames, onConfirm, onCancel, isDeleting }) {
  const count = driverNames.length;

  return (
    <div className="delete-drivers-confirm-modal__backdrop">
      <div className="delete-drivers-confirm-modal" role="alertdialog" aria-modal="true">
        <span className="delete-drivers-confirm-modal__icon">
          <AlertTriangle size={22} strokeWidth={2.25} />
        </span>
        <h2 className="delete-drivers-confirm-modal__title">
          {count === 1 ? "Delete this driver account?" : `Delete ${count} driver accounts?`}
        </h2>
        <p className="delete-drivers-confirm-modal__body">
          {count === 1 ? (
            <>
              This permanently deletes <strong>{driverNames[0]}</strong>'s account, including their
              login and driver profile. This cannot be undone.
            </>
          ) : (
            <>
              This permanently deletes {count} accounts (
              {driverNames.slice(0, 3).join(", ")}
              {count > 3 ? `, and ${count - 3} more` : ""}), including their logins and driver
              profiles. This cannot be undone.
            </>
          )}
        </p>
        <div className="delete-drivers-confirm-modal__actions">
          <button
            type="button"
            className="delete-drivers-confirm-modal__cancel-button"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="delete-drivers-confirm-modal__delete-button"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteDriversConfirmModal;
