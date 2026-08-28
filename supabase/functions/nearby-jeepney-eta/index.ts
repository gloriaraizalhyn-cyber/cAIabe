// POST /functions/v1/nearby-jeepney-eta
// Body: { route_id: string, lat: number, lng: number }
// Returns: { etas: [{ driver_id, capacity_state, distance_meters, duration_seconds }] },
// sorted ascending by duration.
//
// Replaces the passenger-side straight-line/assumed-speed ETA guess with a
// real road-network lookup via Google's Routes API (computeRouteMatrix),
// using each currently-broadcasting driver's live position on this route as
// an origin and the passenger's own position as the single destination.
// The passenger's position is used only as an input to this call — it is
// never stored or broadcast (unlike waiting-start's fuzzed location).

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";

const GOOGLE_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY"); // optional

interface LatLng {
  lat: number;
  lng: number;
}

interface DriverPosition {
  driver_id: string;
  lat: number;
  lng: number;
  capacity_state: string;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { route_id, lat, lng } = await req.json() as { route_id: string; lat: number; lng: number };
    if (!route_id || lat === undefined || lng === undefined) {
      return json({ error: "route_id, lat, lng are required" }, 400);
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc("get_route_driver_positions", { p_route_id: route_id });
    if (error) return json({ error: error.message }, 500);

    const liveDrivers = (data ?? []) as DriverPosition[];
    if (!liveDrivers.length) return json({ etas: [] });

    const matrix = await computeRouteMatrix(
      liveDrivers.map((d) => ({ lat: d.lat, lng: d.lng })),
      { lat, lng },
    );

    const etas = liveDrivers
      .map((driver, originIndex) => {
        const cell = matrix.find((m) => m.originIndex === originIndex);
        if (!cell) return null;
        return {
          driver_id: driver.driver_id,
          capacity_state: driver.capacity_state,
          distance_meters: cell.distanceMeters,
          duration_seconds: cell.durationSeconds,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .sort((a, b) => a.duration_seconds - b.duration_seconds);

    const recommendation = await getWaitOrGoRecommendation(etas);

    return json({ etas, recommendation });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

// computeRouteMatrix requires an X-Goog-FieldMask header (unlike the legacy
// Directions/Distance Matrix APIs) — without it every field comes back
// empty rather than erroring, which is an easy thing to silently get wrong.
async function computeRouteMatrix(
  origins: LatLng[],
  destination: LatLng,
): Promise<{ originIndex: number; distanceMeters: number; durationSeconds: number }[]> {
  const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_KEY,
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
    },
    body: JSON.stringify({
      origins: origins.map((o) => ({
        waypoint: { location: { latLng: { latitude: o.lat, longitude: o.lng } } },
      })),
      destinations: [
        { waypoint: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } } },
      ],
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    }),
  });

  if (!res.ok) {
    console.error("computeRouteMatrix failed:", await res.text());
    return [];
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data
    .filter((cell: any) => cell.condition === "ROUTE_EXISTS")
    .map((cell: any) => ({
      originIndex: cell.originIndex ?? 0,
      distanceMeters: cell.distanceMeters,
      durationSeconds: parseInt(String(cell.duration).replace("s", ""), 10),
    }));
}

interface DriverEta {
  driver_id: string;
  capacity_state: string;
  distance_meters: number;
  duration_seconds: number;
}

interface WaitOrGoRecommendation {
  recommendation: "go" | "wait";
  headline: string;
  body: string;
}

// Deterministic rule used both as the response when GEMINI_API_KEY isn't
// configured, and as the safety fallback if the Gemini call ever errors or
// returns something unusable — mirrors the logic that used to live
// client-side in WaitingForJeepPage.jsx.
function fallbackRecommendation(etas: DriverEta[]): WaitOrGoRecommendation {
  const nearest = etas[0];
  const hasSeats = nearest.capacity_state !== "full";
  const etaMinutes = Math.max(1, Math.round(nearest.duration_seconds / 60));
  const distanceKm = (nearest.distance_meters / 1000).toFixed(1);

  if (hasSeats) {
    return {
      recommendation: "go",
      headline: "A jeepney with open seats is approaching",
      body: `It's about ${etaMinutes} min away (${distanceKm} km). Head to the bay to board.`,
    };
  }
  return {
    recommendation: "wait",
    headline: "The closest jeepney is full",
    body: "Please stand by at the bay — the next available unit is on its way.",
  };
}

async function getWaitOrGoRecommendation(etas: DriverEta[]): Promise<WaitOrGoRecommendation | null> {
  if (!etas.length) return null;
  if (!GEMINI_KEY) return fallbackRecommendation(etas);

  const context = etas.slice(0, 3).map((e, i) => ({
    rank: i + 1,
    eta_minutes: Math.max(1, Math.round(e.duration_seconds / 60)),
    distance_km: Math.round((e.distance_meters / 1000) * 10) / 10,
    seats_available: e.capacity_state !== "full",
  }));

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text:
                "You help a passenger waiting at a jeepney bay decide whether to board the nearest jeepney now or wait for a better one. " +
                "You are given the live jeepneys on this route closest to the passenger, ranked by ETA. " +
                "Recommend 'go' whenever the nearest jeepney (rank 1) has seats available — there is no reason to wait. " +
                "If rank 1 is full, recommend 'wait' — and if another ranked jeepney has seats available reasonably soon, mention it by its ETA in the body. " +
                "If none of the listed jeepneys have seats, still recommend 'wait' and be honest that there isn't a better option yet. " +
                "Reply with strict JSON only, matching the schema. headline <= 70 characters, body <= 160 characters, plain text, no markdown, no exclamation points.",
            }],
          },
          contents: [{
            parts: [{ text: `Live jeepneys on this route, nearest first: ${JSON.stringify(context)}` }],
          }],
          generationConfig: {
            maxOutputTokens: 200,
            temperature: 0.3,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                recommendation: { type: "STRING", enum: ["go", "wait"] },
                headline: { type: "STRING" },
                body: { type: "STRING" },
              },
              required: ["recommendation", "headline", "body"],
            },
          },
        }),
      },
    );

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error(`getWaitOrGoRecommendation: no text in Gemini response (status ${res.status}):`, JSON.stringify(data));
      return fallbackRecommendation(etas);
    }

    const parsed = JSON.parse(text);
    if (parsed?.recommendation !== "go" && parsed?.recommendation !== "wait") {
      return fallbackRecommendation(etas);
    }
    if (typeof parsed.headline !== "string" || typeof parsed.body !== "string") {
      return fallbackRecommendation(etas);
    }
    return parsed as WaitOrGoRecommendation;
  } catch (err) {
    console.error("getWaitOrGoRecommendation: Gemini call threw:", err);
    return fallbackRecommendation(etas);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
