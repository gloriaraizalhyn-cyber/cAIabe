from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from transformers import pipeline
import tempfile
import os

app = FastAPI()

# Allow the React frontend to communicate with the local Whisper server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_ID = "rbcurzon/whisper-medium-ph"

print("Loading Whisper Medium PH...")

transcriber = pipeline(
    "automatic-speech-recognition",
    model=MODEL_ID,
)

print("Whisper Medium PH loaded!")


@app.get("/")
def root():
    return {
        "status": "ok",
        "model": MODEL_ID
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    audio_bytes = await file.read()

    suffix = os.path.splitext(file.filename or "")[1] or ".webm"

    with tempfile.NamedTemporaryFile(
        delete=False,
        suffix=suffix
    ) as temp:
        temp.write(audio_bytes)
        temp_path = temp.name

    try:
        result = transcriber(
    temp_path,
    generate_kwargs={
        "language": "tl",
        "task": "transcribe",
    }
)

print("WHISPER RESULT:", result)

text = result["text"].strip()

return {
    "text": text
}

    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)