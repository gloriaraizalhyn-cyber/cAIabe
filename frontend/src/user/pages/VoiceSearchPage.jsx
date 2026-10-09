import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../shared/lib/supabaseClient.js";
import { ChevronLeft, Mic, RotateCcw, Check, Square, Quote } from "lucide-react";
//import { mockTranscribeAndParseVoice } from "../utils/mockVoiceParse.js";
import LoadingScreen from "../../shared/components/LoadingScreen.jsx";
import { useGoogleMapsLoader } from "../../shared/hooks/useGoogleMapsLoader.js";
import { SERVICE_AREA_BOUNDS } from "../../shared/constants/tripSearchFixtures.js";
import "./VoiceSearchPage.css";

// Resolves a spoken place name with Google's geocoder, biased to the area the
// seeded routes cover. Resolves null (never rejects) when Maps isn't loaded or
// nothing matches, so a missing lookup can't sink the voice request.
function geocodePlace(query) {
  return new Promise((resolve) => {
    if (!window.google?.maps?.Geocoder) {
      resolve(null);
      return;
    }
    new window.google.maps.Geocoder().geocode(
      {
        address: query,
        region: "ph",
        bounds: new window.google.maps.LatLngBounds(
          { lat: SERVICE_AREA_BOUNDS.south, lng: SERVICE_AREA_BOUNDS.west },
          { lat: SERVICE_AREA_BOUNDS.north, lng: SERVICE_AREA_BOUNDS.east }
        ),
      },
      (results, status) => {
        if (status !== "OK" || !results?.length) {
          resolve(null);
          return;
        }
        const location = results[0].geometry.location;
        resolve({
          label: results[0].formatted_address || query,
          lat: location.lat(),
          lng: location.lng(),
        });
      }
    );
  });
}

// The phone's position, or null if location is denied, unavailable or slow.
function getCurrentPlace() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          label: "Current location",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

function VoiceSearchPage() {
  const navigate = useNavigate();
  // Loads the Maps script (and its geocoder) while the user is speaking — this
  // page doesn't draw a map, so nothing else would have loaded it.
  useGoogleMapsLoader();

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
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  },
});

const audioTrack = stream.getAudioTracks()[0];

console.log("Microphone:", audioTrack.label);
console.log("Microphone settings:", audioTrack.getSettings());
console.log("Microphone state:", audioTrack.readyState);
console.log("Microphone enabled:", audioTrack.enabled);

console.log(
  "Microphone tracks:",
  stream.getAudioTracks().map((track) => ({
    label: track.label,
    enabled: track.enabled,
    muted: track.muted,
    readyState: track.readyState,
    settings: track.getSettings(),
  }))
);

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
          "audio",
          audioBlob,
          "kapampangan-voice.webm"
        );

        console.log("Sending audio to speech-to-text...");

        const { data, error: sttError } =
          await supabase.functions.invoke("speech-to-text", {
            body: formData,
          });

        if (sttError) {
          console.error("speech-to-text error:", sttError);
          throw new Error(
            sttError.message || "Failed to transcribe audio."
          );
        }

        console.log("speech-to-text response:", data);

        const transcript = data?.text?.trim();

        if (!transcript) {
          throw new Error(
            "Speech-to-text returned no transcription."
          );
        }

        console.log("Kapampangan transcript:", transcript);

console.log("Sending transcript to Gemini parse-voice...");

const { data: parsedData, error: parseError } =
  await supabase.functions.invoke("parse-voice", {
    body: {
      transcript,
    },
  });

if (parseError) {
  console.error("parse-voice error:", parseError);
  throw new Error(
    parseError.message || "Failed to parse voice transcript."
  );
}

console.log("Gemini parse-voice response:", parsedData);

if (!parsedData) {
  throw new Error("Gemini returned no parsing result.");
}

const spokenOrigin = (parsedData.originQuery || "").trim();
const spokenDestination = (parsedData.destinationQuery || "").trim();

// Neither lookup below is allowed to fail the whole request: whatever can't
// be resolved here is handed to the search page as plain text, which asks
// the user (and tries the phone's location) itself.
let originPlace = null;
let originLabel = spokenOrigin;

if (spokenOrigin) {
  originPlace = await geocodePlace(spokenOrigin);
}
if (!originPlace) {
  // Nothing usable was said (or it couldn't be found): where the phone is.
  const here = await getCurrentPlace();
  if (here) {
    originPlace = here;
    originLabel = here.label;
  }
}

const destinationPlace = spokenDestination ? await geocodePlace(spokenDestination) : null;

setParsedResult({
  transcript: parsedData.transcript || transcript,
  originQuery: originLabel,
  destinationQuery: spokenDestination,
  originPlace,
  destinationPlace,
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
              {parsedResult.originQuery || "Not detected"}
            </span>
            </div>

            <div className="voice-search-page__parsed-field">
              <span className="voice-search-page__parsed-label">
                To
              </span>

              <span className="voice-search-page__parsed-value">
               {parsedResult.destinationQuery || "Not detected"}
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