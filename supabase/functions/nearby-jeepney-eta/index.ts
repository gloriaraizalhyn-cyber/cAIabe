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
    // get_route_visible_drivers (not lookup_functions.sql's
    // get_route_driver_positions) — only "next_to_go"/"driving" drivers
    // should ever factor into a passenger's ETA or WAIT/GO recommendation;
    // a parked driver's stale terminal position isn't an "incoming jeepney".
    const { data, error } = await supabase.rpc("get_route_visible_drivers", { p_route_id: route_id });
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

// A boardable (seats-available) jeepney arriving within this many minutes is
// worth waiting at the bay for — matches the product spec's own examples
// ("arrives in 5 min: WAIT", "arrives in 30 min: GO for other options"); 15
// min is the natural midpoint between those two anchors. Past this, or if
// nothing boardable is even on the way, GO — the same jeepney/route isn't
// worth standing around for.
const WAIT_THRESHOLD_MINUTES = 15;

// The single source of truth for go/wait — deterministic and ETA-driven, so
// it always matches the concrete minutes shown in the UI. Gemini (below), if
// configured, only phrases this already-decided value in natural language;
// it never recomputes it — mirrors driver-demand-check's
// already_decided_go_wait pattern for the same reason (so the AI layer can
// never silently disagree with the number on screen).
function decideRecommendation(etas: DriverEta[]): { recommendation: "go" | "wait"; boardable: DriverEta | null } {
  const boardable = etas.find((e) => e.capacity_state !== "full") ?? null;
  if (!boardable) return { recommendation: "go", boardable: null };

  const etaMinutes = Math.max(1, Math.round(boardable.duration_seconds / 60));
  return { recommendation: etaMinutes <= WAIT_THRESHOLD_MINUTES ? "wait" : "go", boardable };
}

// Deterministic copy used both as the response when GEMINI_API_KEY isn't
// configured, and as the safety fallback if the Gemini call ever errors or
// returns something unusable.
function fallbackCopy(
  recommendation: "go" | "wait",
  boardable: DriverEta | null,
): Pick<WaitOrGoRecommendation, "headline" | "body"> {
  if (!boardable) {
    return {
      headline: "No seats available nearby right now",
      body: "Every unit close by is full. Consider other options instead of waiting here.",
    };
  }

  const etaMinutes = Math.max(1, Math.round(boardable.duration_seconds / 60));
  const distanceKm = (boardable.distance_meters / 1000).toFixed(1);

  if (recommendation === "wait") {
    return {
      headline: "A jeepney with open seats is approaching",
      body: `It's about ${etaMinutes} min away (${distanceKm} km). Stand by at the bay to board.`,
    };
  }
  return {
    headline: "The nearest boardable jeepney is still far off",
    body: `Closest one with seats is about ${etaMinutes} min away (${distanceKm} km). Worth checking other options while you wait.`,
  };
}

async function getWaitOrGoRecommendation(etas: DriverEta[]): Promise<WaitOrGoRecommendation | null> {
  if (!etas.length) return null;

  const { recommendation, boardable } = decideRecommendation(etas);
  const fallback = fallbackCopy(recommendation, boardable);
  if (!GEMINI_KEY) return { recommendation, ...fallback };

  const context = {
    already_decided_recommendation: recommendation,
    wait_threshold_minutes: WAIT_THRESHOLD_MINUTES,
    boardable_eta_minutes: boardable ? Math.max(1, Math.round(boardable.duration_seconds / 60)) : null,
    boardable_distance_km: boardable ? Math.round((boardable.distance_meters / 1000) * 10) / 10 : null,
    other_units_nearby: etas.slice(0, 3).map((e, i) => ({
      rank: i + 1,
      eta_minutes: Math.max(1, Math.round(e.duration_seconds / 60)),
      seats_available: e.capacity_state !== "full",
    })),
  };

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
                "You write short status copy for a passenger waiting at a jeepney bay. You are given an " +
                "ALREADY-DECIDED recommendation ('go' or 'wait', already based on real ETA/seat data) — you must " +
                "NOT change it, invent numbers, or compute anything. Just phrase the given facts naturally. " +
                "'wait' means a boardable jeepney is close enough to be worth standing by for. 'go' means either " +
                "nothing boardable is close enough, or nothing nearby has seats at all — gently suggest checking " +
                "other options rather than standing around. " +
                "Reply with strict JSON only, matching the schema. headline <= 70 characters, body <= 160 characters, plain text, no markdown, no exclamation points.",
            }],
          },
          contents: [{ parts: [{ text: `Facts: ${JSON.stringify(context)}` }] }],
          generationConfig: {
            maxOutputTokens: 200,
            temperature: 0.3,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                headline: { type: "STRING" },
                body: { type: "STRING" },
              },
              required: ["headline", "body"],
            },
          },
        }),
      },
    );

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error(`getWaitOrGoRecommendation: no text in Gemini response (status ${res.status}):`, JSON.stringify(data));
      return { recommendation, ...fallback };
    }

    const parsed = JSON.parse(text);
    if (typeof parsed?.headline !== "string" || typeof parsed?.body !== "string") {
      return { recommendation, ...fallback };
    }
    return { recommendation, headline: parsed.headline, body: parsed.body };
  } catch (err) {
    console.error("getWaitOrGoRecommendation: Gemini call threw:", err);
    return { recommendation, ...fallback };
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
