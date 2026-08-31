from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from transformers import pipeline
import tempfile
import os
import subprocess

app = FastAPI()

# Allow the React/Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_ID = "openai/whisper-small"

print("Loading Whisper...")
print("Model:", MODEL_ID)

transcriber = pipeline(
    "automatic-speech-recognition",
    model=MODEL_ID,
)

print("Whisper loaded successfully!")


@app.get("/")
def root():
    return {
        "status": "ok",
        "model": MODEL_ID
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    audio_bytes = await file.read()

    print("\n==============================")
    print("Received audio:")
    print("Filename:", file.filename)
    print("Content type:", file.content_type)
    print("Size:", len(audio_bytes), "bytes")
    print("==============================")

    input_path = None
    output_path = None

    try:
        # Save browser WebM audio
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".webm"
        ) as input_file:
            input_file.write(audio_bytes)
            input_path = input_file.name

        # WAV output
        output_path = input_path + ".wav"

        print("Converting audio with FFmpeg...")

        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                input_path,
                "-ar",
                "16000",
                "-ac",
                "1",
                "-c:a",
                "pcm_s16le",
                output_path,
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        print("FFmpeg conversion successful.")

        print("Running Whisper...")

        result = transcriber(
            output_path,
            generate_kwargs={
                "task": "transcribe",
            },
        )

        print("\n==============================")
        print("RAW WHISPER RESULT:")
        print(result)
        print("==============================")

        text = result.get("text", "").strip()

        print("FINAL TRANSCRIPT:")
        print(text)
        print("==============================\n")

        return {
            "text": text
        }

    except subprocess.CalledProcessError as e:
        error_message = e.stderr.decode(errors="ignore")

        print("FFmpeg ERROR:")
        print(error_message)

        return {
            "error": "Audio conversion failed",
            "details": error_message
        }

    except Exception as e:
        print("WHISPER ERROR:")
        print(repr(e))

        return {
            "error": str(e)
        }

    finally:
        if output_path and os.path.exists(output_path):
            os.remove(output_path)

        if input_path and os.path.exists(input_path):
            os.remove(input_path)