import "./SmsFallbackLog.css";

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Shows the SMS fallback history (queue-advance -> textbee.ts) so it's
// demoable without a live TextBee-connected phone: every attempt is logged
// whether it was actually sent or just simulated (no TEXTBEE_API_KEY set).
function SmsFallbackLog({ entries }) {
  if (!entries.length) return null;

  return (
    <section className="sms-fallback-log">
      <p className="sms-fallback-log__heading">SMS fallback history</p>
      <ul className="sms-fallback-log__list">
        {entries.map((entry) => (
          <li key={entry.id} className="sms-fallback-log__item">
            <span
              className={
                entry.simulated
                  ? "sms-fallback-log__badge sms-fallback-log__badge--simulated"
                  : "sms-fallback-log__badge sms-fallback-log__badge--sent"
              }
            >
              {entry.simulated ? "SIMULATED" : "SENT"}
            </span>
            <span className="sms-fallback-log__message">{entry.message}</span>
            <span className="sms-fallback-log__time">{formatTime(entry.created_at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default SmsFallbackLog;
