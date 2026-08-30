// POST /functions/v1/waiting-start
// Body: { route_id: string, lat: number, lng: number }
// Fuzzes the passenger's coordinate SERVER-SIDE (never trust a client-fuzzed
// value) and inserts a waiting row, then broadcasts it to drivers on that
// route only.

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";

const FUZZ_RADIUS_METERS_MIN = 80;
const FUZZ_RADIUS_METERS_MAX = 150;

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
    const { route_id, lat, lng, discount_type } = await req.json() as {
      route_id: string;
      lat: number;
      lng: number;
      discount_type?: string;
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