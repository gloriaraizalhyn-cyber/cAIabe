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

// One map polyline segment per leg, kept separate (rather than flattened
// into one path) so MapView can draw walking legs as a dashed line and each
// jeep leg in its own route color, instead of one solid line the whole way.
function legToMapSegment(leg) {
  return {
    kind: leg.kind,
    color: leg.kind === "jeep" ? hexForColorName(leg.color) : null,
    points: legPathPoints(leg),
  };
}

function adaptOneRoute(result) {
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
    aiNote: result.explanation ?? null,
    legs: result.legs.map((leg, index) => adaptLeg(leg, index, result.legs)),
    mapSegments: result.legs.map(legToMapSegment),
  };
}

export function adaptRouteSearchResult({ recommended, alternatives }) {
  return [recommended, ...(alternatives ?? [])].filter(Boolean).map(adaptOneRoute);
}
