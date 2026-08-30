// POST /functions/v1/translate-to-voice
// Body: { text: string, target_language: string, source_language?: string }
// Returns the translation and WAV audio encoded as Base64.
//
// Runs on Gemini for both steps (matching route-search/nearby-jeepney-eta's
// use of the Gemini API elsewhere in this project) instead of OpenAI: a
// plain generateContent call for translation, then a TTS-capable
// generateContent call for speech. Gemini's TTS returns raw 16-bit PCM, not
// a self-contained playable file, so it's wrapped in a WAV header before
// being sent back — the frontend (translateToVoice.js) expects the same
// self-contained audio blob contract this endpoint always returned, back
// when it was OpenAI's MP3 output.

import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
const TRANSLATION_MODEL = "gemini-3.5-flash-lite";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const TTS_VOICE = "Kore";
const MAX_TEXT_LENGTH = 4000;

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    if (!GEMINI_KEY) return json({ error: "Gemini API key is not configured" }, 500);

    const body = (await req.json()) as {
      text?: string;
      target_language?: string;
      source_language?: string;
    };

    const text = body.text?.trim();
    const targetLanguage = body.target_language?.trim();
    const sourceLanguage = body.source_language?.trim() || "the detected source language";

    if (!text || !targetLanguage) {
      return json({ error: "text and target_language are required" }, 400);
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return json({ error: `text must be ${MAX_TEXT_LENGTH} characters or fewer` }, 400);
    }
    if (targetLanguage.length > 80 || sourceLanguage.length > 80) {
      return json({ error: "language names must be 80 characters or fewer" }, 400);
    }

    const translatedText = await translate(text, sourceLanguage, targetLanguage);
    if (!translatedText) return json({ error: "Gemini returned no translation" }, 502);

    const audioBase64 = await speak(translatedText);
    if (!audioBase64) return json({ error: "Gemini text-to-speech request failed" }, 502);

    return json({
      translated_text: translatedText,
      audio_base64: audioBase64,
      audio_content_type: "audio/wav",
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

async function translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<string | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TRANSLATION_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: `Translate the user's text from ${sourceLanguage} to ${targetLanguage}. Return only the translated text, with no explanation.`,
          }],
        },
        contents: [{ parts: [{ text }] }],
        generationConfig: { temperature: 0 },
      }),
    },
  );
  const data = await res.json();
  const translated = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!translated) {
    console.error(`translate: no text in Gemini response (status ${res.status}):`, JSON.stringify(data));
    return null;
  }
  return translated;
}

async function speak(text: string): Promise<string | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } },
          },
        },
      }),
    },
  );
  const data = await res.json();
  const audioPart = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!audioPart?.data) {
    console.error(`speak: no audio in Gemini response (status ${res.status}):`, JSON.stringify(data));
    return null;
  }

  const pcmBytes = base64ToBytes(audioPart.data);
  const sampleRate = Number(/rate=(\d+)/.exec(audioPart.mimeType ?? "")?.[1] ?? 24000);
  return bytesToBase64(pcmToWav(pcmBytes, sampleRate));
}

// Gemini's TTS output is raw 16-bit-PCM audio bytes, not a self-contained
// file — wrap it in a standard 44-byte WAV header so it's directly playable
// via an <audio> element / Blob URL on the frontend.
function pcmToWav(pcm: Uint8Array, sampleRate: number, numChannels = 1, bitsPerSample = 16): Uint8Array {
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44 + pcm.length);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, pcm.length, true);

  const wav = new Uint8Array(buffer);
  wav.set(pcm, 44);
  return wav;
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
