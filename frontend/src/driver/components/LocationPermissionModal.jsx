import { MapPin } from "lucide-react";
import "./LocationPermissionModal.css";

function LocationPermissionModal({ onEnableLocation, onCancel, onUseTerminalLocation }) {
  return (
    <div className="location-permission-modal__backdrop">
      <div className="location-permission-modal" role="dialog" aria-modal="true">
        <span className="location-permission-modal__icon">
          <MapPin size={22} strokeWidth={2.25} />
        </span>
        <h2 className="location-permission-modal__title">Allow location access</h2>
        <p className="location-permission-modal__body">
          CAIABE uses your location to detect when you arrive at your assigned terminal and
          automatically place you in the queue.
        </p>
        <div className="location-permission-modal__actions">
          <button type="button" className="location-permission-modal__cancel-button" onClick={onCancel}>
            Not Now
          </button>
          <button
            type="button"
            className="location-permission-modal__enable-button"
            onClick={onEnableLocation}
          >
            Enable Location
          </button>
        </div>
        {onUseTerminalLocation && (
          <button
            type="button"
            className="location-permission-modal__demo-link"
            onClick={onUseTerminalLocation}
          >
            Testing without GPS? Use terminal location instead
          </button>
        )}
      </div>
    </div>
  );
}

export default LocationPermissionModal;
