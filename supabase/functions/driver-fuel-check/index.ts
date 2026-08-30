// POST /functions/v1/driver-fuel-check
// Auth: required (driver JWT)
// Body: { destination?: { lat: number, lng: number } }  -- required for tricycles, ignored for jeepneys
//
// Branches on the calling driver's vehicle_type (see add_vehicle_type.sql):
//
//  - jeepney: runs a FIXED route, so there's nothing to compare against —
//    the only useful signal is "how much is today's traffic costing me?".
//    One computeRoutes call (current position -> route terminus) returns
//    both the traffic-aware duration and the free-flow staticDuration; the
//    gap between them is priced as idle fuel burn via estimateFuelCost().
//
//  - tricycle: has no fixed route, so instead this compares real
//    alternative road routes (computeAlternativeRoutes: true) from the
//    driver's current position to a passenger-requested destination, each
//    priced with the same estimateFuelCost(), so the driver can pick the
//    cheaper one instead of defaulting to the fastest.
//
// Both branches reuse the same shared fuel model (_shared/fuel.ts) so a
// jeepney's traffic delay and a tricycle's route choice are priced
// consistently.

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAuthedDriverId, getServiceClient } from "../_shared/client.ts";
import { estimateFuelCost } from "../_shared/fuel.ts";

const GOOGLE_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY")!;

// A jeepney driver is warned only once the traffic delay is big enough to
// matter — a 1-2 min gap is just measurement noise, not something worth
// interrupting a driver over.
const TRAFFIC_WARNING_DELAY_MINUTES = 5;

interface LatLng {
  lat: number;
  lng: number;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const driverId = await getAuthedDriverId(req.headers.get("Authorization"));
    if (!driverId) return json({ error: "not authenticated" }, 401);

    const { destination } = await req.json().catch(() => ({})) as { destination?: LatLng };

    const supabase = getServiceClient();

    const { data: driver, error: driverErr } = await supabase
      .from("drivers")
      .select("route_id, vehicle_type")
      .eq("id", driverId)
      .single();
    if (driverErr || !driver) return json({ error: "driver not found" }, 404);

    // Real passenger demand on this driver's route, from the existing
    // passenger_waiting_state table — not fabricated. null for tricycles
    // (no fixed route to count against).
    const waitingCount = driver.route_id
      ? (await supabase.rpc("get_waiting_passenger_count", { p_route_id: driver.route_id })).data ?? null
      : null;

    const { data: positionRows } = await supabase.rpc("get_driver_position", { p_driver_id: driverId });
    const origin = positionRows?.[0] as LatLng | undefined;
    if (!origin) {
      return json({ error: "no live position on file yet — broadcast a location update first" }, 400);
    }

    if (driver.vehicle_type === "tricycle") {
      if (!destination) {
        return json({ error: "destination is required for tricycle route comparison" }, 400);
      }
      return json(await compareTricycleRoutes(origin, destination));
    }

    // Default / jeepney path — needs the route's fixed terminus.
    if (!driver.route_id) {
      return json({ error: "driver has no assigned route" }, 400);
    }
    const { data: terminus } = await supabase.rpc("get_route_terminus_coords", {
      p_route_id: driver.route_id,
    });
    const dest = terminus?.[0];
    if (!dest) return json({ error: "route has no terminus on file" }, 500);

    return json({
      ...(await checkJeepneyTrafficFuel(origin, { lat: dest.lat, lng: dest.lng })),
      waiting_passenger_count: waitingCount,
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

// ---------- jeepney: fixed-route traffic-timing fuel warning ----------

async function checkJeepneyTrafficFuel(origin: LatLng, destination: LatLng) {
  const route = await computeRoute(origin, destination, { alternatives: false });
  if (!route) {
    return { vehicle_type: "jeepney", warning: false, message: "Could not reach the routing service." };
  }

  const distanceKm = route.distanceMeters / 1000;
  const trafficDurationMin = route.durationSeconds / 60;
  const staticDurationMin = route.staticDurationSeconds / 60;
  const trafficDelaySeconds = Math.max(0, route.durationSeconds - route.staticDurationSeconds);
  const trafficDelayMin = trafficDelaySeconds / 60;

  const fuel = estimateFuelCost("jeepney", distanceKm, trafficDelaySeconds);
  const baselineFuel = estimateFuelCost("jeepney", distanceKm, 0);
  const extraCostFromTraffic = round(fuel.cost - baselineFuel.cost);

  const warning = trafficDelayMin >= TRAFFIC_WARNING_DELAY_MINUTES;

  return {
    vehicle_type: "jeepney",
    distance_km: round(distanceKm),
    duration_traffic_min: round(trafficDurationMin),
    duration_free_flow_min: round(staticDurationMin),
    traffic_delay_min: round(trafficDelayMin),
    fuel,
    extra_fuel_cost_from_traffic: extraCostFromTraffic,
    warning,
    message: warning
      ? `Heavy traffic ahead on your route — about ${round(trafficDelayMin)} extra minutes, ~₱${extraCostFromTraffic} in extra fuel today.`
      : "Traffic on your route looks normal.",
  };
}

// ---------- tricycle: alternative-route comparison ----------

async function compareTricycleRoutes(origin: LatLng, destination: LatLng) {
  const routes = await computeRoutes(origin, destination, { alternatives: true });
  if (!routes.length) {
    return { vehicle_type: "tricycle", routes: [], message: "Could not reach the routing service." };
  }

  const priced = routes.map((route, index) => {
    const distanceKm = route.distanceMeters / 1000;
    return {
      index,
      distance_km: round(distanceKm),
      duration_min: round(route.durationSeconds / 60),
      fuel: estimateFuelCost("tricycle", distanceKm, 0),
    };
  });

  priced.sort((a, b) => a.fuel.cost - b.fuel.cost);

  return {
    vehicle_type: "tricycle",
    routes: priced,
    cheapest_index: priced[0]?.index ?? null,
  };
}

// ---------- Google Routes API ----------

interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  staticDurationSeconds: number;
}

// Single-route call (jeepney path) — also asks for staticDuration so the
// traffic-aware vs free-flow gap comes back in one request instead of two.
async function computeRoute(
  origin: LatLng,
  destination: LatLng,
  opts: { alternatives: boolean },
): Promise<RouteResult | null> {
  const routes = await computeRoutes(origin, destination, opts);
  return routes[0] ?? null;
}

async function computeRoutes(
  origin: LatLng,
  destination: LatLng,
  opts: { alternatives: boolean },
): Promise<RouteResult[]> {
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_KEY,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.staticDuration",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: "DRIVE",
      // Google's docs only demonstrate computeAlternativeRoutes alongside
      // TRAFFIC_AWARE, not TRAFFIC_AWARE_OPTIMAL — use the higher-precision
      // OPTIMAL preference only for the jeepney single-route traffic-delay
      // check, where no alternatives are requested.
      routingPreference: opts.alternatives ? "TRAFFIC_AWARE" : "TRAFFIC_AWARE_OPTIMAL",
      computeAlternativeRoutes: opts.alternatives,
    }),
  });

  if (!res.ok) {
    console.error("computeRoutes failed:", await res.text());
    return [];
  }

  const data = await res.json();
  if (!Array.isArray(data.routes)) return [];

  return data.routes.map((r: any) => ({
    distanceMeters: r.distanceMeters,
    durationSeconds: parseInt(String(r.duration).replace("s", ""), 10),
    staticDurationSeconds: parseInt(String(r.staticDuration).replace("s", ""), 10),
  }));
}

// ---------- helpers ----------

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
