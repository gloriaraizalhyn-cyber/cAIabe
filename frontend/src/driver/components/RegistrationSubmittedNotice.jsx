import { CheckCircle2 } from "lucide-react";
import "./RegistrationSubmittedNotice.css";

function RegistrationSubmittedNotice({ onBackToLogin }) {
  return (
    <div className="registration-submitted-notice">
      <CheckCircle2 size={40} strokeWidth={1.75} className="registration-submitted-notice__icon" />
      <h1 className="registration-submitted-notice__title">
        Registration submitted. Your account is pending verification.
      </h1>
      <p className="registration-submitted-notice__body">
        Our team will review your license, permit, and vehicle documents. You'll be notified
        once your driver account is approved.
      </p>
      <button type="button" className="registration-submitted-notice__button" onClick={onBackToLogin}>
        Back to Login
      </button>
    </div>
  );
}

export default RegistrationSubmittedNotice;
