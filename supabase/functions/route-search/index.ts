// POST /functions/v1/route-search
// Body: { origin: {lat,lng}, destination: {lat,lng} }
// Returns: { recommended: {...}, alternatives: [...] }
//
// Scoring (time/fare/distance) is computed here in code, NOT by OpenAI.
// OpenAI is only used to phrase the one-line explanation for the top pick.

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";

const GOOGLE_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY")!;
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY"); // optional

interface LatLng {
  lat: number;
  lng: number;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { origin, destination } = await req.json() as {
      origin: LatLng;
      destination: LatLng;
    };

    if (!origin || !destination) {
      return json({ error: "origin and destination are required" }, 400);
    }

    const supabase = getServiceClient();

    // Pull all routes + their fare reference. For a school-project scale
    // dataset this is fine to fetch in full; if this grows, filter by a
    // bounding box around origin/destination first.
    const { data: routes, error: routesErr } = await supabase
      .from("routes")
      .select("id, name, color, terminus, fare_reference(base_fare, per_km_rate)");

    if (routesErr) return json({ error: routesErr.message }, 500);
    if (!routes?.length) return json({ error: "no routes configured" }, 404);

    // For each route, ask Google Distance Matrix for origin->terminus and
    // terminus->destination as a simple proxy for "does this route work".
    // (A real GTFS-based system would match stops along the route instead —
    // out of scope here, this is a workable approximation.)
    const scored = await Promise.all(
      routes.map(async (route: any) => {
        const terminusCoords = parsePoint(route.terminus);
        if (!terminusCoords) return null;

        const [legToTerminus, legFromTerminus] = await Promise.all([
          distanceMatrix(origin, terminusCoords),
          distanceMatrix(terminusCoords, destination),
        ]);

        if (!legToTerminus || !legFromTerminus) return null;

        const totalDistanceKm =
          (legToTerminus.distanceMeters + legFromTerminus.distanceMeters) / 1000;
        const totalDurationMin =
          (legToTerminus.durationSeconds + legFromTerminus.durationSeconds) / 60;

        const fareRef = route.fare_reference?.[0];
        const totalFare = fareRef
          ? fareRef.base_fare + fareRef.per_km_rate * totalDistanceKm
          : null;

        return {
                route_id: route.id,
                route_name: route.name,
                color: route.color ?? "blue",
                distance_km: round(totalDistanceKm),
                duration_min: round(totalDurationMin),
                eta: calculateETA(
                legToTerminus.durationSeconds + legFromTerminus.durationSeconds,),
                fare: totalFare !== null ? round(totalFare) : null,
              };
      }),
    );

    const candidates = scored.filter((c): c is NonNullable<typeof c> => c !== null);
    if (!candidates.length) {
      return json({ error: "could not compute any candidate routes" }, 502);
    }

    // Simple weighted score — lower is better. Normalize each metric against
    // the max in the candidate set so time/fare/distance are comparable.
    const maxTime = Math.max(...candidates.map((c) => c.duration_min));
    const maxFare = Math.max(...candidates.map((c) => c.fare ?? 0), 1);
    const maxDist = Math.max(...candidates.map((c) => c.distance_km));

    const WEIGHTS = { time: 0.5, fare: 0.3, distance: 0.2 };

    const withScore = candidates.map((c) => ({
      ...c,
      score:
        WEIGHTS.time * (c.duration_min / maxTime) +
        WEIGHTS.fare * ((c.fare ?? 0) / maxFare) +
        WEIGHTS.distance * (c.distance_km / maxDist),
    }));

    withScore.sort((a, b) => a.score - b.score);
    const [best, ...rest] = withScore;

    const explanation = await explainTopPick(best);

    return json({
      recommended: { ...best, explanation },
      alternatives: rest,
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

// ---------- helpers ----------

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function calculateETA(durationSeconds: number): string {
  const now = new Date();
  const eta = new Date(now.getTime() + durationSeconds * 1000);

  return eta.toISOString();
}

// Parses a PostGIS geography point returned by PostgREST (WKB hex or GeoJSON
// depending on config). Adjust if your PostgREST is set to return GeoJSON —
// in that case just use terminus.coordinates directly instead.
function parsePoint(raw: any): LatLng | null {
  if (!raw) return null;
  if (typeof raw === "object" && raw.coordinates) {
    const [lng, lat] = raw.coordinates;
    return { lat, lng };
  }
  return null;
}

async function distanceMatrix(
  from: LatLng,
  to: LatLng,
): Promise<{ distanceMeters: number; durationSeconds: number } | null> {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/distancematrix/json",
  );
  url.searchParams.set("origins", `${from.lat},${from.lng}`);
  url.searchParams.set("destinations", `${to.lat},${to.lng}`);
  url.searchParams.set("key", GOOGLE_KEY);

  const res = await fetch(url.toString());
  const data = await res.json();
  const element = data?.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") return null;

  return {
    distanceMeters: element.distance.value,
    durationSeconds: element.duration.value,
  };
}

async function explainTopPick(pick: any): Promise<string> {
  if (!OPENAI_KEY) {
    // Fallback so the function still works without an OpenAI key configured
    return `${pick.route_name} is fastest overall at ~${pick.duration_min} min for ~₱${pick.fare}.`;
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Write ONE short, plain sentence recommending a jeepney route to a passenger, given its stats. No markdown, no exclamation points.",
          },
          {
            role: "user",
            content: `Route: ${pick.route_name}, duration: ${pick.duration_min} min, fare: ₱${pick.fare}, distance: ${pick.distance_km} km.`,
          },
        ],
        max_tokens: 60,
      }),
    });
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() ??
      `${pick.route_name} is the recommended route.`;
  } catch {
    return `${pick.route_name} is the recommended route.`;
  }
}
