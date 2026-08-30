import { COLOR_NAME_TO_HEX } from "../../shared/constants/driverRegistrationFixtures.js";

// The real route-search edge function now plans a real walk -> ride
// [-> walk -> ride]* -> walk itinerary along the actual route polylines
// (up to 2 transfers), so this just reshapes its `legs` array into the
// fields RouteOptionCard/MapView already render — no more fabricating a
// single fake "jeep" leg per candidate.

function hexForColorName(name) {
  if (!name) return "#2563eb";
  if (name.startsWith("#")) return name; // routes.color can already be a hex value
  return COLOR_NAME_TO_HEX[name.toLowerCase()] ?? "#2563eb";
}

function formatClockTime(date) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function capitalize(word) {
  return word ? `${word[0].toUpperCase()}${word.slice(1)}` : word;
}

// routes.color is sometimes a plain word ("green") and sometimes already a
// hex value ("#50C878") — only usable as display text in the first case.
function colorDisplayName(color) {
  return color && !color.startsWith("#") ? capitalize(color) : null;
}

function adaptLeg(leg, index, allLegs) {
  if (leg.kind === "walk") {
    const nextJeep = allLegs.slice(index + 1).find((l) => l.kind === "jeep");
    const subtitle = nextJeep
      ? `${index === 0 ? "Walk to" : "Transfer to"} ${nextJeep.route_name} jeepney`
      : "Walk to your destination";
    return {
      id: `leg-${index}`,
      kind: "walk",
      title: "Walk",
      subtitle,
      duration: `${Math.round(leg.duration_min)} min`,
    };
  }

  const accentColor = hexForColorName(leg.color);
  const colorName = colorDisplayName(leg.color);
  return {
    id: `leg-${index}`,
    kind: "jeep",
    color: accentColor,
    jeepColorName: colorName,
    jeepneyLineCode: null,
    title: `${leg.route_name} jeepney`,
    subtitle: `₱${leg.fare.toFixed(2)}`,
    duration: `${Math.round(leg.duration_min)} min`,
  };
}

function legPathPoints(leg) {
  if (leg.kind === "walk") return [leg.from, leg.to].filter(Boolean);
  return leg.path?.length ? leg.path : [leg.from, leg.to].filter(Boolean);
}

// `route_id` is only the FIRST route in the itinerary (needed as-is
// downstream — it's the real boarding route's id, used for live GPS
// subscriptions and waiting-state registration on the next page), so two
// different itineraries that happen to start with the same route collide
// on it. This gives list rendering (React keys, expand/collapse state, map
// polylines) something that's actually unique per itinerary instead.
function buildItineraryKey(result) {
  return result.legs
    .filter((leg) => leg.kind === "jeep")
    .map((leg) => leg.route_id)
    .join(">");
}

function adaptOneRoute(result, isRecommended) {
  const jeepLegs = result.legs.filter((leg) => leg.kind === "jeep");
  const walkLegs = result.legs.filter((leg) => leg.kind === "walk");
  const primaryLeg = jeepLegs[0];

  const accentColor = hexForColorName(primaryLeg?.color);
  const colorName = colorDisplayName(primaryLeg?.color);
  const fare = result.fare ?? result.fare_before_discount ?? 0;
  const now = new Date();
  const arrive = new Date(now.getTime() + result.duration_min * 60000);

  const subtitle =
    result.transfer_count > 0
      ? `${result.transfer_count} transfer${result.transfer_count > 1 ? "s" : ""}`
      : `${colorName ? `${colorName} jeep` : "Jeepney"} · Direct route`;

  return {
    id: result.route_id,
    cardKey: buildItineraryKey(result),
    accentColor,
    jeepColors: jeepLegs.map((leg) => hexForColorName(leg.color)),
    title: result.route_name,
    subtitle,
    fare,
    distanceKm: result.distance_km,
    walkMinutes: Math.round(walkLegs.reduce((sum, leg) => sum + leg.duration_min, 0)),
    travelMinutes: Math.round(result.duration_min),
    transferCount: result.transfer_count,
    leaveTime: formatClockTime(now),
    arriveTime: formatClockTime(arrive),
    availabilityNote: null,
    isRecommended,
    aiNote: result.explanation ?? null,
    // Only set on non-best alternatives: why this route wasn't the top
    // pick, with pros/cons computed from real deltas vs the recommended
    // route (see route-search's explainAlternative).
    comparison: result.comparison ?? null,
    legs: result.legs.map((leg, index) => adaptLeg(leg, index, result.legs)),
    path: result.legs.flatMap(legPathPoints),
    // One entry per leg, so the map can draw walk legs as dashed and ride
    // legs as solid instead of one uniform line — see MapView.jsx.
    pathSegments: result.legs.map((leg) => ({ kind: leg.kind, path: legPathPoints(leg) })),
  };
}

export function adaptRouteSearchResult({ recommended, alternatives }) {
  return [recommended, ...(alternatives ?? [])]
    .filter(Boolean)
    .map((result, index) => adaptOneRoute(result, index === 0));
}
