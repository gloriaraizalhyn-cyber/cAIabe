import { ChevronLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import "./BackButton.css";

// One back control for every screen. By default it goes to the previous
// screen in the browser history; when the page was opened directly (no
// history inside the app, e.g. a refreshed or shared link) it goes to
// `fallback` instead, so it never leaves the rider stranded or exits the app.
// Pass `onClick` when a screen needs to go somewhere specific (and carry
// route state with it) rather than just "back".
//
// variant: "chip" (pill with label, floats over maps), "icon" (round,
// icon-only, for tight bars) or "link" (plain text link inside a card/panel).
function BackButton({ fallback = "/", onClick, label = "Back", variant = "chip", className = "" }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (location.key !== "default") {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };

  return (
    <button
      type="button"
      className={`back-button back-button--${variant}${className ? ` ${className}` : ""}`}
      onClick={handleClick}
      aria-label={variant === "icon" ? label : undefined}
    >
      <ChevronLeft size={variant === "link" ? 18 : 17} strokeWidth={2.6} aria-hidden="true" />
      {variant !== "icon" && <span>{label}</span>}
    </button>
  );
}

export default BackButton;
