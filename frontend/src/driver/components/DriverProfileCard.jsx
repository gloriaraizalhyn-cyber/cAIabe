import { useEffect, useState } from "react";
import { Car, ChevronDown, ChevronUp, Mail, Phone } from "lucide-react";
import { COLOR_NAME_TO_HEX } from "../../shared/constants/driverRegistrationFixtures.js";
import "./DriverProfileCard.css";

function getInitials(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function DriverProfileCard({
  fullName,
  mobileNumber,
  emailAddress,
  plateNumber,
  vehicleRegistrationNumber,
  jeepColor,
  shiftStarted = false,
}) {
  const avatarColor = COLOR_NAME_TO_HEX[jeepColor?.toLowerCase()] ?? "#1b3fa0";

  // Once the shift starts there's less room to spare (the queue/heading-to-
  // terminal panel needs it more), so the card collapses down to just the
  // identity row — but the driver can still expand it back open manually.
  const [isExpanded, setIsExpanded] = useState(!shiftStarted);

  useEffect(() => {
    setIsExpanded(!shiftStarted);
  }, [shiftStarted]);

  return (
    <section className="driver-profile-card">
      <div
        className={`driver-profile-card__identity${
          isExpanded ? "" : " driver-profile-card__identity--collapsed"
        }`}
      >
        <span className="driver-profile-card__avatar" style={{ background: avatarColor }}>
          <img src="/images/mang-jason.jpg" alt={`${fullName} profile`} />
        </span>
        <div className="driver-profile-card__identity-text">
          <p className="driver-profile-card__name">{fullName}</p>
          <p className="driver-profile-card__role">Driver</p>
        </div>
        <button
          type="button"
          className="driver-profile-card__toggle"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-label={isExpanded ? "Collapse profile details" : "Expand profile details"}
          aria-expanded={isExpanded}
        >
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {isExpanded && (
        <div className="driver-profile-card__details">
          <div className="driver-profile-card__field">
            <span className="driver-profile-card__field-icon"><Phone size={16} /></span>
            <span className="driver-profile-card__field-copy">
              <span className="driver-profile-card__field-label">Mobile Number</span>
              <span className="driver-profile-card__field-value">{mobileNumber || "—"}</span>
            </span>
          </div>
          <div className="driver-profile-card__field">
            <span className="driver-profile-card__field-icon"><Mail size={16} /></span>
            <span className="driver-profile-card__field-copy">
              <span className="driver-profile-card__field-label">Email Address</span>
              <span className="driver-profile-card__field-value">{emailAddress || "—"}</span>
            </span>
          </div>
          <div className="driver-profile-card__field">
            <span className="driver-profile-card__field-icon"><Car size={16} /></span>
            <span className="driver-profile-card__field-copy">
              <span className="driver-profile-card__field-label">Plate Number</span>
              <span className="driver-profile-card__field-value">{plateNumber || "—"}</span>
            </span>
          </div>
          <div className="driver-profile-card__field">
            <span className="driver-profile-card__field-icon"><Car size={16} /></span>
            <span className="driver-profile-card__field-copy">
              <span className="driver-profile-card__field-label">Vehicle Registration</span>
              <span className="driver-profile-card__field-value">{vehicleRegistrationNumber || "—"}</span>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

export default DriverProfileCard;
