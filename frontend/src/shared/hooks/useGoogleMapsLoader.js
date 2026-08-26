import { useJsApiLoader } from "@react-google-maps/api";

export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

// Must be a stable reference (module scope, not recreated per render) —
// @react-google-maps/api reloads the script if this array identity changes.
const GOOGLE_MAPS_LIBRARIES = ["places"];

// Multiple components can safely call this — @react-google-maps/api
// deduplicates loads that share the same `id`, so the script and the
// places library only ever load once.
export function useGoogleMapsLoader() {
  return useJsApiLoader({
    id: "caiabe-google-maps-script",
    googleMapsApiKey: GOOGLE_MAPS_API_KEY ?? "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
}
