import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Mic, RotateCcw, Check, Square, Quote } from "lucide-react";
import { mockTranscribeAndParseVoice } from "../utils/mockVoiceParse.js";
import LoadingScreen from "../../shared/components/LoadingScreen.jsx";
import "./VoiceSearchPage.css";

function VoiceSearchPage() {
  const navigate = useNavigate();

  const [stage, setStage] = useState("idle");
  const [parsedResult, setParsedResult] = useState(null);

  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleBack = () => {
    navigate(-1);
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      console.error("Browser does not support microphone access.");
      setStage("denied");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start();

      console.log("Recording started");

      setStage("recording");
    } catch (error) {
      console.error("Microphone error:", error);
      setStage("denied");
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;

    if (!recorder) {
      console.error("No active recorder.");
      return;
    }

    recorder.onstop = async () => {
      try {
        setStage("processing");

        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        console.log("Recorded audio:", audioBlob);
        console.log("Audio type:", audioBlob.type);
        console.log("Audio size:", audioBlob.size);

        if (audioBlob.size === 0) {
          throw new Error("No audio was recorded.");
        }

        const formData = new FormData();

        formData.append(
          "file",
          audioBlob,
          "kapampangan-voice.webm"
        );

        console.log("Sending audio to local Whisper...");

        const response = await fetch(
          "http://localhost:8000/transcribe",
          {
            method: "POST",
            body: formData,
          }
        );

        console.log("Whisper HTTP status:", response.status);

        if (!response.ok) {
          const errorText = await response.text();

          throw new Error(
            `Whisper server returned ${response.status}: ${errorText}`
          );
        }

        const data = await response.json();

        console.log("Whisper response:", data);

        const transcript = data?.text?.trim();

        if (!transcript) {
          throw new Error(
            "Whisper returned no transcription."
          );
        }

        console.log("Kapampangan transcript:", transcript);

        setParsedResult({
          transcript: transcript,
          originQuery: "",
          destinationQuery: "",
          originPlace: null,
          destinationPlace: null,
        });

        setStage("confirm");
      } catch (error) {
        console.error("Voice processing error:", error);

        setStage("denied");
      } finally {
        mediaStreamRef.current
          ?.getTracks()
          .forEach((track) => track.stop());

        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
      }
    };

    recorder.stop();
  };

  const handleRetake = () => {
    setParsedResult(null);
    setStage("idle");
  };

  const handleConfirm = () => {
    if (!parsedResult) return;

    navigate("/routes", {
      state: {
        tripSearch: {
          origin: parsedResult.originQuery,
          destination: parsedResult.destinationQuery,
          originPlace: parsedResult.originPlace,
          destinationPlace: parsedResult.destinationPlace,
          transcript: parsedResult.transcript,
        },
      },
    });
  };

  return (
    <main className="voice-search-page">
      <header className="voice-search-page__header">
        <button
          type="button"
          className="voice-search-page__back-button"
          onClick={handleBack}
        >
          <ChevronLeft size={18} strokeWidth={2.25} />
        </button>

        <h1 className="voice-search-page__title">
          Voice Assistant
        </h1>
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

              <Square
                size={26}
                strokeWidth={2}
                fill="currentColor"
              />
            </button>

            <p className="voice-search-page__instruction">
              Listening… tap to stop.
            </p>
          </>
        )}

        {stage === "processing" && (
          <LoadingScreen message="Making sense of that…" fullScreen={false} />
        )}

        {stage === "confirm" && parsedResult && (
          <div className="voice-search-page__confirm">

            <div className="voice-search-page__transcript">
              <Quote
                size={20}
                strokeWidth={2}
                className="voice-search-page__transcript-icon"
              />

              <p className="voice-search-page__transcript-text">
                {parsedResult.transcript}
              </p>
            </div>

            <div className="voice-search-page__parsed-field">
              <span className="voice-search-page__parsed-label">
                From
              </span>

              <span className="voice-search-page__parsed-value">
                Waiting for Gemini...
              </span>
            </div>

            <div className="voice-search-page__parsed-field">
              <span className="voice-search-page__parsed-label">
                To
              </span>

              <span className="voice-search-page__parsed-value">
                Waiting for Gemini...
              </span>
            </div>

            <div className="voice-search-page__confirm-actions">

              <button
                type="button"
                className="voice-search-page__retake-button"
                onClick={handleRetake}
              >
                <RotateCcw size={15} strokeWidth={2.25} />
                Retake
              </button>

              <button
                type="button"
                className="voice-search-page__confirm-button"
                onClick={handleConfirm}
              >
                <Check size={15} strokeWidth={2.5} />
                Confirm
              </button>

            </div>
          </div>
        )}

        {stage === "denied" && (
          <p className="voice-search-page__instruction">
            Something went wrong while processing your voice.
            Check the browser console for details.
          </p>
        )}

      </div>
    </main>
  );
}

export default VoiceSearchPage;