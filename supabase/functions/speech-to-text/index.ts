import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-3.5-flash-lite";

Deno.serve(async (req: Request) => {
  // Handle browser CORS preflight request
  const preflight = handleOptions(req);

  if (preflight) {
    return preflight;
  }

  try {
    if (!GEMINI_KEY) {
      return json(
        { error: "Gemini API key is not configured" },
        500
      );
    }

    if (req.method !== "POST") {
      return json(
        { error: "Method not allowed" },
        405
      );
    }

    // Receive the audio sent by the frontend
    const formData = await req.formData();

    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return json(
        { error: "audio file is required" },
        400
      );
    }

    console.log(
      `Received audio: ${audio.name}, ${audio.type}, ${audio.size} bytes`
    );

    // Gemini wants the bare mime type ("audio/webm", not "audio/webm;codecs=opus")
    const mimeType = (audio.type || "audio/webm").split(";")[0].trim();

    const audioBase64 = toBase64(
      new Uint8Array(await audio.arrayBuffer())
    );

    // Send audio to Gemini for transcription
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: `
You transcribe short voice requests for a jeepney navigation app in Pampanga, Philippines.

The speaker may use Kapampangan, Tagalog, English, or a mixture.

Rules:
- Transcribe exactly what was said, in the language it was spoken.
- Do not translate.
- Preserve local place names as spoken.
- Return only the transcript text, with no explanations or quotes.
- If there is no intelligible speech, return an empty response.
                `.trim(),
              },
            ],
          },

          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: audioBase64,
                  },
                },
                {
                  text: "Transcribe this audio.",
                },
              ],
            },
          ],

          generationConfig: {
            temperature: 0,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Gemini transcription error:",
        JSON.stringify(data)
      );

      return json(
        {
          error:
            data?.error?.message ??
            "Transcription request failed",
        },
        502
      );
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!text) {
      return json(
        { error: "No transcription returned" },
        502
      );
    }

    console.log("Transcription:", text);

    return json({
      text,
    });
  } catch (error) {
    console.error("Speech-to-text error:", error);

    return json(
      {
        error: String(error),
      },
      500
    );
  }
});

// Chunked so large recordings don't overflow String.fromCharCode's argument limit
function toBase64(bytes: Uint8Array): string {
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
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
