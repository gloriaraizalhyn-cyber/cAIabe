import { corsHeaders, handleOptions } from "../_shared/cors.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-3.5-flash-lite";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

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

    const body = await req.json();

    const transcript = body?.transcript?.trim();

    if (!transcript) {
      return json(
        { error: "transcript is required" },
        400
      );
    }

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
You are a transportation assistant for a jeepney navigation app in Pampanga, Philippines.

The user speaks naturally, possibly in Kapampangan, Tagalog, English, or a mixture.

Extract the user's intended origin and destination.

Return ONLY valid JSON using exactly this structure:

{
  "originQuery": "place name or empty string",
  "destinationQuery": "place name or empty string"
}

Rules:
- Do not translate place names unnecessarily.
- Preserve recognizable local place names.
- If the user says "from X to Y", X is the origin and Y is the destination.
- If the user says they are currently at X and want to go to Y, X is the origin and Y is the destination.
- If only the destination is clear, leave originQuery as an empty string.
- If only the origin is clear, leave destinationQuery as an empty string.
- Do not invent locations.
- Do not add explanations.
- Return JSON only.
                `.trim(),
              },
            ],
          },

          contents: [
            {
              parts: [
                {
                  text: transcript,
                },
              ],
            },
          ],

          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Gemini parse error:",
        JSON.stringify(data)
      );

      return json(
        {
          error:
            data?.error?.message ??
            "Gemini parsing request failed",
        },
        502
      );
    }

    const generatedText =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!generatedText) {
      return json(
        { error: "Gemini returned no parsing result" },
        502
      );
    }

    console.log("Gemini raw response:", generatedText);

    let parsed;

    try {
      parsed = JSON.parse(generatedText);
    } catch (error) {
      console.error(
        "Failed to parse Gemini JSON:",
        error
      );

      return json(
        {
          error: "Gemini returned invalid JSON",
          raw: generatedText,
        },
        502
      );
    }

    return json({
      transcript,
      originQuery: parsed?.originQuery ?? "",
      destinationQuery: parsed?.destinationQuery ?? "",
    });

  } catch (error) {
    console.error("Parse voice error:", error);

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