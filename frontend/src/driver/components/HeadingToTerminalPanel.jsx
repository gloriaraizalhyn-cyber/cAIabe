import { EyeOff } from "lucide-react";
import MapView from "../../shared/components/MapView.jsx";
import "./HeadingToTerminalPanel.css";

function HeadingToTerminalPanel({ driverPosition, terminalPosition, terminalName }) {
  return (
    <section className="heading-to-terminal-panel">
      <div className="heading-to-terminal-panel__status">
        <span className="heading-to-terminal-panel__status-dot" />
        Heading to Terminal
      </div>
      <p className="heading-to-terminal-panel__message">
        Head to your assigned terminal to join the queue.
      </p>

      <div className="heading-to-terminal-panel__sharing-row">
        <span className="heading-to-terminal-panel__sharing-dot" />
        Location sharing: ON
      </div>

      <div className="heading-to-terminal-panel__map">
        <MapView origin={driverPosition} destination={terminalPosition} center={driverPosition} zoom={14} />
      </div>

      <p className="heading-to-terminal-panel__visibility-note">
        <EyeOff size={14} strokeWidth={2.25} />
        You're not yet visible to passengers — only terminal queue tracking is active.
      </p>

      <p className="heading-to-terminal-panel__destination">Heading to {terminalName}</p>
    </section>
  );
}

export default HeadingToTerminalPanel;
