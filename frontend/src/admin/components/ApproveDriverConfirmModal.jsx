import { CheckCircle2 } from "lucide-react";
import "./ApproveDriverConfirmModal.css";

function ApproveDriverConfirmModal({ driverName, onConfirm, onCancel, isApproving }) {
  return (
    <div className="approve-driver-confirm-modal__backdrop">
      <div className="approve-driver-confirm-modal" role="alertdialog" aria-modal="true">
        <span className="approve-driver-confirm-modal__icon">
          <CheckCircle2 size={22} strokeWidth={2.25} />
        </span>
        <h2 className="approve-driver-confirm-modal__title">Approve this driver?</h2>
        <p className="approve-driver-confirm-modal__body">
          This grants <strong>{driverName}</strong> full driver access — they'll be able to join
          queues and appear to passengers. Make sure you've reviewed their license photo and
          details before continuing.
        </p>
        <div className="approve-driver-confirm-modal__actions">
          <button
            type="button"
            className="approve-driver-confirm-modal__cancel-button"
            onClick={onCancel}
            disabled={isApproving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="approve-driver-confirm-modal__approve-button"
            onClick={onConfirm}
            disabled={isApproving}
          >
            {isApproving ? "Approving…" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ApproveDriverConfirmModal;
