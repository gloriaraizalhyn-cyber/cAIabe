import "./JourneyStatusBanner.css";

function JourneyStatusBanner({ statusLabel, heading, subtext }) {
  return (
    <header className="journey-status-banner">
      <p className="journey-status-banner__status">{statusLabel}</p>
      <h1 className="journey-status-banner__heading">{heading}</h1>
      <p className="journey-status-banner__subtext">{subtext}</p>
    </header>
  );
}

export default JourneyStatusBanner;
