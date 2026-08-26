// mock-fleet-simulator.js
//
// Runs one continuously-looping mock driver PER REAL ROUTE at once (every
// route seeded by caiabe_seed_routes.sql — the ones with an actual polyline
// and a dispatching terminal), so the live map has a moving jeepney on
// every line, not just the single "Florida" driver from
// mock-driver-simulator.js (which this script leaves untouched).
//
// Driver accounts are auto-provisioned (one per route, idempotent — reruns
// reuse the same account) using the service role key, since manually
// registering + approving 10 accounts through the UI would be tedious.
// This is a dev/test tool only — never ship the service role key client-side.
//
// Requires Node 18+ (native fetch) and a `.env` file at the repo root with
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// GOOGLE_MAPS_API_KEY (see .env — gitignored).
//
// Run with: node --env-file=.env mock-fleet-simulator.js

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const GOOGLE_MAPS_API_KEY = requireEnv("GOOGLE_MAPS_API_KEY");

const SIM_DRIVER_PASSWORD = "MockFleet123!";
const STEP_DELAY_MS = 1500;
const TOGGLE_CAPACITY_EVERY_N_STEPS = 5;
const MAX_STEPS = 20;

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

// Idempotent: reruns reuse the same account instead of creating duplicates.
async function ensureMockDriver(route, homeTerminalId) {
  const email = `sim.${slugify(route.name)}@caiabe.test`;

  let session = await signIn(email, SIM_DRIVER_PASSWORD);
  if (!session) {
    await adminCreateUser(email, SIM_DRIVER_PASSWORD);
    session = await signIn(email, SIM_DRIVER_PASSWORD);
  }
  if (!session) throw new Error(`Could not sign in mock driver for route "${route.name}"`);

  await upsertDriverRow({
    id: session.userId,
    routeId: route.id,
    jeepColor: route.color,
    homeTerminalId,
  });

  return session;
}

// ---------- road path (same technique as mock-driver-simulator.js) ----------

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

async function getRoadPath(origin, destination, label) {
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.status !== "OK") {
    console.warn(`[${label}] Directions API returned "${data.status}" — using a straight line.`);
    return [origin, destination];
  }

  const fullPath = decodePolyline(data.routes[0].overview_polyline.points);
  if (fullPath.length <= MAX_STEPS) return [...fullPath, destination];

  const step = fullPath.length / MAX_STEPS;
  const sampled = [];
  for (let i = 0; i < MAX_STEPS; i++) sampled.push(fullPath[Math.floor(i * step)]);
  sampled.push(destination); // guarantee the exact terminus so end-of-route detection fires
  return sampled;
}

// ---------- per-route driving loop ----------

async function driveRoute(route, terminal) {
  const label = route.name;

  const session = await ensureMockDriver(route, terminal.id);
  console.log(`[${label}] driver ready (${session.userId})`);

  const [terminus] = await callRpc("get_route_terminus_coords", { p_route_id: route.id });
  if (!terminus) throw new Error(`[${label}] no terminus found`);

  const forwardPath = await getRoadPath(
    { lat: terminal.lat, lng: terminal.lng },
    { lat: terminus.lat, lng: terminus.lng },
    label,
  );
  const backwardPath = [...forwardPath].reverse();
  console.log(`[${label}] road path ready (${forwardPath.length} steps)`);

  let capacityState = "available";
  let step = 0;

  const driveOnce = async (path, { asDispatch }) => {
    if (asDispatch) {
      await callFunction("driver-queue-join", session.accessToken, { terminal_id: terminal.id }, { quiet: true });
      await callFunction("driver-queue-respond", session.accessToken, { response: "lining_up" }, { quiet: true });
      await fetch(`${SUPABASE_URL}/functions/v1/queue-advance`, {
        method: "POST",
        headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      });
    }

    for (const point of path) {
      await callFunction("driver-location-update", session.accessToken, { lat: point.lat, lng: point.lng });
      step++;
      if (step % TOGGLE_CAPACITY_EVERY_N_STEPS === 0) {
        capacityState = capacityState === "available" ? "full" : "available";
        await callFunction("driver-capacity-toggle", session.accessToken, { state: capacityState });
      }
      await sleep(STEP_DELAY_MS);
    }
  };

  // Loop forever: terminal -> terminus (as a real dispatched trip), then
  // terminus -> terminal (repositioning), repeat. Ctrl+C to stop.
  while (true) {
    await driveOnce(forwardPath, { asDispatch: true });
    console.log(`[${label}] reached terminus, heading back`);
    await driveOnce(backwardPath, { asDispatch: false });
    console.log(`[${label}] back at terminal, starting next lap`);
  }
}

// ---------- main ----------

async function main() {
  console.log("Fetching routes, terminals, and terminal-route assignments...");
  const [routes, terminalRoutes, terminals] = await Promise.all([
    restSelect("routes?select=id,name,color"),
    restSelect("terminal_routes?select=terminal_id,route_id"),
    restSelect("terminals?select=id,name"),
  ]);

  const terminalNameById = new Map(terminals.map((t) => [t.id, t.name]));
  const terminalIdByRoute = new Map(terminalRoutes.map((tr) => [tr.route_id, tr.terminal_id]));

  // Only routes with a real polyline + a dispatching terminal — i.e. the
  // caiabe_seed_routes.sql set, not the old placeholder rows (Florida,
  // Porac, San Fernando) which have no terminal_routes entry. Florida
  // already has its own dedicated simulator (mock-driver-simulator.js).
  const targetRoutes = routes.filter((r) => terminalIdByRoute.has(r.id));
  if (!targetRoutes.length) {
    console.error("No routes with a terminal_routes mapping found — nothing to simulate.");
    process.exit(1);
  }

  console.log(`Simulating ${targetRoutes.length} routes: ${targetRoutes.map((r) => r.name).join(", ")}\n`);

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
        await driveRoute(route, terminal);
      } catch (err) {
        console.error(`[${route.name}] crashed:`, err);
      }
    }),
  );
}

main().catch((err) => {
  console.error("Fleet simulator crashed:", err);
  process.exit(1);
});
