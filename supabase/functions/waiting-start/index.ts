// POST /functions/v1/waiting-start
// Body: { route_id: string, lat: number, lng: number, discount_type?, ride_distance_km? }
// Fuzzes the passenger's coordinate SERVER-SIDE (never trust a client-fuzzed
// value) and inserts a waiting row, then broadcasts it to drivers on that
// route only.

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";
import { estimateTripCarbon } from "../_shared/fuel.ts";

const FUZZ_RADIUS_METERS_MIN = 80;
const FUZZ_RADIUS_METERS_MAX = 150;

// Longest plausible jeepney ride in the app's coverage area — anything
// beyond it is a bad client value, not a real trip, and is skipped.
const MAX_RIDE_DISTANCE_KM = 60;

const VALID_DISCOUNT_TYPES = [
  "regular",
  "student",
  "pwd",
  "senior_citizen",
];

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { route_id, lat, lng, discount_type, ride_distance_km } = await req.json() as {
      route_id: string;
      lat: number;
      lng: number;
      discount_type?: string;
      ride_distance_km?: number;
    };

    if (!route_id || lat === undefined || lng === undefined) {
      return json({ error: "route_id, lat, lng are required" }, 400);
    }

    const discountType = (discount_type ?? "regular").toLowerCase();
    if (!VALID_DISCOUNT_TYPES.includes(discountType)) {
      return json(
        { error: `invalid discount_type. Must be one of: ${VALID_DISCOUNT_TYPES.join(", ")}` },
        400,
      );
    }

    const fuzzed = fuzzCoordinate(lat, lng);
    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("passenger_waiting_state")
      .insert({
        route_id,
        fuzzed_location: `SRID=4326;POINT(${fuzzed.lng} ${fuzzed.lat})`,
        status: "waiting",
        discount_type: discountType,
      })
      .select()
      .single();

    if (error) return json({ error: error.message }, 500);

    // Broadcast to anyone (driver UI) subscribed to this route's channel.
    // Channel naming convention: route:{route_id}:waiting
    // discount_type is intentionally NOT included here — it's stored for
    // the system's own record-keeping, not shown to drivers.
    await supabase.channel(`route:${route_id}:waiting`).send({
      type: "broadcast",
      event: "passenger_waiting",
      payload: {
        waiting_id: data.id,
        route_id,
        location: fuzzed,
      },
    });

    // A rider committing to a jeepney trip is the carbon panel's "rider
    // trip" signal (see add_carbon_impact.sql). Only the ride distance and
    // route are kept — no location. Best-effort: never fails the request.
    if (typeof ride_distance_km === "number" && ride_distance_km > 0 && ride_distance_km <= MAX_RIDE_DISTANCE_KM) {
      const carbon = estimateTripCarbon(ride_distance_km);
      const { error: logError } = await supabase.from("carbon_impact_events").insert({
        kind: "rider_trip",
        route_id,
        distance_km: carbon.ride_distance_km,
        co2_kg: carbon.saved_co2_kg,
      });
      if (logError) console.error("carbon impact log failed:", logError.message);
    }

    return json({ waiting_id: data.id, fuzzed_location: fuzzed, discount_type: discountType });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

// Random offset within a ring (not a disc, so points don't cluster at the
// center) at a random bearing — simplest default fuzzing method per the
// PRD's open item. Swap for snap-to-named-stop later if preferred.
function fuzzCoordinate(lat: number, lng: number) {
  const radius =
    FUZZ_RADIUS_METERS_MIN +
    Math.random() * (FUZZ_RADIUS_METERS_MAX - FUZZ_RADIUS_METERS_MIN);
  const bearing = Math.random() * 2 * Math.PI;

  const earthRadius = 6378137; // meters
  const dLat = (radius * Math.cos(bearing)) / earthRadius;
  const dLng =
    (radius * Math.sin(bearing)) /
    (earthRadius * Math.cos((Math.PI * lat) / 180));

  return {
    lat: lat + (dLat * 180) / Math.PI,
    lng: lng + (dLng * 180) / Math.PI,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}