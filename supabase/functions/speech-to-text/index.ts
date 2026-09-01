import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");

Deno.serve(async (req: Request) => {
  // Handle browser CORS preflight request
  const preflight = handleOptions(req);

  if (preflight) {
    return preflight;
  }

  try {
    if (!OPENAI_KEY) {
      return json(
        { error: "OpenAI API key is not configured" },
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

    // Prepare the file for OpenAI transcription
    const whisperForm = new FormData();

    whisperForm.append("file", audio);
    whisperForm.append("model", "whisper-1");

    // Send audio to OpenAI
    const transcriptionResponse = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
        },
        body: whisperForm,
      }
    );

    const transcriptionData =
      await transcriptionResponse.json();

    if (!transcriptionResponse.ok) {
      console.error(
        "OpenAI transcription error:",
        transcriptionData
      );

      return json(
        {
          error:
            transcriptionData?.error?.message ??
            "Transcription request failed",
        },
        502
      );
    }

    const text = transcriptionData?.text?.trim();

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}