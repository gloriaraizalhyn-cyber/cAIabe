const FALLBACK_ROUTE_COLOR = "#2f6fed";
const WALKING_METERS_PER_MINUTE = 83; // ~5 km/h, matches the backend's estimate

const CLOCK_TIME_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  hour: "numeric",
  minute: "2-digit",
});

// Converts one route-search API result (the `recommended` object, or one
// entry of `alternatives`) into the shape RouteOptionCard expects. The real
// backend only matches single routes (no transfers) and doesn't return a
// leg-by-leg breakdown or route geometry — those come from a richer
// GTFS-style system this project doesn't have yet.
export function mapRouteSearchResultToCardModel(apiRoute, { isBestPick = false } = {}) {
  const accentColor = apiRoute.color || FALLBACK_ROUTE_COLOR;
  const travelMinutes = Math.round(apiRoute.duration_min);

  const now = new Date();
  const arrival = new Date(now.getTime() + apiRoute.duration_min * 60000);

  return {
    id: apiRoute.route_id,
    accentColor,
    jeepColors: [accentColor],
    title: apiRoute.route_name,
    subtitle: `${apiRoute.walk_to_board_meters} m walk to board`,
    fare: apiRoute.fare,
    distanceKm: apiRoute.distance_km,
    walkMinutes: Math.round(
      (apiRoute.walk_to_board_meters + apiRoute.walk_from_alight_meters) / WALKING_METERS_PER_MINUTE
    ),
    travelMinutes,
    transferCount: 0,
    leaveTime: CLOCK_TIME_FORMATTER.format(now),
    arriveTime: CLOCK_TIME_FORMATTER.format(arrival),
    availabilityNote: null,
    aiNote: isBestPick ? apiRoute.explanation ?? null : null,
    legs: [],
    walkToBoardMeters: apiRoute.walk_to_board_meters,
    walkFromAlightMeters: apiRoute.walk_from_alight_meters,
  };
}
