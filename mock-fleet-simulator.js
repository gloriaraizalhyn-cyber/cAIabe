// mock-fleet-simulator.js
//
// Runs multiple continuously-looping mock drivers per route simultaneously,
// with realistic road path densification, spaced out starting offsets, and
// dynamic full/available capacity status toggling.
//
// Usage:
//   node --env-file=.env mock-fleet-simulator.js
//   node --env-file=.env mock-fleet-simulator.js --jeeps=3
//   node --env-file=.env mock-fleet-simulator.js --jeeps=2 --route="Marisol"
//
// Flags:
//   --jeeps=N        Number of jeepneys per route (default: 3)
//   --delay=MS       Delay between steps in ms (default: 800)
//   --route=NAME     Filter to a single route by name (optional)

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const GOOGLE_MAPS_API_KEY = requireEnv("GOOGLE_MAPS_API_KEY");

const SIM_DRIVER_PASSWORD = "MockFleet123!";
const TOGGLE_CAPACITY_EVERY_N_STEPS = 12; // toggles between available/full every ~10-12s

function getCliArg(name, defaultValue) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (arg) return arg.slice(prefix.length);
  return process.env[name.toUpperCase().replace(/-/g, "_")] || defaultValue;
}

const JEEPS_PER_ROUTE = parseInt(getCliArg("jeeps", "3"), 10) || 3;
const STEP_DELAY_MS = parseInt(getCliArg("delay", "800"), 10) || 800;
const ROUTE_FILTER = getCliArg("route", null);

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Run this script with: node --env-file=.env mock-fleet-simulator.js`);
    process.exit(1);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ---------- low-level REST helpers ----------

async function restSelect(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function callRpc(fnName, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`RPC ${fnName} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function callFunction(name, accessToken, body, { quiet } = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok && !quiet) console.error(`[${name}] failed:`, data);
  return data;
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.access_token) return null;
  return { accessToken: data.access_token, userId: data.user.id };
}

async function adminCreateUser(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const data = await res.json();
  if (!res.ok && !data?.msg?.includes("already been registered")) {
    throw new Error(`admin create user failed for ${email}: ${JSON.stringify(data)}`);
  }
}

async function upsertDriverRow({ id, routeId, jeepColor, homeTerminalId }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/drivers`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([
      {
        id,
        route_id: routeId,
        jeep_color: jeepColor,
        home_terminal_id: homeTerminalId,
        verification_status: "approved",
      },
    ]),
  });
  if (!res.ok) throw new Error(`drivers upsert failed: ${res.status} ${await res.text()}`);
}

// Idempotent: reruns reuse the same driver accounts per route index.
async function ensureMockDriver(route, homeTerminalId, driverIndex = 1) {
  const email = `sim.${slugify(route.name)}.${driverIndex}@caiabe.test`;

  let session = await signIn(email, SIM_DRIVER_PASSWORD);
  if (!session) {
    await adminCreateUser(email, SIM_DRIVER_PASSWORD);
    session = await signIn(email, SIM_DRIVER_PASSWORD);
  }
  if (!session) throw new Error(`Could not sign in mock driver #${driverIndex} for route "${route.name}"`);

  await upsertDriverRow({
    id: session.userId,
    routeId: route.id,
    jeepColor: route.color,
    homeTerminalId,
  });

  return session;
}

// ---------- road path & geometry ----------

function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

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

async function getRoadPath(origin, destination, label) {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.status !== "OK") {
    console.warn(`[${label}] Directions API returned "${data.status}" — using a straight line.`);
    return densifyPath([origin, destination], 15);
  }

  const fullPath = decodePolyline(data.routes[0].overview_polyline.points);
  const smoothPath = densifyPath(fullPath, 15);
  smoothPath.push(destination); // guarantee exact terminus coordinate
  return smoothPath;
}

// ---------- driving loop for a single jeepney unit ----------

async function driveSingleJeep(route, terminal, forwardPath, backwardPath, driverIndex, totalJeeps) {
  const session = await ensureMockDriver(route, terminal.id, driverIndex);
  const driverLabel = `${route.name} (Unit #${driverIndex})`;
  console.log(`  🚐 [${driverLabel}] active (${session.userId.slice(0, 8)}…)`);

  const circuit = [...forwardPath, ...backwardPath];
  const circuitLength = circuit.length;

  // Evenly distribute initial positions around the full loop
  const startOffset = Math.floor(((driverIndex - 1) / totalJeeps) * circuitLength);

  // Stagger initial capacity: alternate available and full
  let capacityState = driverIndex % 2 === 1 ? "available" : "full";
  let step = 0;

  // Add slight timing variance (750ms - 850ms) so vehicles drive naturally
  const vehicleDelay = STEP_DELAY_MS + ((driverIndex * 67) % 100) - 50;

  let currentIdx = startOffset;

  while (true) {
    const point = circuit[currentIdx];

    await callFunction(
      "driver-location-update",
      session.accessToken,
      {
        lat: point.lat,
        lng: point.lng,
        capacity_state: capacityState,
      },
      { quiet: true },
    );

    step++;
    if (step % TOGGLE_CAPACITY_EVERY_N_STEPS === 0) {
      capacityState = capacityState === "available" ? "full" : "available";
      await callFunction(
        "driver-capacity-toggle",
        session.accessToken,
        { state: capacityState },
        { quiet: true },
      );
    }

    currentIdx = (currentIdx + 1) % circuitLength;
    await sleep(vehicleDelay);
  }
}

// ---------- per-route fleet orchestrator ----------

async function driveRouteFleet(route, terminal) {
  const label = route.name;

  const [terminus] = await callRpc("get_route_terminus_coords", { p_route_id: route.id });
  if (!terminus) throw new Error(`[${label}] no terminus found`);

  const forwardPath = await getRoadPath(
    { lat: terminal.lat, lng: terminal.lng },
    { lat: terminus.lat, lng: terminus.lng },
    label,
  );
  const backwardPath = [...forwardPath].reverse();
  console.log(`📍 [${label}] Road path computed (${forwardPath.length} steps). Deploying ${JEEPS_PER_ROUTE} units...`);

  const jeepPromises = [];
  for (let i = 1; i <= JEEPS_PER_ROUTE; i++) {
    jeepPromises.push(
      driveSingleJeep(route, terminal, forwardPath, backwardPath, i, JEEPS_PER_ROUTE).catch((err) => {
        console.error(`❌ [${label} Unit #${i}] crashed:`, err);
      }),
    );
  }

  await Promise.all(jeepPromises);
}

// ---------- main ----------

async function main() {
  console.log("==================================================");
  console.log("  cAIabe Multi-Jeepney Fleet Simulator (v3)       ");
  console.log("==================================================");
  console.log(`Jeepneys per route : ${JEEPS_PER_ROUTE}`);
  console.log(`Step delay (ms)    : ${STEP_DELAY_MS}`);
  if (ROUTE_FILTER) console.log(`Route filter       : "${ROUTE_FILTER}"`);
  console.log("Fetching routes and terminals from Supabase...\n");

  const [routes, terminalRoutes, terminals] = await Promise.all([
    restSelect("routes?select=id,name,color"),
    restSelect("terminal_routes?select=terminal_id,route_id"),
    restSelect("terminals?select=id,name"),
  ]);

  const terminalNameById = new Map(terminals.map((t) => [t.id, t.name]));
  const terminalIdByRoute = new Map(terminalRoutes.map((tr) => [tr.route_id, tr.terminal_id]));

  let targetRoutes = routes.filter((r) => terminalIdByRoute.has(r.id));
  if (ROUTE_FILTER) {
    targetRoutes = targetRoutes.filter((r) =>
      r.name.toLowerCase().includes(ROUTE_FILTER.toLowerCase())
    );
  }

  if (!targetRoutes.length) {
    console.error("No matching routes found — check your database or route filter.");
    process.exit(1);
  }

  const totalUnits = targetRoutes.length * JEEPS_PER_ROUTE;
  console.log(`🚀 Simulating ${targetRoutes.length} route(s) with ${JEEPS_PER_ROUTE} jeeps each.`);
  console.log(`🚐 Total active fleet: ${totalUnits} moving vehicles.\n`);

  const terminalCoordsCache = new Map();
  async function getTerminal(routeId) {
    const terminalId = terminalIdByRoute.get(routeId);
    const terminalName = terminalNameById.get(terminalId);
    if (!terminalCoordsCache.has(terminalId)) {
      const [coords] = await callRpc("get_terminal_coords", { p_name: terminalName });
      if (!coords) throw new Error(`No coordinates found for terminal "${terminalName}"`);
      terminalCoordsCache.set(terminalId, coords);
    }
    return terminalCoordsCache.get(terminalId);
  }

  await Promise.all(
    targetRoutes.map(async (route) => {
      try {
        const terminal = await getTerminal(route.id);
        await driveRouteFleet(route, terminal);
      } catch (err) {
        console.error(`❌ [${route.name}] error:`, err);
      }
    }),
  );
}

main().catch((err) => {
  console.error("Fleet simulator fatal error:", err);
  process.exit(1);
});
