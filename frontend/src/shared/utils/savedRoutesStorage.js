// Local-device "saved routes" (bookmarks) for passengers. schema.sql's
// `bookmarks` table explicitly documents user_id as nullable "if guest/
// local-storage-only path is used app-side" — there's no passenger login
// anywhere in this app yet, so this is that guest path, implemented for
// real rather than left as the frontend-only fixture toggle it was before.
// Swap this for real `bookmarks` table reads/writes once passenger auth
// exists, if cross-device sync is ever needed (see the product spec's own
// "secondary, optional login" framing for that).

const STORAGE_KEY = "caiabe:savedRoutes";
const MAX_SAVED_ROUTES = 20;

function readAll() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(routes) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
  } catch {
    // Private browsing / storage disabled / quota exceeded — saving
    // silently no-ops rather than breaking the rest of the page.
  }
}

export function getSavedRoutes() {
  return readAll();
}

export function isRouteSaved(routeKey) {
  return readAll().some((route) => route.routeKey === routeKey);
}

// routeKey identifies the specific itinerary being saved (route.cardKey ??
// route.id from route-search results) — re-saving the same key updates
// rather than duplicates the entry.
export function saveRoute({ routeKey, label, origin, destination, originPlace, destinationPlace, routeId }) {
  const withoutExisting = readAll().filter((route) => route.routeKey !== routeKey);
  const entry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    routeKey,
    label,
    origin,
    destination,
    originPlace,
    destinationPlace,
    routeId,
    createdAt: new Date().toISOString(),
  };
  writeAll([entry, ...withoutExisting].slice(0, MAX_SAVED_ROUTES));
  return entry;
}

export function removeSavedRouteByKey(routeKey) {
  writeAll(readAll().filter((route) => route.routeKey !== routeKey));
}
