import { useRef, useState } from "react";
import { Sparkles, Volume2, Loader2 } from "lucide-react";
import { translateToVoice } from "../lib/translateToVoice.js";
import "./AiNote.css";

// Languages a passenger is likely to want a jeepney tip read back in.
const LANGUAGES = [
  { code: "English", label: "English" },
  { code: "Filipino (Tagalog)", label: "Filipino" },
  { code: "Cebuano (Bisaya)", label: "Bisaya" },
  { code: "Ilocano", label: "Ilocano" },
];

// Renders an AI-generated note (a single `text` string, a `headline`/`body`
// pair, and/or a `pros`/`cons` list — e.g. why an alternative route wasn't
// the top pick) with a "Listen" control that translates it and plays it
// back via the translate-to-voice edge function (GPT-4o-mini + TTS) in the
// passenger's chosen language.
function AiNote({ tone = "calm", text, headline, body, pros, cons, className = "" }) {
  const [language, setLanguage] = useState(LANGUAGES[0].code);
  const [status, setStatus] = useState("idle"); // idle | loading | playing | error
  const audioRef = useRef(null);

  const prosText = pros?.length ? `Pros: ${pros.join(", ")}.` : "";
  const consText = cons?.length ? `Cons: ${cons.join(", ")}.` : "";
  const spokenText = text ?? [headline, body, prosText, consText].filter(Boolean).join(" ");

  const handleListen = async () => {
    if (status === "loading") return;

    if (audioRef.current && status === "playing") {
      audioRef.current.pause();
      setStatus("idle");
      return;
    }

    setStatus("loading");
    try {
      const { audioUrl } = await translateToVoice(spokenText, language);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => setStatus("idle");
      audio.onerror = () => setStatus("error");
      await audio.play();
      setStatus("playing");
    } catch (err) {
      console.error("AiNote: translate-to-voice failed:", err);
      setStatus("error");
    }
  };

  const listenLabel = status === "loading" ? "Translating…" : status === "playing" ? "Stop" : "Listen";

  return (
    <div className={`ai-note ai-note--${tone} ${className}`.trim()}>
      <span className="ai-note__badge">
        <Sparkles size={12} strokeWidth={2.5} />
        AI
      </span>
      <div className="ai-note__content">
        {headline ? (
          <p>
            <strong>{headline}</strong>
            {body && (
              <>
                <br />
                {body}
              </>
            )}
          </p>
        ) : (
          <p>{text}</p>
        )}

        {(pros?.length > 0 || cons?.length > 0) && (
          <div className="ai-note__comparison">
            {pros?.length > 0 && (
              <ul className="ai-note__list ai-note__list--pros">
                {pros.map((pro, index) => (
                  <li key={`pro-${index}`}>{pro}</li>
                ))}
              </ul>
            )}
            {cons?.length > 0 && (
              <ul className="ai-note__list ai-note__list--cons">
                {cons.map((con, index) => (
                  <li key={`con-${index}`}>{con}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="ai-note__listen-row" onClick={(event) => event.stopPropagation()}>
          <select
            className="ai-note__language-select"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            disabled={status === "loading"}
            aria-label="Language to hear this in"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ai-note__listen-button"
            onClick={handleListen}
            disabled={status === "loading"}
          >
            {status === "loading" ? (
              <Loader2 size={13} strokeWidth={2.5} className="ai-note__spin" />
            ) : (
              <Volume2 size={13} strokeWidth={2.5} />
            )}
            {listenLabel}
          </button>
        </div>

        {status === "error" && <p className="ai-note__error">Couldn't play audio — try again.</p>}
      </div>
    </div>
  );
}

export default AiNote;
