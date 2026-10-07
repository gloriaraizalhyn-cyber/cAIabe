// Lets the demo stage hand the passenger iframe a pre-filled trip.
//
// FindRoutesPage normally receives a trip through react-router location
// state, which an iframe can't be given — it only has a URL. These params
// rebuild the exact same `tripSearch` shape, which has two effects on that
// page: it replays the search on mount, and (because `originPlace` is set)
// it suppresses the geolocation effect that would otherwise overwrite the
// origin with wherever the presenter's laptop actually is. On stage that
// laptop is not in Angeles City, so that suppression is the important half.
//
// Every helper here returns null when the params are absent, so normal app
// behaviour is untouched.

function readNumber(params, key) {
  const raw = params.get(key);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function readDemoTripSearch(search = window.location.search) {
  const params = new URLSearchParams(search);

  const originLabel = params.get("demoFrom");
  const destinationLabel = params.get("demoTo");
  const originLat = readNumber(params, "demoFromLat");
  const originLng = readNumber(params, "demoFromLng");
  const destinationLat = readNumber(params, "demoToLat");
  const destinationLng = readNumber(params, "demoToLng");

  if (
    !originLabel ||
    !destinationLabel ||
    originLat === null ||
    originLng === null ||
    destinationLat === null ||
    destinationLng === null
  ) {
    return null;
  }

  return {
    origin: originLabel,
    destination: destinationLabel,
    originPlace: { label: originLabel, lat: originLat, lng: originLng },
    destinationPlace: { label: destinationLabel, lat: destinationLat, lng: destinationLng },
  };
}

// Which stage pane this page is running in ("passenger" | "driver" | null).
// Captured once at module load — i.e. from the iframe's first URL — because
// in-app navigation (react-router) drops the query string while the iframe
// keeps living, and later pages (/waiting, /driver/driving, …) still need to
// know they are on the stage. The stage's panes have geolocation blocked, so
// those pages use this to run scripted stand-ins for real GPS.
const DEMO_FRAME = new URLSearchParams(window.location.search).get("demoFrame");

export function isDemoDriverFrame() {
  return DEMO_FRAME === "driver";
}

export function isDemoPassengerFrame() {
  return DEMO_FRAME === "passenger";
}

export function readDemoPassengerType(search = window.location.search) {
  return new URLSearchParams(search).get("demoType");
}

// Builds the passenger frame's URL. Mirrors readDemoTripSearch exactly —
// change one, change the other.
export function buildPassengerFrameUrl({ path = "/routes", origin, destination, discountType }) {
  const params = new URLSearchParams({
    demoFrame: "passenger",
    demoFrom: origin.label,
    demoFromLat: String(origin.lat),
    demoFromLng: String(origin.lng),
    demoTo: destination.label,
    demoToLat: String(destination.lat),
    demoToLng: String(destination.lng),
  });
  if (discountType) params.set("demoType", discountType);
  return `${path}?${params.toString()}`;
}
