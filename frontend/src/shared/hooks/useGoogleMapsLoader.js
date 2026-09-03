import { useJsApiLoader } from "@react-google-maps/api";

const PLACEHOLDER_GOOGLE_MAPS_KEYS = new Set([
  "your-google-maps-javascript-api-key",
  "your-api-key",
  "example",
]);

export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? "";
export const HAS_GOOGLE_MAPS_API_KEY =
  GOOGLE_MAPS_API_KEY.length > 0 &&
  !PLACEHOLDER_GOOGLE_MAPS_KEYS.has(GOOGLE_MAPS_API_KEY.toLowerCase());

if (!HAS_GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY) {
  console.warn(
    "Google Maps API key looks like a placeholder. Replace it in frontend/.env.local with a real Maps JavaScript key."
  );
}

// Must be a stable reference (module scope, not recreated per render) —
// @react-google-maps/api reloads the script if this array identity changes.
const GOOGLE_MAPS_LIBRARIES = ["places"];

// Multiple components can safely call this — @react-google-maps/api
// deduplicates loads that share the same `id`, so the script and the
// places library only ever load once.
export function useGoogleMapsLoader() {
  return useJsApiLoader({
    id: "caiabe-google-maps-script",
    googleMapsApiKey: HAS_GOOGLE_MAPS_API_KEY ? GOOGLE_MAPS_API_KEY : "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
}
