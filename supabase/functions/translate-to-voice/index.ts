// POST /functions/v1/translate-to-voice
// Body: { text: string, target_language: string, source_language?: string }
// Returns the translation and MP3 audio encoded as Base64.

import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
const MAX_TEXT_LENGTH = 4000;

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    if (!OPENAI_KEY) return json({ error: "OpenAI API key is not configured" }, 500);

    const body = await req.json() as {
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

    const translationResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `Translate the user's text from ${sourceLanguage} to ${targetLanguage}. Return only the translated text, with no explanation.`,
          },
          { role: "user", content: text },
        ],
      }),
    });

    const translationData = await translationResponse.json();
    if (!translationResponse.ok) {
      return json({ error: translationData?.error?.message ?? "Translation request failed" }, 502);
    }

    const translatedText = translationData?.choices?.[0]?.message?.content?.trim();
    if (!translatedText) return json({ error: "OpenAI returned no translation" }, 502);

    const speechResponse = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "alloy",
        input: translatedText,
        response_format: "mp3",
      }),
    });

    if (!speechResponse.ok) {
      const speechError = await speechResponse.text();
      return json({ error: speechError || "Text-to-speech request failed" }, 502);
    }

    const audioBase64 = await toBase64(await speechResponse.arrayBuffer());

    return json({
      translated_text: translatedText,
      audio_base64: audioBase64,
      audio_content_type: "audio/mpeg",
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

async function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}