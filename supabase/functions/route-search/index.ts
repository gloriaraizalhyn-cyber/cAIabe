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

// Fare discount rates by passenger type. Student/PWD/Senior Citizen are
// legally mandated 20% discounts in the Philippines (RA 11314, RA 10754,
// RA 9994 respectively). Pregnant Woman is intentionally 0% — Philippine
// law entitles pregnant passengers to priority seating, not a fare
// discount — change this if your implementation wants otherwise.
const DISCOUNT_RATES: Record<string, number> = {
  regular: 0,
  student: 0.20,
  pwd: 0.20,
  senior_citizen: 0.20,
  pregnant_woman: 0,
};

interface LatLng {
  lat: number;
  lng: number;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { origin, destination, discount_type } = await req.json() as {
      origin: LatLng;
      destination: LatLng;
      discount_type?: string;
    };

    if (!origin || !destination) {
      return json({ error: "origin and destination are required" }, 400);
    }

    const discountType = (discount_type ?? "regular").toLowerCase();
    if (!(discountType in DISCOUNT_RATES)) {
      return json(
        {
          error: `invalid discount_type. Must be one of: ${Object.keys(DISCOUNT_RATES).join(", ")}`,
        },
        400,
      );
    }
    const discountRate = DISCOUNT_RATES[discountType];

    const supabase = getServiceClient();

    // Pull all routes + their fare reference. For a school-project scale
    // dataset this is fine to fetch in full; if this grows, filter by a
    // bounding box around origin/destination first.
    const { data: routes, error: routesErr } = await supabase
      .from("routes")
      .select("id, name, color, fare_reference(base_fare, per_km_rate)");

    if (routesErr) return json({ error: routesErr.message }, 500);
    if (!routes?.length) return json({ error: "no routes configured" }, 404);

    // For each route, ask Google Distance Matrix for origin->terminus and
    // terminus->destination as a simple proxy for "does this route work".
    // (A real GTFS-based system would match stops along the route instead —
    // out of scope here, this is a workable approximation.)
    //
    // Terminus coordinates come from the get_route_terminus_coords RPC
    // rather than selecting `terminus` directly — PostgREST returns raw
    // PostGIS geography as WKB hex, not {lat,lng}, so the RPC (which does
    // the st_y/st_x extraction in SQL) is what makes this usable here.
    const scored = await Promise.all(
      routes.map(async (route: any) => {
        const { data: terminusRows, error: terminusErr } = await supabase.rpc(
          "get_route_terminus_coords",
          { p_route_id: route.id },
        );
        if (terminusErr || !terminusRows?.[0]) return null;
        const terminusCoords = { lat: terminusRows[0].lat, lng: terminusRows[0].lng };

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
        const fareBeforeDiscount = fareRef
          ? fareRef.base_fare + fareRef.per_km_rate * totalDistanceKm
          : null;
        const fareAfterDiscount =
          fareBeforeDiscount !== null
            ? fareBeforeDiscount * (1 - discountRate)
            : null;

        return {
          route_id: route.id,
          route_name: route.name,
          color: route.color ?? "blue",
          distance_km: round(totalDistanceKm),
          duration_min: round(totalDurationMin),
          fare_before_discount:
            fareBeforeDiscount !== null ? round(fareBeforeDiscount) : null,
          fare: fareAfterDiscount !== null ? round(fareAfterDiscount) : null,
          discount_type: discountType,
          discount_rate: discountRate,
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
    const discountNote =
      pick.discount_rate > 0
        ? ` (${pick.discount_type.replace("_", " ")} discount applied)`
        : "";
    return `${pick.route_name} is fastest overall at ~${pick.duration_min} min for ~₱${pick.fare}${discountNote}.`;
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