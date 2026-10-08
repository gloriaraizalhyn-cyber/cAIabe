import { useEffect, useRef, useState } from "react";
import "./IdleEngineOffToast.css";

// How long the prompt waits for a tap before quietly going away (and
// counting as "no answer"), and how long the thank-you stays up.
const AUTO_DISMISS_MS = 20000;
const THANKS_MS = 4000;

// Huge, single-action prompt for a driver stopped on the roadside past the
// idling threshold. One button, nothing to read carefully, nothing to type.
// Ignoring it is a valid answer: it dismisses itself. The estimate shown
// comes from driver-demand-check (roadsideIdle.fuel), never invented here.
function IdleEngineOffToast({ roadsideIdle, liveMinutes, onEngineOff, onClose }) {
  const [isAnswered, setIsAnswered] = useState(false);
  // The parent re-renders every second (idle timer); a ref keeps these
  // timeouts from restarting each time it passes a new onClose.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const id = setTimeout(() => onCloseRef.current(), isAnswered ? THANKS_MS : AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [isAnswered]);

  // A short buzz so the driver notices it without looking at the phone.
  useEffect(() => {
    navigator.vibrate?.([250, 100, 250]);
  }, []);

  const handleTap = () => {
    setIsAnswered(true);
    onEngineOff();
  };

  const fuel = roadsideIdle?.fuel;
  const minutes = Math.max(1, Math.round(liveMinutes ?? roadsideIdle?.minutes ?? 0));

  if (isAnswered) {
    return (
      <div className="idle-toast idle-toast--thanks" role="status" aria-live="polite">
        <p className="idle-toast__thanks">✓ Thank you! Engine off.</p>
        <p className="idle-toast__sub">You're saving fuel now.</p>
      </div>
    );
  }

  return (
    <div className="idle-toast" role="alertdialog" aria-live="assertive" aria-label="Engine is idling">
      <p className="idle-toast__headline">Stopped for {minutes} min</p>
      {fuel && (
        <p className="idle-toast__sub">
          Idling is burning about ₱{fuel.min_cost}–₱{fuel.max_cost} (≈ {fuel.min_co2_kg}–{fuel.max_co2_kg} kg CO₂)
        </p>
      )}
      <button type="button" className="idle-toast__button" onClick={handleTap}>
        ENGINE OFF
      </button>
      <p className="idle-toast__hint">Tap after you turn the engine off</p>
      <div className="idle-toast__timer" style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }} />
    </div>
  );
}

export default IdleEngineOffToast;
