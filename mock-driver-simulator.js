// mock-driver-simulator.js (v2)
//
// Improvements over v1:
//  - You type the terminal NAME, not its UUID — it's looked up automatically.
//  - The path is no longer hand-typed — it's generated automatically between
//    the terminal's real location and the driver's route terminus, using
//    Google Directions to get a real road-following path.
//
// Run with: node mock-driver-simulator.js
// Requires Node 18+ (native fetch).s

// ---------- CONFIG — fill these in ----------
const SUPABASE_URL = "https://hprgaaynsucaguzlcndd.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcmdhYXluc3VjYWd1emxjbmRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDY4MDUsImV4cCI6MjEwMjYyMjgwNX0.d2lKpZpTUEEcBxmqu1trZuejAgQ4q5icQrpHojgSyCY";
const GOOGLE_MAPS_API_KEY = "AIzaSyCEq0Q9W51KNRfX9x4RExD0TsiPzekee7s"; // needs Directions API enabled

const DRIVER_EMAIL = "ramosjhoven05@gmail.com";
const DRIVER_PASSWORD = "testpass123";

const TERMINAL_NAME = "Terminal A"; // just the name now — no more UUID hunting

const STEP_DELAY_MS = 800; // 800ms per step
const TOGGLE_CAPACITY_EVERY_N_STEPS = 12; // toggles between available/full every ~10-12s
// ---------------------------------------------

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: DRIVER_EMAIL, password: DRIVER_PASSWORD }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Login failed: ${JSON.stringify(data)}`);
  console.log("✅ Logged in as", DRIVER_EMAIL);
  return { accessToken: data.access_token, userId: data.user.id };
}

async function callFunction(name, accessToken, body, { quiet } = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok && !quiet) console.error(`❌ ${name} failed:`, data);
  return data;
}

async function callRpc(fnName, accessToken, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`RPC ${fnName} failed: ${JSON.stringify(data)}`);
  return data;
}

async function getDriverRouteId(accessToken, userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/drivers?id=eq.${userId}&select=route_id`,
    {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
    },
  );
  const data = await res.json();
  if (!data?.[0]?.route_id) {
    throw new Error(
      "This driver has no route_id set — check their `drivers` row in Table Editor.",
    );
  }
  return data[0].route_id;
}

// Decodes a Google Maps encoded polyline string into [{lat,lng}, ...]
function decodePolyline(encoded) {
  let points = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

function haversineDistanceMeters(p1, p2) {
  const earthRadius = 6371000;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1.lat * Math.PI) / 180) *
      Math.cos((p2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

// Densifies road polyline segments so no two consecutive points are more than
// `maxSegmentMeters` apart. This removes all teleportation / popping effects.
function densifyPath(points, maxSegmentMeters = 15) {
  if (!points || points.length === 0) return [];
  const result = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    result.push(p1);

    const dist = haversineDistanceMeters(p1, p2);
    if (dist > maxSegmentMeters) {
      const numSubsteps = Math.ceil(dist / maxSegmentMeters);
      for (let j = 1; j < numSubsteps; j++) {
        const fraction = j / numSubsteps;
        result.push({
          lat: p1.lat + (p2.lat - p1.lat) * fraction,
          lng: p1.lng + (p2.lng - p1.lng) * fraction,
        });
      }
    }
  }

  result.push(points[points.length - 1]);
  return result;
}

async function getRoadPath(origin, destination) {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== "OK") {
    console.warn(
      `⚠️  Directions API returned "${data.status}" — falling back to a straight line between the two points.`,
    );
    return densifyPath([origin, destination], 15);
  }

  const fullPath = decodePolyline(data.routes[0].overview_polyline.points);
  // Densify the full road polyline to ~15 meter increments for continuous, smooth progression
  const smoothPath = densifyPath(fullPath, 15);
  smoothPath.push(destination);
  return smoothPath;
}

async function main() {
  const { accessToken, userId } = await login();

  console.log(`🔎 Looking up terminal "${TERMINAL_NAME}"...`);
  const [terminal] = await callRpc("get_terminal_coords", accessToken, {
    p_name: TERMINAL_NAME,
  });
  if (!terminal) throw new Error(`No terminal found named "${TERMINAL_NAME}"`);
  console.log(`   → found (${terminal.lat}, ${terminal.lng})`);

  const routeId = await getDriverRouteId(accessToken, userId);

  console.log("🔎 Looking up this driver's route terminus...");
  const [terminus] = await callRpc("get_route_terminus_coords", accessToken, {
    p_route_id: routeId,
  });
  if (!terminus) throw new Error("Could not find terminus for this driver's route.");
  console.log(`   → found (${terminus.lat}, ${terminus.lng})`);

  console.log("🚏 Joining queue...");
  const joinResult = await callFunction(
    "driver-queue-join",
    accessToken,
    { terminal_id: terminal.id },
    { quiet: true }
  );
  if (joinResult.error === "driver already has an active queue entry") {
    console.log("   → already queued from a previous run — continuing.");
  } else if (joinResult.error) {
    console.error(`❌ driver-queue-join failed:`, joinResult);
  }

  console.log("🙋 Responding 'lining_up'...");
  const respondResult = await callFunction(
    "driver-queue-respond",
    accessToken,
    { response: "lining_up" },
    { quiet: true }
  );
  if (respondResult.error === "no active queue entry awaiting a response") {
    console.log("   → already past this step (likely already driving) — continuing.");
  } else if (respondResult.error) {
    console.error(`❌ driver-queue-respond failed:`, respondResult);
  }

  console.log("⏭  Triggering queue-advance to promote to 'driving'...");
  await fetch(`${SUPABASE_URL}/functions/v1/queue-advance`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
  });

  console.log("🗺  Fetching a real road path from Google Directions...");
  const path = await getRoadPath(
    { lat: terminal.lat, lng: terminal.lng },
    { lat: terminus.lat, lng: terminus.lng },
  );
  console.log(`   → generated ${path.length} steps automatically\n`);

  console.log("🚐 Starting movement loop — Ctrl+C to stop.\n");
  let capacityState = "available";

  for (let i = 0; i < path.length; i++) {
    const point = path[i];
    const result = await callFunction("driver-location-update", accessToken, {
      lat: point.lat,
      lng: point.lng,
    });

    console.log(
      `📍 Step ${i + 1}/${path.length} → (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`,
      result.end_of_route ? "🏁 END OF ROUTE DETECTED" : "",
    );

    if ((i + 1) % TOGGLE_CAPACITY_EVERY_N_STEPS === 0) {
      capacityState = capacityState === "available" ? "full" : "available";
      await callFunction("driver-capacity-toggle", accessToken, {
        state: capacityState,
      });
      console.log(`   🔁 Capacity toggled → ${capacityState}`);
    }

    await sleep(STEP_DELAY_MS);
  }

  console.log("\n✅ Reached end of generated path.");
}

main().catch((err) => {
  console.error("Simulator crashed:", err);
  process.exit(1);
});