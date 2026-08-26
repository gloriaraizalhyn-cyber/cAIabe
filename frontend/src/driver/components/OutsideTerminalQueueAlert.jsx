import { useEffect, useState } from "react";
import { SLOT_HELD_AUTO_DISMISS_MS } from "../../shared/constants/driverDashboardFixtures.js";
import "./OutsideTerminalQueueAlert.css";

function OutsideTerminalQueueAlert({ queuePosition, onDismiss, onLeaveTemporarily, onEndShiftForTheDay }) {
  const [alertPhase, setAlertPhase] = useState("prompt");

  useEffect(() => {
    if (alertPhase !== "slot_held") return undefined;
    const dismissTimeoutId = setTimeout(onDismiss, SLOT_HELD_AUTO_DISMISS_MS);
    return () => clearTimeout(dismissTimeoutId);
  }, [alertPhase, onDismiss]);

  const handleLiningUp = () => setAlertPhase("slot_held");
  const handleSkipMe = () => setAlertPhase("skip_options");

  return (
    <div className="outside-terminal-queue-alert__backdrop">
      <div className="outside-terminal-queue-alert" role="alertdialog" aria-modal="true">
        <p className="outside-terminal-queue-alert__kicker">HEADS UP! YOU'RE #{queuePosition}</p>
        <h2 className="outside-terminal-queue-alert__heading">
          You're outside the terminal area. Keep your slot?
        </h2>

        {alertPhase === "prompt" && (
          <div className="outside-terminal-queue-alert__actions">
            <button
              type="button"
              className="outside-terminal-queue-alert__button outside-terminal-queue-alert__button--primary"
              onClick={handleLiningUp}
            >
              Lining up
            </button>
            <button
              type="button"
              className="outside-terminal-queue-alert__button outside-terminal-queue-alert__button--secondary"
              onClick={handleSkipMe}
            >
              Skip me
            </button>
          </div>
        )}

        {alertPhase === "slot_held" && (
          <p className="outside-terminal-queue-alert__body">
            Slot held. Get back inside the terminal before unit #{queuePosition - 1} departs or
            you'll be moved to the back.
          </p>
        )}

        {alertPhase === "skip_options" && (
          <div className="outside-terminal-queue-alert__actions">
            <button
              type="button"
              className="outside-terminal-queue-alert__button outside-terminal-queue-alert__button--secondary"
              onClick={onLeaveTemporarily}
            >
              Leave temporarily
            </button>
            <button
              type="button"
              className="outside-terminal-queue-alert__button outside-terminal-queue-alert__button--danger"
              onClick={onEndShiftForTheDay}
            >
              Done for the day
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default OutsideTerminalQueueAlert;
