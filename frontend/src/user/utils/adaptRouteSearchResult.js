import { COLOR_NAME_TO_HEX } from "../../shared/constants/driverRegistrationFixtures.js";

// The real route-search edge function returns one row per line (no
// transfers, no leg breakdown) — this reshapes that into the fields
// RouteOptionCard/TripResultsPanel already render, rather than redesigning
// those components. transferCount is always 0 and there's always exactly
// one synthetic "jeep" leg, since the backend has no multi-leg concept.

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

function adaptOneRoute(result, { origin, destination }) {
  const accentColor = hexForColorName(result.color);
  const colorName = colorDisplayName(result.color);
  const fare = result.fare ?? result.fare_before_discount ?? 0;
  const now = new Date();
  const arrive = new Date(now.getTime() + result.duration_min * 60000);

  return {
    id: result.route_id,
    accentColor,
    jeepColors: [accentColor],
    title: result.route_name,
    subtitle: `${colorName ? `${colorName} jeep` : "Jeepney"} · Direct route`,
    fare,
    distanceKm: result.distance_km,
    walkMinutes: 0,
    travelMinutes: result.duration_min,
    transferCount: 0,
    leaveTime: formatClockTime(now),
    arriveTime: formatClockTime(arrive),
    availabilityNote: null,
    aiNote: result.explanation ?? null,
    legs: [
      {
        id: "leg-1",
        kind: "jeep",
        color: accentColor,
        jeepColorName: colorName,
        jeepneyLineCode: null,
        title: `${result.route_name} jeepney`,
        subtitle: `Direct · ₱${fare.toFixed(2)}`,
        duration: `${result.duration_min} min`,
      },
    ],
    path: [origin, destination].filter(Boolean),
  };
}

export function adaptRouteSearchResult({ recommended, alternatives }, { origin, destination }) {
  return [recommended, ...(alternatives ?? [])]
    .filter(Boolean)
    .map((result) => adaptOneRoute(result, { origin, destination }));
}
