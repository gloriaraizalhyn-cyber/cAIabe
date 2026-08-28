import { Lottie } from "lottie-react";
import "./DriverGreeting.css";

function getGreetingPhrase() {
  const hour = new Date().getHours();
  return hour < 12
    ? "Mayap a abak,"
    : hour < 13
      ? "Mayap a ugtu,"
      : hour < 18
        ? "Mayap a gatpanapun,"
        : "Mayap a bengi,";
}

function DriverGreeting({ name }) {
  const firstName = name.trim().split(/\s+/)[0] || "Driver";

  return (
    <div className="driver-greeting">
      <h1 className="driver-greeting__title">
        <span className="driver-greeting__phrase">{getGreetingPhrase()}</span>
        <span className="driver-greeting__name">{firstName}!</span>
      </h1>
      <Lottie
        className="driver-greeting__animation"
        src="/animations/upward.json"
        loop={false}
        autoplay
      />
    </div>
  );
}

export default DriverGreeting;
