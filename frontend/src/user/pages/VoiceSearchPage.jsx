import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Mic, RotateCcw, Check, Square, Quote } from "lucide-react";
import { mockTranscribeAndParseVoice } from "../utils/mockVoiceParse.js";
import "./VoiceSearchPage.css";

// idle -> recording -> processing -> confirm (-> retake back to idle)
// "denied" is a dead end reached only if the browser blocks mic access.
function VoiceSearchPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState("idle");
  const [parsedResult, setParsedResult] = useState(null);

  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleBack = () => navigate(-1);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStage("denied");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.start();
      setStage("recording");
    } catch {
      setStage("denied");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    setStage("processing");

    // TODO: swap this mock for the real voice-search edge function once
    // it exists — send the recorded audio blob, get back the same shape.
    mockTranscribeAndParseVoice().then((result) => {
      setParsedResult(result);
      setStage("confirm");
    });
  };

  const handleRetake = () => {
    setParsedResult(null);
    setStage("idle");
  };

  const handleConfirm = () => {
    navigate("/routes", {
      state: {
        tripSearch: {
          origin: parsedResult.originQuery,
          destination: parsedResult.destinationQuery,
          originPlace: parsedResult.originPlace,
          destinationPlace: parsedResult.destinationPlace,
        },
      },
    });
  };

  return (
    <main className="voice-search-page">
      <header className="voice-search-page__header">
        <button type="button" className="voice-search-page__back-button" onClick={handleBack}>
          <ChevronLeft size={18} strokeWidth={2.25} />
        </button>
        <h1 className="voice-search-page__title">Voice Assistant</h1>
      </header>

      <div className="voice-search-page__body">
        {stage === "idle" && (
          <>
            <button
              type="button"
              className="voice-search-page__mic-button"
              onClick={startRecording}
              aria-label="Start recording"
            >
              <span className="voice-search-page__idle-ring voice-search-page__idle-ring--1" />
              <span className="voice-search-page__idle-ring voice-search-page__idle-ring--2" />
              <span className="voice-search-page__idle-ring voice-search-page__idle-ring--3" />
              <Mic size={40} strokeWidth={2} />
            </button>
            <p className="voice-search-page__instruction">
              Tap the mic and tell us where you are and where you want to go.
            </p>
          </>
        )}

        {stage === "recording" && (
          <>
            <button
              type="button"
              className="voice-search-page__mic-button voice-search-page__mic-button--recording"
              onClick={stopRecording}
              aria-label="Stop recording"
            >
              <span className="voice-search-page__pulse-ring" />
              <Square size={26} strokeWidth={2} fill="currentColor" />
            </button>
            <p className="voice-search-page__instruction">Listening… tap to stop.</p>
          </>
        )}

        {stage === "processing" && (
          <>
            <div className="voice-search-page__processing-spinner" aria-hidden="true" />
            <p className="voice-search-page__instruction">Making sense of that…</p>
          </>
        )}

        {stage === "confirm" && parsedResult && (
          <div className="voice-search-page__confirm">
            <div className="voice-search-page__transcript">
              <Quote size={20} strokeWidth={2} className="voice-search-page__transcript-icon" />
              <p className="voice-search-page__transcript-text">{parsedResult.transcript}</p>
            </div>

            <div className="voice-search-page__parsed-field">
              <span className="voice-search-page__parsed-label">From</span>
              <span className="voice-search-page__parsed-value">{parsedResult.originQuery}</span>
            </div>
            <div className="voice-search-page__parsed-field">
              <span className="voice-search-page__parsed-label">To</span>
              <span className="voice-search-page__parsed-value">{parsedResult.destinationQuery}</span>
            </div>

            <div className="voice-search-page__confirm-actions">
              <button type="button" className="voice-search-page__retake-button" onClick={handleRetake}>
                <RotateCcw size={15} strokeWidth={2.25} />
                Retake
              </button>
              <button type="button" className="voice-search-page__confirm-button" onClick={handleConfirm}>
                <Check size={15} strokeWidth={2.5} />
                Confirm
              </button>
            </div>
          </div>
        )}

        {stage === "denied" && (
          <p className="voice-search-page__instruction">
            Microphone access is off. Enable it in your browser settings to use the voice assistant.
          </p>
        )}
      </div>
    </main>
  );
}

export default VoiceSearchPage;
