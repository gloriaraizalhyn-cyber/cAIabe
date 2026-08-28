// POST /functions/v1/route-search
// Body: { origin: {lat,lng}, destination: {lat,lng}, discount_type? }
// Returns: { recommended: {...}, alternatives: [...] }
//
// Plans a realistic walk -> ride [-> walk -> ride]* -> walk itinerary along
// the real route polylines (routes.path), considering up to 2 transfers
// between routes that pass close enough to each other to walk between.
// Scoring (time/fare/distance/traffic) is computed here in code, NOT by
// Gemini. Gemini is only used to phrase the one-line explanation for the
// top pick — traffic itself is a real Google Routes API signal folded into
// each ride leg's duration before scoring, not something the model estimates.

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";

const GOOGLE_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY"); // optional

// How far a passenger will walk to board/alight a route, and how far
// they'll walk between two routes to transfer. Jeepney travel time along a
// ride leg is derived from the leg's real distance along the route's
// polyline (not a straight line) at this assumed average speed — jeepneys
// can't follow a car-optimized road path, so Google Directions per leg
// would just be wrong, not more accurate.
const WALK_BOARD_METERS = 700;
const WALK_TRANSFER_METERS = 250;
const AVG_JEEPNEY_SPEED_KMH = 15;
const MAX_RESULTS = 5;

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

interface BoardableRoute {
  route_id: string;
  distance_meters: number;
  lat: number;
  lng: number;
  fraction: number;
  route_length_meters: number;
}

interface RouteTransfer {
  route_a: string;
  route_b: string;
  a_lat: number;
  a_lng: number;
  a_fraction: number;
  a_length_meters: number;
  b_lat: number;
  b_lng: number;
  b_fraction: number;
  b_length_meters: number;
  distance_meters: number;
}

interface RouteRow {
  id: string;
  name: string;
  color: string | null;
  fare_reference?: { base_fare: number; per_km_rate: number }[];
}

// One boarding/alighting attachment point on a route: where a passenger
// gets on or off, expressed both as a real point and as its fraction along
// the route's polyline (0 = start of the stored line, 1 = end), plus that
// route's total length so ride distance can be derived without a lookup.
interface RoutePoint {
  point: LatLng;
  fraction: number;
  routeLengthMeters: number;
}

interface RideLegPlan {
  routeId: string;
  entry: RoutePoint;
  exit: RoutePoint;
}

interface CandidatePlan {
  routeIds: string[];
  rides: RideLegPlan[];
  walks: [LatLng, LatLng][]; // one more than rides.length: origin->ride0, ...,  rideN->destination
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

    const [routesRes, boardOriginRes, boardDestRes, transfersRes] = await Promise.all([
      supabase.from("routes").select("id, name, color, fare_reference(base_fare, per_km_rate)"),
      supabase.rpc("find_boardable_routes", {
        p_lat: origin.lat,
        p_lng: origin.lng,
        p_max_walk_meters: WALK_BOARD_METERS,
      }),
      supabase.rpc("find_boardable_routes", {
        p_lat: destination.lat,
        p_lng: destination.lng,
        p_max_walk_meters: WALK_BOARD_METERS,
      }),
      supabase.rpc("find_route_transfers", { p_max_transfer_meters: WALK_TRANSFER_METERS }),
    ]);

    if (routesRes.error) return json({ error: routesRes.error.message }, 500);
    if (boardOriginRes.error) return json({ error: boardOriginRes.error.message }, 500);
    if (boardDestRes.error) return json({ error: boardDestRes.error.message }, 500);
    if (transfersRes.error) return json({ error: transfersRes.error.message }, 500);

    const routesById = new Map<string, RouteRow>((routesRes.data ?? []).map((r: RouteRow) => [r.id, r]));
    const boardableAtOrigin = (boardOriginRes.data ?? []) as BoardableRoute[];
    const boardableAtDestination = (boardDestRes.data ?? []) as BoardableRoute[];
    const transfers = (transfersRes.data ?? []) as RouteTransfer[];

    if (!boardableAtOrigin.length || !boardableAtDestination.length) {
      return json(
        { error: "No jeepney route passes within walking distance of the origin or destination." },
        404,
      );
    }

    const boardDestByRoute = new Map(boardableAtDestination.map((b) => [b.route_id, b]));
    // Adjacency: for a given route, every transfer touching it, with the
    // OTHER route's id and each side's own attachment point.
    const transfersByRoute = new Map<string, { otherRouteId: string; here: RoutePoint; there: RoutePoint }[]>();
    for (const t of transfers) {
      const push = (routeId: string, otherId: string, here: RoutePoint, there: RoutePoint) => {
        if (!transfersByRoute.has(routeId)) transfersByRoute.set(routeId, []);
        transfersByRoute.get(routeId)!.push({ otherRouteId: otherId, here, there });
      };
      const aPoint: RoutePoint = {
        point: { lat: t.a_lat, lng: t.a_lng },
        fraction: t.a_fraction,
        routeLengthMeters: t.a_length_meters,
      };
      const bPoint: RoutePoint = {
        point: { lat: t.b_lat, lng: t.b_lng },
        fraction: t.b_fraction,
        routeLengthMeters: t.b_length_meters,
      };
      push(t.route_a, t.route_b, aPoint, bPoint);
      push(t.route_b, t.route_a, bPoint, aPoint);
    }

    const candidates: CandidatePlan[] = [];

    const boardPoint = (b: BoardableRoute): RoutePoint => ({
      point: { lat: b.lat, lng: b.lng },
      fraction: b.fraction,
      routeLengthMeters: b.route_length_meters,
    });

    // Direct: one route reachable from both origin and destination.
    for (const boardO of boardableAtOrigin) {
      const boardD = boardDestByRoute.get(boardO.route_id);
      if (!boardD) continue;
      candidates.push({
        routeIds: [boardO.route_id],
        rides: [
          {
            routeId: boardO.route_id,
            entry: boardPoint(boardO),
            exit: boardPoint(boardD),
          },
        ],
        walks: [
          [origin, { lat: boardO.lat, lng: boardO.lng }],
          [{ lat: boardD.lat, lng: boardD.lng }, destination],
        ],
      });
    }

    // 1 transfer: route1 (from origin) -> transfer -> route2 (to destination).
    for (const boardO of boardableAtOrigin) {
      const hops = transfersByRoute.get(boardO.route_id) ?? [];
      for (const hop of hops) {
        const boardD = boardDestByRoute.get(hop.otherRouteId);
        if (!boardD) continue;
        candidates.push({
          routeIds: [boardO.route_id, hop.otherRouteId],
          rides: [
            { routeId: boardO.route_id, entry: boardPoint(boardO), exit: hop.here },
            { routeId: hop.otherRouteId, entry: hop.there, exit: boardPoint(boardD) },
          ],
          walks: [
            [origin, { lat: boardO.lat, lng: boardO.lng }],
            [hop.here.point, hop.there.point],
            [{ lat: boardD.lat, lng: boardD.lng }, destination],
          ],
        });
      }
    }

    // 2 transfers: route1 (from origin) -> route2 -> route3 (to destination).
    for (const boardO of boardableAtOrigin) {
      const firstHops = transfersByRoute.get(boardO.route_id) ?? [];
      for (const hop1 of firstHops) {
        const secondHops = transfersByRoute.get(hop1.otherRouteId) ?? [];
        for (const hop2 of secondHops) {
          if (hop2.otherRouteId === boardO.route_id || hop2.otherRouteId === hop1.otherRouteId) continue;
          const boardD = boardDestByRoute.get(hop2.otherRouteId);
          if (!boardD) continue;
          candidates.push({
            routeIds: [boardO.route_id, hop1.otherRouteId, hop2.otherRouteId],
            rides: [
              { routeId: boardO.route_id, entry: boardPoint(boardO), exit: hop1.here },
              { routeId: hop1.otherRouteId, entry: hop1.there, exit: hop2.here },
              { routeId: hop2.otherRouteId, entry: hop2.there, exit: boardPoint(boardD) },
            ],
            walks: [
              [origin, { lat: boardO.lat, lng: boardO.lng }],
              [hop1.here.point, hop1.there.point],
              [hop2.here.point, hop2.there.point],
              [{ lat: boardD.lat, lng: boardD.lng }, destination],
            ],
          });
        }
      }
    }

    if (!candidates.length) {
      return json(
        { error: "Could not find a walkable route or transfer combination for this trip." },
        404,
      );
    }

    // Every walk leg gets Google Distance Matrix'd exactly once, even
    // though many candidates share the same origin/board or transfer walk.
    const walkKey = (from: LatLng, to: LatLng) => `${from.lat},${from.lng}|${to.lat},${to.lng}`;
    const walkCache = new Map<string, Promise<{ distanceMeters: number; durationSeconds: number } | null>>();
    const getWalk = (from: LatLng, to: LatLng) => {
      const key = walkKey(from, to);
      if (!walkCache.has(key)) {
        walkCache.set(key, distanceMatrix(from, to, "walking"));
      }
      return walkCache.get(key)!;
    };

    // Same dedup strategy for the traffic congestion multiplier on ride
    // legs — many candidates share the same route entry/exit points.
    const trafficCache = new Map<string, Promise<number>>();
    const getTrafficMultiplier = (from: LatLng, to: LatLng) => {
      const key = walkKey(from, to);
      if (!trafficCache.has(key)) {
        trafficCache.set(key, trafficMultiplier(from, to));
      }
      return trafficCache.get(key)!;
    };

    const scored = await Promise.all(
      candidates.map(async (candidate) => {
        const routes = candidate.routeIds.map((id) => routesById.get(id));
        if (routes.some((r) => !r)) return null;

        const walkResults = await Promise.all(candidate.walks.map(([from, to]) => getWalk(from, to)));
        if (walkResults.some((w) => !w)) return null;

        let totalDurationMin = 0;
        let totalDistanceKm = 0;
        let fareBeforeDiscount = 0;
        let hasFareData = true;

        for (const w of walkResults as { distanceMeters: number; durationSeconds: number }[]) {
          totalDurationMin += w.durationSeconds / 60;
          totalDistanceKm += w.distanceMeters / 1000;
        }

        const rideDistancesKm: number[] = [];
        const rideDurationsMin: number[] = [];
        const rideFares: number[] = [];
        const rideTrafficMultipliers: number[] = await Promise.all(
          candidate.rides.map((ride) => getTrafficMultiplier(ride.entry.point, ride.exit.point)),
        );

        candidate.rides.forEach((ride, i) => {
          const distanceMeters = Math.abs(ride.exit.fraction - ride.entry.fraction) * ride.entry.routeLengthMeters;
          const distanceKm = distanceMeters / 1000;
          const durationMin = (distanceKm / AVG_JEEPNEY_SPEED_KMH) * 60 * rideTrafficMultipliers[i];
          rideDistancesKm[i] = distanceKm;
          rideDurationsMin[i] = durationMin;
          totalDurationMin += durationMin;
          totalDistanceKm += distanceKm;

          const fareRef = routes[i]!.fare_reference?.[0];
          if (!fareRef) {
            hasFareData = false;
            rideFares[i] = 0;
          } else {
            const fare = fareRef.base_fare + fareRef.per_km_rate * distanceKm;
            rideFares[i] = fare;
            fareBeforeDiscount += fare;
          }
        });

        const fareAfterDiscount = hasFareData ? fareBeforeDiscount * (1 - discountRate) : null;

        return {
          candidate,
          routes: routes as RouteRow[],
          walkResults: walkResults as { distanceMeters: number; durationSeconds: number }[],
          rideDistancesKm,
          rideDurationsMin,
          rideFares,
          rideTrafficMultipliers,
          duration_min: totalDurationMin,
          distance_km: totalDistanceKm,
          fare_before_discount: hasFareData ? fareBeforeDiscount : null,
          fare: fareAfterDiscount,
        };
      }),
    );

    const valid = scored.filter((c): c is NonNullable<typeof c> => c !== null);
    if (!valid.length) {
      return json({ error: "could not compute any candidate routes" }, 502);
    }

    // Simple weighted score — lower is better. Normalize each metric against
    // the max in the candidate set so time/fare/distance are comparable.
    const maxTime = Math.max(...valid.map((c) => c.duration_min));
    const maxFare = Math.max(...valid.map((c) => c.fare ?? 0), 1);
    const maxDist = Math.max(...valid.map((c) => c.distance_km));

    const WEIGHTS = { time: 0.5, fare: 0.3, distance: 0.2 };

    const withScore = valid.map((c) => ({
      ...c,
      score:
        WEIGHTS.time * (c.duration_min / maxTime) +
        WEIGHTS.fare * ((c.fare ?? 0) / maxFare) +
        WEIGHTS.distance * (c.distance_km / maxDist),
    }));

    withScore.sort((a, b) => a.score - b.score);
    const top = withScore.slice(0, MAX_RESULTS);

    // Only fetch the real polyline shape for legs that made the cut.
    const results = await Promise.all(top.map((c) => buildResult(supabase, c, discountType, discountRate)));

    const [best, ...rest] = results;
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

async function buildResult(
  supabase: ReturnType<typeof getServiceClient>,
  scoredCandidate: {
    candidate: CandidatePlan;
    routes: RouteRow[];
    walkResults: { distanceMeters: number; durationSeconds: number }[];
    rideDistancesKm: number[];
    rideDurationsMin: number[];
    rideFares: number[];
    rideTrafficMultipliers: number[];
    duration_min: number;
    distance_km: number;
    fare_before_discount: number | null;
    fare: number | null;
  },
  discountType: string,
  discountRate: number,
) {
  const { candidate, routes, walkResults, rideDistancesKm, rideDurationsMin, rideFares, rideTrafficMultipliers } =
    scoredCandidate;

  const ridePaths = await Promise.all(
    candidate.rides.map(async (ride) => {
      const { data } = await supabase.rpc("get_route_subpath_points", {
        p_route_id: ride.routeId,
        p_fraction_a: ride.entry.fraction,
        p_fraction_b: ride.exit.fraction,
      });
      const points = (data ?? []) as LatLng[];
      // get_route_subpath_points always returns points ordered from the
      // lower fraction to the higher one — reverse when travel direction
      // along the stored polyline runs the other way.
      return ride.entry.fraction <= ride.exit.fraction ? points : [...points].reverse();
    }),
  );

  const legs: unknown[] = [];
  candidate.walks.forEach(([from, to], i) => {
    legs.push({
      kind: "walk",
      from,
      to,
      distance_m: round(walkResults[i].distanceMeters),
      duration_min: round(walkResults[i].durationSeconds / 60),
    });
    if (i < candidate.rides.length) {
      const ride = candidate.rides[i];
      const route = routes[i];
      legs.push({
        kind: "jeep",
        route_id: ride.routeId,
        route_name: route.name,
        color: route.color ?? "blue",
        from: ride.entry.point,
        to: ride.exit.point,
        path: ridePaths[i],
        distance_km: round(rideDistancesKm[i]),
        duration_min: round(rideDurationsMin[i]),
        fare: round(rideFares[i]),
        traffic_multiplier: round(rideTrafficMultipliers[i]),
      });
    }
  });

  const avgTrafficMultiplier =
    rideTrafficMultipliers.length
      ? rideTrafficMultipliers.reduce((sum, m) => sum + m, 0) / rideTrafficMultipliers.length
      : 1;

  return {
    route_id: routes[0].id,
    route_name: routes.map((r) => r.name).join(" → "),
    color: routes[0].color ?? "blue",
    transfer_count: routes.length - 1,
    distance_km: round(scoredCandidate.distance_km),
    duration_min: round(scoredCandidate.duration_min),
    fare_before_discount: scoredCandidate.fare_before_discount !== null ? round(scoredCandidate.fare_before_discount) : null,
    fare: scoredCandidate.fare !== null ? round(scoredCandidate.fare) : null,
    traffic_multiplier: round(avgTrafficMultiplier),
    discount_type: discountType,
    discount_rate: discountRate,
    legs,
  };
}

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
  mode: "driving" | "walking",
): Promise<{ distanceMeters: number; durationSeconds: number } | null> {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/distancematrix/json",
  );
  url.searchParams.set("origins", `${from.lat},${from.lng}`);
  url.searchParams.set("destinations", `${to.lat},${to.lng}`);
  url.searchParams.set("mode", mode);
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

function trafficDescriptor(multiplier: number): string {
  if (multiplier < 1.15) return "light traffic";
  if (multiplier < 1.4) return "moderate traffic";
  return "heavy traffic";
}

async function explainTopPick(pick: any): Promise<string> {
  const transferNote = pick.transfer_count > 0 ? `, with ${pick.transfer_count} transfer(s)` : "";
  const traffic = trafficDescriptor(pick.traffic_multiplier ?? 1);

  if (!GEMINI_KEY) {
    // Fallback so the function still works without a Gemini key configured
    const discountNote =
      pick.discount_rate > 0
        ? ` (${pick.discount_type.replace("_", " ")} discount applied)`
        : "";
    return `${pick.route_name} is fastest overall at ~${pick.duration_min} min for ~₱${pick.fare} amid ${traffic}${transferNote}${discountNote}.`;
  }

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
                "Write ONE short, plain sentence recommending a jeepney trip to a passenger, given its stats. Mention the traffic condition naturally if it's not light. No markdown, no exclamation points.",
            }],
          },
          contents: [{
            parts: [{
              text: `Trip: ${pick.route_name}, duration: ${pick.duration_min} min, fare: ₱${pick.fare}, distance: ${pick.distance_km} km, transfers: ${pick.transfer_count}, current traffic: ${traffic}.`,
            }],
          }],
          generationConfig: { maxOutputTokens: 60, temperature: 0.4 },
        }),
      },
    );
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      console.error(`explainTopPick: no text in Gemini response (status ${res.status}):`, JSON.stringify(data));
      return `${pick.route_name} is the recommended trip.`;
    }
    return text;
  } catch (err) {
    console.error("explainTopPick: Gemini call threw:", err);
    return `${pick.route_name} is the recommended trip.`;
  }
}

// Congestion multiplier for a driving corridor between two points: current
// traffic-aware duration divided by the traffic-free duration. Used only as
// a ratio applied to our own distance/speed-based jeepney estimate — NOT as
// Google's literal driving path, since jeepneys don't follow a
// car-optimized route (see file header). Soft-fails to 1.0 (no adjustment)
// since traffic is an enhancement, unlike the walk-leg calls a candidate
// needs to be valid at all.
async function trafficMultiplier(from: LatLng, to: LatLng): Promise<number> {
  try {
    const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_KEY,
        "X-Goog-FieldMask": "originIndex,destinationIndex,duration,staticDuration,condition",
      },
      body: JSON.stringify({
        origins: [{ waypoint: { location: { latLng: { latitude: from.lat, longitude: from.lng } } } }],
        destinations: [{ waypoint: { location: { latLng: { latitude: to.lat, longitude: to.lng } } } }],
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
      }),
    });
    if (!res.ok) return 1;

    const data = await res.json();
    const cell = Array.isArray(data) ? data.find((c: any) => c.condition === "ROUTE_EXISTS") : null;
    if (!cell) return 1;

    const trafficSeconds = parseInt(String(cell.duration).replace("s", ""), 10);
    const staticSeconds = parseInt(String(cell.staticDuration).replace("s", ""), 10);
    if (!trafficSeconds || !staticSeconds) return 1;

    return Math.min(2.5, Math.max(1, trafficSeconds / staticSeconds));
  } catch {
    return 1;
  }
}
