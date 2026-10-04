import { DEMO_SMS_PHONE, DEMO_SMS_SCRIPT } from "../constants/demoScript.js";

// The "no data connection" pane.
//
// Outbound messages are what sms-webhook actually replied, read back out of
// sms_log — so the chunking on screen is the real 160-character split the
// gateway would send, not a mock-up of one. When no TextBee device is
// attached these are logged with simulated = true, and the badge says so
// rather than implying a phone is involved.
function SmsThreadPane({ thread, onSend, isFocused }) {
  const isSimulated = thread.some((message) => message.simulated);

  return (
    <section className={`sms-pane${isFocused ? " sms-pane--focused" : ""}`}>
      <header className="sms-pane__header">
        <div>
          <h2 className="sms-pane__title">SMS fallback</h2>
          <p className="sms-pane__subtitle">{DEMO_SMS_PHONE} · no data connection</p>
        </div>
        {isSimulated && <span className="sms-pane__badge">simulated gateway</span>}
      </header>

      <div className="sms-pane__thread">
        {thread.length === 0 && (
          <p className="sms-pane__empty">
            Send the first text to plan the same trip over SMS.
          </p>
        )}
        {thread.map((message) => (
          <article key={message.id} className="sms-pane__bubble">
            {message.message}
          </article>
        ))}
      </div>

      <div className="sms-pane__actions">
        {DEMO_SMS_SCRIPT.map((text) => (
          <button key={text} type="button" className="sms-pane__send" onClick={() => onSend(text)}>
            {text.length > 28 ? `Text "${text.slice(0, 26)}…"` : `Reply "${text}"`}
          </button>
        ))}
      </div>
    </section>
  );
}

export default SmsThreadPane;
