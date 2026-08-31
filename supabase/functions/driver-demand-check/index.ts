// POST /functions/v1/driver-demand-check
// Auth: required (driver JWT)
// Body: { lat: number, lng: number, trend_window_minutes?: number, roadside_idle_minutes?: number }
//
// Sak.AI's driver-side demand engine — powers:
//   - "WAIT or GO?" (driver at the terminal, front of queue)
//   - "CONTINUE or GARAGE?" (driver mid-shift, deciding whether to keep driving)
//   - roadside-idling detection (optional, only when roadside_idle_minutes is
//     sent — see useRoadsideIdleTracker.js): a driver stopped mid-route,
//     outside the terminal, engine presumably running, waiting for
//     passengers instead of continuing. Folds into the CONTINUE/GARAGE call
//     above as an additional input rather than a separate recommendation —
//     terminal queueing (queue_entries) is a fully separate system and never
//     sends this field at all, so it's never affected.
//
// Both questions are answered from the SAME underlying signal: real
// passenger_waiting_state rows on the driver's own route_id (which is
// already the route-compatibility filter — a passenger commits to a
// specific route the moment they call waiting-start), scored against the
// driver's live position via calculateDriverDemand() below. Nothing here is
// a trained model — it's an explicit, inspectable scoring function per the
// PRD, structured so a real ML model can later replace calculateDriverDemand
// without touching anything else (the clustering/trend/response shape stay
// the same). Gemini, if configured, is used ONLY to phrase the two
// already-decided recommendations into natural language — it never computes
// distance, clustering, route compatibility, the demand score, or which
// recommendation to make (mirrors route-search's explainTopPick pattern).

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAuthedDriverId, getServiceClient } from "../_shared/client.ts";
import { estimateIdleFuelRange, type FuelRangeEstimate } from "../_shared/fuel.ts";

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY"); // optional

// ---------- configuration (tune here, not buried in the logic below) ----------

// A passenger this far or more BEHIND the driver along the route (negative
// distance_ahead_meters) is excluded from demand consideration entirely —
// the jeepney isn't turning around. The tolerance absorbs GPS/fuzz noise
// right around the driver's own position (waiting-start fuzzes passenger
// coordinates by 80-150m).
const BEHIND_TOLERANCE_METERS = 150;

// Passengers within this radius of each other are folded into one demand
// cluster rather than counted as separate blips.
const CLUSTER_RADIUS_METERS = 300;

// Distance bands a cluster gets labeled with, per the PRD. Farthest band is
// implicit (anything past the last threshold).
const DISTANCE_BANDS = [
  { key: "high_priority", label: "HIGH PRIORITY", maxKm: 1 },
  { key: "good_demand", label: "GOOD DEMAND", maxKm: 3 },
  { key: "moderate_demand", label: "MODERATE DEMAND", maxKm: 5 },
];
const FAR_BAND = { key: "low_demand", label: "LOW/IRRELEVANT DEMAND" };

// calculateDriverDemand() scoring weights — normalized to sum to 100.
const SCORING = {
  countMaxPoints: 40,
  countSaturatesAt: 15, // 15+ compatible passengers = full count score
  proximityMaxPoints: 35,
  proximityZeroBeyondKm: 5, // nearest cluster this far or farther = zero proximity score
  clusterMaxPoints: 25,
  clusterSaturatesAtSize: 6, // one cluster of 6+ riders = full cluster score
};

// Demand score -> level/recommendation thresholds (0-100 scale).
const DEMAND_LEVEL_THRESHOLDS = { moderateMin: 31, highMin: 61 };
const GO_THRESHOLD = 60; // demandScore >= this => GO, matches highMin - 1

// Real recent-vs-prior request-rate trend (from actual created_at
// timestamps — see get_route_waiting_activity), NOT fabricated history.
const DEFAULT_TREND_WINDOW_MINUTES = 15;
const MIN_TREND_WINDOW_MINUTES = 1;
const MAX_TREND_WINDOW_MINUTES = 120;
const TREND_STABLE_BAND_PCT = 15; // +/- this % change counts as "stable", not a real trend

// ---------- roadside idling (see useRoadsideIdleTracker.js — driver-side,
// not terminal queueing, which is a fully separate, unrelated system) ----------
// Client-reported minutes stationary outside the terminal, same trust model
// as lat/lng (this is an internal driver-only tool). Bands below MUST stay
// in sync with useRoadsideIdleTracker.js's own copy of these same numbers —
// no shared-import boundary exists between Deno edge functions and the Vite
// frontend, so this duplication is deliberate, not an oversight.
const ROADSIDE_MONITOR_MINUTES = 2;
const ROADSIDE_WARNING_MINUTES = 5;
const ROADSIDE_PROLONGED_MINUTES = 10;
const MAX_ROADSIDE_IDLE_MINUTES = 240; // clamp ceiling for a client-reported value

interface LatLng {
  lat: number;
  lng: number;
}

interface ActiveWaitingRow {
  id: string;
  lat: number;
  lng: number;
  distance_meters: number;
  distance_ahead_meters: number | null;
  created_at: string;
}

interface Cluster {
  lat: number;
  lng: number;
  count: number;
  distanceMeters: number;
  bandKey: string;
  bandLabel: string;
}

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const driverId = await getAuthedDriverId(req.headers.get("Authorization"));
    if (!driverId) return json({ error: "not authenticated" }, 401);

    const body = await req.json().catch(() => ({})) as {
      lat?: number;
      lng?: number;
      trend_window_minutes?: number;
      roadside_idle_minutes?: number;
    };
    if (body.lat === undefined || body.lng === undefined) {
      return json({ error: "lat and lng are required" }, 400);
    }
    const driverPosition: LatLng = { lat: body.lat, lng: body.lng };
    const trendWindowMinutes = clamp(
      body.trend_window_minutes ?? DEFAULT_TREND_WINDOW_MINUTES,
      MIN_TREND_WINDOW_MINUTES,
      MAX_TREND_WINDOW_MINUTES,
    );
    const roadsideIdleMinutes =
      body.roadside_idle_minutes !== undefined
        ? clamp(body.roadside_idle_minutes, 0, MAX_ROADSIDE_IDLE_MINUTES)
        : null;

    const supabase = getServiceClient();

    const { data: driver, error: driverErr } = await supabase
      .from("drivers")
      .select("route_id, route:routes(id, name)")
      .eq("id", driverId)
      .single();
    if (driverErr || !driver) return json({ error: "driver not found" }, 404);
    if (!driver.route_id) return json({ error: "driver has no assigned route" }, 400);

    const [activeRes, trendRes] = await Promise.all([
      supabase.rpc("get_route_active_waiting_passengers", {
        p_route_id: driver.route_id,
        p_lat: driverPosition.lat,
        p_lng: driverPosition.lng,
      }),
      supabase.rpc("get_route_waiting_activity", {
        p_route_id: driver.route_id,
        p_since: new Date(Date.now() - 2 * trendWindowMinutes * 60000).toISOString(),
      }),
    ]);
    if (activeRes.error) return json({ error: activeRes.error.message }, 500);
    if (trendRes.error) return json({ error: trendRes.error.message }, 500);

    const allActive = (activeRes.data ?? []) as ActiveWaitingRow[];

    // Route compatibility is enforced upstream as a hard filter (the RPC
    // only ever returns rows on this driver's own route_id) — a passenger
    // waiting for a different route never enters this computation at all.
    const ahead = allActive.filter(
      (row) => row.distance_ahead_meters === null || row.distance_ahead_meters >= -BEHIND_TOLERANCE_METERS,
    );
    const excludedBehindCount = allActive.length - ahead.length;

    const effectiveDistance = (row: ActiveWaitingRow) =>
      Math.max(0, row.distance_ahead_meters ?? row.distance_meters);

    const clusters = clusterPassengers(ahead, effectiveDistance);
    const compatiblePassengerCount = ahead.length;
    const nearestCluster = clusters[0] ?? null;
    const largestClusterSize = clusters.reduce((max, c) => Math.max(max, c.count), 0);

    const demandScore = calculateDriverDemand({
      compatibleCount: compatiblePassengerCount,
      nearestClusterDistanceMeters: nearestCluster?.distanceMeters ?? null,
      largestClusterSize,
    });
    const demandLevel = classifyDemandLevel(demandScore);
    const recommendation: "go" | "wait" = demandScore >= GO_THRESHOLD ? "go" : "wait";

    const trend = calculateTrend(
      (trendRes.data ?? []) as { created_at: string }[],
      trendWindowMinutes,
    );

    const baseOperatingRecommendation = calculateOperatingDemand(demandScore, trend.direction);
    const confidence = computeConfidence(demandScore, compatiblePassengerCount);
    const timeContext = getTimeContext(new Date());

    // Roadside idling: outside the terminal, stationary, past a duration
    // threshold (see useRoadsideIdleTracker.js) — a fully separate concern
    // from terminal queueing, which never sends roadside_idle_minutes at
    // all. Only genuinely LOW demand + prolonged idling nudges the
    // CONTINUE/GARAGE call toward GARAGE; moderate/high demand is never
    // overridden by idle duration, matching "don't warn when demand
    // justifies waiting."
    const idleStatus = classifyIdleStatus(roadsideIdleMinutes);
    const idleEscalated =
      demandLevel === "low" &&
      (idleStatus === "idling" || idleStatus === "prolonged") &&
      baseOperatingRecommendation === "continue_caution";
    const operatingRecommendation = idleEscalated ? "garage" : baseOperatingRecommendation;

    const fartherStrongCluster = findFartherStrongCluster(clusters);
    const idleFuel: FuelRangeEstimate | null =
      idleStatus === "idling" || idleStatus === "prolonged"
        ? estimateIdleFuelRange("jeepney", roadsideIdleMinutes ?? 0)
        : null;

    const reasons = buildGoWaitReasons({
      compatiblePassengerCount,
      nearestCluster,
      largestClusterSize,
      demandLevel,
      trend,
      trendWindowMinutes,
    });
    const operatingReasons = buildOperatingReasons({
      compatiblePassengerCount,
      demandLevel,
      trend,
      trendWindowMinutes,
      operatingRecommendation,
      idleEscalated,
      roadsideIdleMinutes,
    });
    const roadsideIdleReasons = buildRoadsideIdleReasons({
      idleStatus,
      roadsideIdleMinutes,
      demandLevel,
      idleFuel,
      fartherStrongCluster,
    });

    const fallbackCopy = buildFallbackCopy({
      recommendation,
      operatingRecommendation,
      compatiblePassengerCount,
      nearestCluster,
      demandLevel,
      idleEscalated,
    });
    const roadsideIdleFallback = buildRoadsideIdleFallbackCopy({
      idleStatus,
      roadsideIdleMinutes,
      demandLevel,
      idleFuel,
      fartherStrongCluster,
    });
    const copy = await getPhrasedCopy({
      recommendation,
      operatingRecommendation,
      demandScore,
      demandLevel,
      compatiblePassengerCount,
      nearestClusterDistanceKm: nearestCluster ? round(nearestCluster.distanceMeters / 1000) : null,
      largestClusterSize,
      trend,
      timeContext,
      fallback: fallbackCopy,
      roadsideIdle:
        idleStatus === "none"
          ? null
          : {
              status: idleStatus,
              minutes: roadsideIdleMinutes ?? 0,
              demandLevel,
              fuel: idleFuel,
              fartherStrongClusterKm: fartherStrongCluster ? round(fartherStrongCluster.distanceMeters / 1000) : null,
            },
      roadsideIdleFallback,
    });

    return json({
      route_id: driver.route_id,
      route_name: driver.route?.name ?? null,
      demand_score: demandScore,
      demand_level: demandLevel,
      recommendation,
      confidence,
      compatible_passenger_count: compatiblePassengerCount,
      excluded_behind_count: excludedBehindCount,
      nearest_distance_km: nearestCluster ? round(nearestCluster.distanceMeters / 1000) : null,
      // Individual passenger points (not just cluster centroids) — the
      // product spec asks for a per-passenger "waiting status" icon on the
      // driver's own map, scoped to compatible (ahead-of-driver, same
      // route) passengers only. Reuses `ahead`, already fetched/filtered
      // above — no extra query. Coordinates are the same fuzzed_location
      // already used for clustering, so this exposes nothing more precise
      // than what the driver already sees via cluster centroids.
      waiting_passengers: ahead.map((row) => ({ id: row.id, lat: row.lat, lng: row.lng })),
      clusters: clusters.map((c) => ({
        lat: c.lat,
        lng: c.lng,
        count: c.count,
        distance_km: round(c.distanceMeters / 1000),
        band: c.bandKey,
        band_label: c.bandLabel,
      })),
      trend: {
        direction: trend.direction,
        recent_count: trend.recentCount,
        prior_count: trend.priorCount,
        change_pct: trend.changePct,
        window_minutes: trendWindowMinutes,
      },
      time_context: timeContext,
      reasons,
      headline: copy.goWaitHeadline,
      body: copy.goWaitBody,
      operating: {
        recommendation: operatingRecommendation,
        reasons: operatingReasons,
        headline: copy.operatingHeadline,
        body: copy.operatingBody,
      },
      roadside_idle:
        idleStatus === "none"
          ? null
          : {
              status: idleStatus,
              minutes: round(roadsideIdleMinutes ?? 0),
              demand_level: demandLevel,
              fuel: idleFuel,
              farther_cluster_km: fartherStrongCluster ? round(fartherStrongCluster.distanceMeters / 1000) : null,
              headline: copy.roadsideIdleHeadline ?? roadsideIdleFallback?.headline ?? null,
              body: copy.roadsideIdleBody ?? roadsideIdleFallback?.body ?? null,
              reasons: roadsideIdleReasons,
            },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

// ---------- calculateDriverDemand() ----------
// The single scoring function the PRD asks for. Every input is a real,
// already-computed geographic/count fact — nothing here is learned or
// invented. Swap this out for a trained model later without touching the
// clustering, trend, or response-shaping code around it.
function calculateDriverDemand(input: {
  compatibleCount: number;
  nearestClusterDistanceMeters: number | null;
  largestClusterSize: number;
}): number {
  const countScore = clamp(input.compatibleCount / SCORING.countSaturatesAt, 0, 1) * SCORING.countMaxPoints;

  const nearestKm = input.nearestClusterDistanceMeters !== null ? input.nearestClusterDistanceMeters / 1000 : Infinity;
  const proximityScore =
    clamp(1 - nearestKm / SCORING.proximityZeroBeyondKm, 0, 1) * SCORING.proximityMaxPoints;

  const clusterScore =
    clamp(input.largestClusterSize / SCORING.clusterSaturatesAtSize, 0, 1) * SCORING.clusterMaxPoints;

  return Math.round(clamp(countScore + proximityScore + clusterScore, 0, 100));
}

function classifyDemandLevel(score: number): "low" | "moderate" | "high" {
  if (score >= DEMAND_LEVEL_THRESHOLDS.highMin) return "high";
  if (score >= DEMAND_LEVEL_THRESHOLDS.moderateMin) return "moderate";
  return "low";
}

// ---------- calculateOperatingDemand() ----------
// GARAGE-or-CONTINUE call: same demand score, but weighed against the real
// recent-vs-prior request trend rather than an instantaneous snapshot. This
// is the demand+trend-only base call — roadside-idle escalation (see
// idleEscalated in the handler) is applied as a separate, explicit step
// afterward rather than folded in here, so each concern stays independently
// readable.
function calculateOperatingDemand(
  demandScore: number,
  trendDirection: TrendDirection,
): "continue" | "continue_caution" | "garage" {
  const level = classifyDemandLevel(demandScore);
  if (level === "high") return "continue";
  if (level === "moderate") return "continue_caution";
  // level === "low": still worth continuing a little longer if demand is
  // actually climbing back up, rather than telling a driver to garage right
  // as new riders start showing up.
  return trendDirection === "increasing" ? "continue_caution" : "garage";
}

// ---------- roadside idling ----------
// outside terminal + stationary + past a duration threshold — see
// useRoadsideIdleTracker.js for the client side of this. "none" below
// covers both "not idling" and "no roadside_idle_minutes reported at all"
// (e.g. the terminal WAIT/GO call, which never sends this field).
type IdleStatus = "none" | "monitoring" | "idling" | "prolonged";

function classifyIdleStatus(minutes: number | null): IdleStatus {
  if (minutes === null || minutes < ROADSIDE_MONITOR_MINUTES) return "none";
  if (minutes < ROADSIDE_WARNING_MINUTES) return "monitoring";
  if (minutes < ROADSIDE_PROLONGED_MINUTES) return "idling";
  return "prolonged";
}

// First cluster BEYOND the nearest one that's still strong demand — powers
// "low demand right here, but strong demand N km ahead" redirect copy.
function findFartherStrongCluster(clusters: Cluster[]): Cluster | null {
  return clusters.slice(1).find((c) => c.bandKey === "high_priority" || c.bandKey === "good_demand") ?? null;
}

// ---------- clustering ----------
// Greedy single-linkage grouping: closest-to-driver unclustered passenger
// becomes a cluster seed, then absorbs any other unclustered passenger
// within CLUSTER_RADIUS_METERS of that seed (real haversine on their actual
// fuzzed coordinates, not the scalar distance-from-driver value). Simple and
// deterministic — good enough for a live prototype; swap for a proper
// spatial clustering pass later if routes get denser.
function clusterPassengers(
  rows: ActiveWaitingRow[],
  effectiveDistance: (row: ActiveWaitingRow) => number,
): Cluster[] {
  const remaining = [...rows].sort((a, b) => effectiveDistance(a) - effectiveDistance(b));
  const clusters: Cluster[] = [];

  while (remaining.length) {
    const seed = remaining.shift()!;
    const members = [seed];

    for (let i = remaining.length - 1; i >= 0; i--) {
      if (haversineMeters(seed, remaining[i]) <= CLUSTER_RADIUS_METERS) {
        members.push(remaining[i]);
        remaining.splice(i, 1);
      }
    }

    const centroidLat = members.reduce((sum, m) => sum + m.lat, 0) / members.length;
    const centroidLng = members.reduce((sum, m) => sum + m.lng, 0) / members.length;
    const distanceMeters = Math.min(...members.map(effectiveDistance));

    clusters.push({
      lat: centroidLat,
      lng: centroidLng,
      count: members.length,
      distanceMeters,
      ...classifyBand(distanceMeters / 1000),
    });
  }

  return clusters.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

function classifyBand(km: number): { bandKey: string; bandLabel: string } {
  for (const band of DISTANCE_BANDS) {
    if (km < band.maxKm) return { bandKey: band.key, bandLabel: band.label };
  }
  return { bandKey: FAR_BAND.key, bandLabel: FAR_BAND.label };
}

function haversineMeters(a: LatLng, b: LatLng): number {
  const earthRadius = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

// ---------- trend (real timestamps, no fabricated history) ----------
type TrendDirection = "increasing" | "decreasing" | "stable" | "insufficient_data";

function calculateTrend(
  activityRows: { created_at: string }[],
  windowMinutes: number,
): { direction: TrendDirection; recentCount: number; priorCount: number; changePct: number | null } {
  const recentCutoff = Date.now() - windowMinutes * 60000;
  let recentCount = 0;
  let priorCount = 0;
  for (const row of activityRows) {
    const t = new Date(row.created_at).getTime();
    if (t >= recentCutoff) recentCount++;
    else priorCount++;
  }

  if (recentCount === 0 && priorCount === 0) {
    return { direction: "insufficient_data", recentCount, priorCount, changePct: null };
  }
  if (priorCount === 0) {
    return {
      direction: recentCount > 0 ? "increasing" : "stable",
      recentCount,
      priorCount,
      changePct: null,
    };
  }

  const changePct = round(((recentCount - priorCount) / priorCount) * 100);
  const direction: TrendDirection =
    changePct > TREND_STABLE_BAND_PCT ? "increasing" : changePct < -TREND_STABLE_BAND_PCT ? "decreasing" : "stable";
  return { direction, recentCount, priorCount, changePct };
}

// ---------- confidence (heuristic, not a statistical probability) ----------
// Higher when the score sits far from the GO/WAIT decision boundary (a
// clear-cut case) and when more compatible passengers back up the read (a
// bigger sample). Deliberately NOT presented as a trained model's
// probability — it's a transparent function of the same facts in `reasons`.
function computeConfidence(demandScore: number, compatibleCount: number): number {
  const distanceFromThreshold = Math.abs(demandScore - GO_THRESHOLD);
  let confidence = 55 + Math.min(30, distanceFromThreshold * 0.9);
  confidence += Math.min(12, compatibleCount * 2);
  return Math.round(clamp(confidence, 50, 97));
}

// ---------- time-of-day context (informational only, not scored) ----------
// The PRD asks the AI to "consider the current time," but per its own
// instruction not to invent historical demand-by-hour patterns that don't
// exist yet, this stays a labeled context tag shown alongside the
// real-time-data-driven score — not a scoring factor. Once enough
// created_at history accumulates, a real time-of-day weighting can slot in
// here without changing anything else.
function getTimeContext(now: Date): { bucket: string; label: string } {
  const hour = now.getHours();
  if (hour >= 6 && hour < 9) return { bucket: "morning_commute", label: "Morning commute" };
  if (hour >= 11 && hour < 14) return { bucket: "lunch", label: "Lunch" };
  if (hour >= 14 && hour < 17) return { bucket: "afternoon", label: "Afternoon" };
  if (hour >= 17 && hour < 20) return { bucket: "evening", label: "Evening" };
  if (hour >= 20 || hour < 5) return { bucket: "late_evening", label: "Late evening" };
  return { bucket: "midday", label: "Midday" };
}

// ---------- deterministic "why" bullets ----------
function buildGoWaitReasons(input: {
  compatiblePassengerCount: number;
  nearestCluster: Cluster | null;
  largestClusterSize: number;
  demandLevel: string;
  trend: { direction: TrendDirection; changePct: number | null };
  trendWindowMinutes: number;
}): string[] {
  const reasons: string[] = [];
  const { compatiblePassengerCount, nearestCluster, largestClusterSize, demandLevel, trend, trendWindowMinutes } =
    input;

  reasons.push(
    compatiblePassengerCount === 1
      ? "1 compatible passenger detected along your route"
      : `${compatiblePassengerCount} compatible passengers detected along your route`,
  );

  if (nearestCluster) {
    const km = round(nearestCluster.distanceMeters / 1000);
    reasons.push(
      nearestCluster.count > 1
        ? `Strongest passenger cluster is ${km} km ahead (${nearestCluster.count} passengers, ${nearestCluster.bandLabel})`
        : `Nearest passenger is ${km} km ahead (${nearestCluster.bandLabel})`,
    );
  } else {
    reasons.push("No passenger cluster detected ahead on your route");
  }

  if (largestClusterSize >= 2) {
    reasons.push(`Largest cluster groups ${largestClusterSize} riders in one spot`);
  }

  reasons.push(`Demand level: ${demandLevel.toUpperCase()}`);

  if (trend.direction !== "insufficient_data" && trend.direction !== "stable" && trend.changePct !== null) {
    reasons.push(
      `Demand has ${trend.direction === "increasing" ? "risen" : "dropped"} ${Math.abs(trend.changePct)}% over the last ${trendWindowMinutes} min`,
    );
  }

  return reasons;
}

function buildOperatingReasons(input: {
  compatiblePassengerCount: number;
  demandLevel: string;
  trend: { direction: TrendDirection; changePct: number | null };
  trendWindowMinutes: number;
  operatingRecommendation: string;
  idleEscalated: boolean;
  roadsideIdleMinutes: number | null;
}): string[] {
  const {
    compatiblePassengerCount,
    demandLevel,
    trend,
    trendWindowMinutes,
    operatingRecommendation,
    idleEscalated,
    roadsideIdleMinutes,
  } = input;
  const reasons: string[] = [];

  reasons.push(
    compatiblePassengerCount === 1
      ? "1 compatible passenger currently waiting along your route"
      : `${compatiblePassengerCount} compatible passengers currently waiting along your route`,
  );
  reasons.push(`Current demand level: ${demandLevel.toUpperCase()}`);

  if (trend.direction === "insufficient_data") {
    reasons.push("Not enough recent activity yet to read a trend");
  } else if (trend.direction === "stable") {
    reasons.push(`Demand has stayed roughly flat over the last ${trendWindowMinutes * 2} min`);
  } else if (trend.changePct !== null) {
    reasons.push(
      `Demand has ${trend.direction === "increasing" ? "increased" : "decreased"} ${Math.abs(trend.changePct)}% over the last ${trendWindowMinutes} min`,
    );
  }

  if (idleEscalated) {
    reasons.push(`Stationary roadside for ~${Math.round(roadsideIdleMinutes ?? 0)} min with low demand nearby`);
  } else if (operatingRecommendation === "garage") {
    reasons.push("Demand has stayed low with no sign of recovering");
  }

  return reasons;
}

// ---------- natural-language phrasing (optional Gemini layer) ----------
interface PhrasedCopy {
  goWaitHeadline: string;
  goWaitBody: string;
  operatingHeadline: string;
  operatingBody: string;
  // Only present when roadside idling is actually relevant (see
  // getPhrasedCopy) — undefined otherwise, in which case the handler falls
  // back to roadsideIdleFallback directly.
  roadsideIdleHeadline?: string;
  roadsideIdleBody?: string;
}

function buildFallbackCopy(input: {
  recommendation: "go" | "wait";
  operatingRecommendation: "continue" | "continue_caution" | "garage";
  compatiblePassengerCount: number;
  nearestCluster: Cluster | null;
  demandLevel: string;
  idleEscalated: boolean;
}): PhrasedCopy {
  const { recommendation, operatingRecommendation, compatiblePassengerCount, nearestCluster, demandLevel, idleEscalated } =
    input;

  const goWaitHeadline = recommendation === "go" ? "GO — strong passenger demand ahead" : "WAIT — demand is low right now";
  const goWaitBody =
    recommendation === "go"
      ? `${compatiblePassengerCount} compatible passenger${compatiblePassengerCount === 1 ? "" : "s"} waiting` +
        (nearestCluster ? `, strongest cluster ${round(nearestCluster.distanceMeters / 1000)} km ahead.` : ".")
      : `Only ${compatiblePassengerCount} compatible passenger${compatiblePassengerCount === 1 ? "" : "s"} detected right now. Wait a few minutes and check again.`;

  const operatingHeadlines: Record<string, string> = {
    continue: "CONTINUE OPERATING — demand remains strong",
    continue_caution: "CONTINUE WITH CAUTION — demand is easing",
    garage: "GARAGE — demand has stayed low",
  };
  const operatingBodies: Record<string, string> = {
    continue: `Demand is ${demandLevel.toUpperCase()} with ${compatiblePassengerCount} passengers currently waiting on your route.`,
    continue_caution: `Demand has cooled to ${demandLevel.toUpperCase()}. Worth continuing for now, but keep checking.`,
    garage: idleEscalated
      ? `You've been stationary with low demand nearby for a while — continuing your route may be more worthwhile than waiting here. The final call is yours.`
      : `Demand has stayed low for a while now. You may want to consider heading back — the final call is yours.`,
  };

  return {
    goWaitHeadline,
    goWaitBody,
    operatingHeadline: operatingHeadlines[operatingRecommendation],
    operatingBody: operatingBodies[operatingRecommendation],
  };
}

// ---------- roadside-idle reasons/copy ----------
// Mirrors buildOperatingReasons/buildFallbackCopy's style exactly: plain
// deterministic bullets built from real facts, with an optional Gemini pass
// only phrasing them (see getPhrasedCopy). Never called with status "none"
// in practice (the handler skips straight to a null roadside_idle in that
// case), but returns empty/null gracefully regardless.
function buildRoadsideIdleReasons(input: {
  idleStatus: IdleStatus;
  roadsideIdleMinutes: number | null;
  demandLevel: string;
  idleFuel: FuelRangeEstimate | null;
  fartherStrongCluster: Cluster | null;
}): string[] {
  const { idleStatus, roadsideIdleMinutes, demandLevel, idleFuel, fartherStrongCluster } = input;
  if (idleStatus === "none") return [];

  const minutes = Math.round(roadsideIdleMinutes ?? 0);
  const reasons: string[] = [`Stationary outside the terminal for ~${minutes} min`];
  reasons.push(`Passenger demand nearby: ${demandLevel.toUpperCase()}`);

  if (idleFuel) {
    reasons.push(`Estimated fuel used while idling: ${idleFuel.min_liters}-${idleFuel.max_liters} L (₱${idleFuel.min_cost}-₱${idleFuel.max_cost})`);
  }

  // Farther-cluster redirect only matters when nearby demand is weak —
  // demand is already good right here otherwise, so it adds nothing.
  if (demandLevel === "low" && fartherStrongCluster) {
    reasons.push(`Stronger demand detected ${round(fartherStrongCluster.distanceMeters / 1000)} km ahead along your route`);
  }

  return reasons;
}

function buildRoadsideIdleFallbackCopy(input: {
  idleStatus: IdleStatus;
  roadsideIdleMinutes: number | null;
  demandLevel: string;
  idleFuel: FuelRangeEstimate | null;
  fartherStrongCluster: Cluster | null;
}): { headline: string; body: string } | null {
  const { idleStatus, roadsideIdleMinutes, demandLevel, idleFuel, fartherStrongCluster } = input;
  if (idleStatus === "none") return null;

  const minutes = Math.round(roadsideIdleMinutes ?? 0);

  if (idleStatus === "monitoring") {
    // Deliberately no fuel figure yet — spec asks not to show fuel cost
    // constantly, only once it's actually relevant to a decision.
    return {
      headline: "MONITORING — stationary outside the terminal",
      body: `Vehicle has been stationary for ${minutes} min. Checking passenger demand nearby.`,
    };
  }

  const fuelLine = idleFuel
    ? `Estimated fuel used: ${idleFuel.min_liters}-${idleFuel.max_liters} L (₱${idleFuel.min_cost}-₱${idleFuel.max_cost}).`
    : "";
  const statusLabel = idleStatus === "prolonged" ? "PROLONGED IDLING" : "POTENTIAL IDLING";

  if (demandLevel === "low") {
    const redirect = fartherStrongCluster
      ? ` ${round(fartherStrongCluster.distanceMeters / 1000)} km ahead has stronger demand — continuing may be more worthwhile than waiting here.`
      : " Consider continuing along your route instead of waiting here.";
    return {
      headline: `⚠️ ${statusLabel}`,
      body: `Stationary outside the terminal for ${minutes} min with low passenger demand nearby. ${fuelLine}${redirect} If you need to stay stopped, consider turning off the engine if safe.`.trim(),
    };
  }

  // Moderate/high demand: reassuring, demand-forward — never alarmist, per
  // the spec's explicit "don't warn when demand justifies waiting."
  return {
    headline: "🟢 PASSENGER DEMAND DETECTED",
    body: `You've been stationary for ${minutes} min, but demand nearby is ${demandLevel.toUpperCase()} — waiting briefly may be reasonable. ${fuelLine}`.trim(),
  };
}

async function getPhrasedCopy(input: {
  recommendation: "go" | "wait";
  operatingRecommendation: "continue" | "continue_caution" | "garage";
  demandScore: number;
  demandLevel: string;
  compatiblePassengerCount: number;
  nearestClusterDistanceKm: number | null;
  largestClusterSize: number;
  trend: { direction: TrendDirection; changePct: number | null };
  timeContext: { bucket: string; label: string };
  fallback: PhrasedCopy;
  // null when roadside idling isn't relevant (status "none") — in that case
  // the Gemini request is byte-for-byte identical to before this feature
  // existed: no extra facts, no extra schema fields, no added tokens.
  roadsideIdle: {
    status: IdleStatus;
    minutes: number;
    demandLevel: string;
    fuel: FuelRangeEstimate | null;
    fartherStrongClusterKm: number | null;
  } | null;
  roadsideIdleFallback: { headline: string; body: string } | null;
}): Promise<PhrasedCopy> {
  if (!GEMINI_KEY) return input.fallback;

  const facts: Record<string, unknown> = {
    already_decided_go_wait: input.recommendation,
    already_decided_operating: input.operatingRecommendation,
    demand_score: input.demandScore,
    demand_level: input.demandLevel,
    compatible_passengers: input.compatiblePassengerCount,
    nearest_cluster_km: input.nearestClusterDistanceKm,
    largest_cluster_size: input.largestClusterSize,
    trend_direction: input.trend.direction,
    trend_change_pct: input.trend.changePct,
    time_of_day: input.timeContext.label,
  };

  const hasRoadsideIdle = input.roadsideIdle !== null;
  if (input.roadsideIdle) {
    facts.roadside_idle_status = input.roadsideIdle.status;
    facts.roadside_idle_minutes = input.roadsideIdle.minutes;
    facts.roadside_idle_demand_level = input.roadsideIdle.demandLevel;
    facts.roadside_idle_estimated_fuel_cost_php = input.roadsideIdle.fuel
      ? `${input.roadsideIdle.fuel.min_cost}-${input.roadsideIdle.fuel.max_cost}`
      : null;
    facts.roadside_idle_farther_strong_cluster_km = input.roadsideIdle.fartherStrongClusterKm;
  }

  const properties: Record<string, { type: string }> = {
    go_wait_headline: { type: "STRING" },
    go_wait_body: { type: "STRING" },
    operating_headline: { type: "STRING" },
    operating_body: { type: "STRING" },
  };
  const required = ["go_wait_headline", "go_wait_body", "operating_headline", "operating_body"];
  if (hasRoadsideIdle) {
    properties.roadside_idle_headline = { type: "STRING" };
    properties.roadside_idle_body = { type: "STRING" };
    required.push("roadside_idle_headline", "roadside_idle_body");
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
                "You write short status copy for a jeepney driver app (Sak.AI). You are given ALREADY-DECIDED " +
                "recommendations and the real facts behind them — you must NOT change the recommendation, invent " +
                "numbers, or compute anything. Just phrase the given facts naturally and concisely. " +
                "go_wait_headline/body explain whether to leave the terminal now (already_decided_go_wait). " +
                "operating_headline/body explain whether to keep driving or head back to the garage " +
                "(already_decided_operating) — present it as a suggestion, not a command; the driver decides. " +
                (hasRoadsideIdle
                  ? "roadside_idle_headline/body explain the roadside-idling situation described by the " +
                    "roadside_idle_* facts (the driver is stopped outside the terminal, not queueing) — if " +
                    "demand there is low, gently suggest continuing along the route instead of idling and " +
                    "mention the estimated fuel cost; if demand is moderate/high, be reassuring, not alarming, " +
                    "and note waiting briefly may be reasonable. Never claim to detect the engine directly — " +
                    "the fuel figure is always an estimate. "
                  : "") +
                "Headlines <= 60 characters, bodies <= 140 characters, plain text, no markdown, no exclamation points.",
            }],
          },
          contents: [{ parts: [{ text: `Facts: ${JSON.stringify(facts)}` }] }],
          generationConfig: {
            maxOutputTokens: hasRoadsideIdle ? 420 : 300,
            temperature: 0.3,
            responseMimeType: "application/json",
            responseSchema: { type: "OBJECT", properties, required },
          },
        }),
      },
    );

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error(`getPhrasedCopy: no text in Gemini response (status ${res.status}):`, JSON.stringify(data));
      return input.fallback;
    }

    const parsed = JSON.parse(text);
    if (
      typeof parsed?.go_wait_headline !== "string" ||
      typeof parsed?.go_wait_body !== "string" ||
      typeof parsed?.operating_headline !== "string" ||
      typeof parsed?.operating_body !== "string"
    ) {
      return input.fallback;
    }

    const result: PhrasedCopy = {
      goWaitHeadline: parsed.go_wait_headline,
      goWaitBody: parsed.go_wait_body,
      operatingHeadline: parsed.operating_headline,
      operatingBody: parsed.operating_body,
    };

    if (hasRoadsideIdle) {
      if (typeof parsed?.roadside_idle_headline === "string" && typeof parsed?.roadside_idle_body === "string") {
        result.roadsideIdleHeadline = parsed.roadside_idle_headline;
        result.roadsideIdleBody = parsed.roadside_idle_body;
      } else if (input.roadsideIdleFallback) {
        result.roadsideIdleHeadline = input.roadsideIdleFallback.headline;
        result.roadsideIdleBody = input.roadsideIdleFallback.body;
      }
    }

    return result;
  } catch (err) {
    console.error("getPhrasedCopy: Gemini call threw:", err);
    return input.fallback;
  }
}

// ---------- helpers ----------
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
