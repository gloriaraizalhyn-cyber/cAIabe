// POST /functions/v1/translate-to-voice
// Body: { text: string, target_language: string, source_language?: string }
// Returns the translation and audio encoded as Base64.

import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
const MAX_TEXT_LENGTH = 4000;

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    if (!GEMINI_KEY) return json({ error: "Gemini API key is not configured" }, 500);

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

    const translationResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: `Translate text from ${sourceLanguage} to ${targetLanguage}. Return only the translated text, with no explanation.` }],
        },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { temperature: 0 },
      }),
      },
    );

    const translationData = await translationResponse.json();
    if (!translationResponse.ok) {
      return geminiError(translationData, "Translation request failed");
    }

    const translatedText = translationData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!translatedText) return json({ error: "Gemini returned no translation" }, 502);

    const speechResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: translatedText }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
        },
      }),
      },
    );

    if (!speechResponse.ok) {
      const speechData = await speechResponse.json().catch(() => null);
      return geminiError(speechData, "Text-to-speech request failed");
    }

    const speechData = await speechResponse.json();
    const parts = speechData?.candidates?.flatMap(
      (candidate: { content?: { parts?: unknown[] } }) => candidate.content?.parts ?? [],
    ) ?? [];
    const audio = parts.find(
      (part: { inlineData?: { data?: string } }) => part.inlineData?.data,
    )?.inlineData;
    if (!audio?.data) {
      const finishReason = speechData?.candidates?.[0]?.finishReason;
      const returnedText = parts.find((part: { text?: string }) => part.text)?.text;
      return json({
        error: returnedText
          ? `Gemini TTS returned text instead of audio: ${returnedText}`
          : "Gemini TTS returned no audio",
        code: finishReason ?? "NO_AUDIO",
      }, 502);
    }

    return json({
      translated_text: translatedText,
      audio_base64: audio.data,
      audio_content_type: audio.mimeType ?? "audio/L16;rate=24000",
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function geminiError(data: { error?: { status?: string; message?: string } } | null, fallback: string) {
  const code = data?.error?.status;
  const status = code === "RESOURCE_EXHAUSTED" ? 429 : 502;
  return json({ error: data?.error?.message ?? fallback, code }, status);
}