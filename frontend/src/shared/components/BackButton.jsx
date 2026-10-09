import { ChevronLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import "./BackButton.css";

// One back control for every screen.
//   - `to`: always go to this exact screen. Preferred wherever the previous
//     step is fixed (e.g. About You -> landing page), because browser history
//     can point somewhere else (a logout, a shared link, a refresh).
//   - otherwise: the previous screen in the browser history, or `fallback`
//     when the page was opened directly, so it never exits the app.
// Pass `onClick` when a screen needs to go somewhere specific and carry
// route state with it.
//
// variant: "chip" (pill with label, floats over maps), "icon" (round,
// icon-only, for tight bars) or "link" (plain text link inside a card/panel).
function BackButton({ to, fallback = "/", onClick, label = "Back", variant = "chip", className = "" }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (to) {
      navigate(to);
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

