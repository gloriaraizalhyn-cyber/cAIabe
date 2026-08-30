// mock-passenger-simulator.js
//
// Hackathon demo mode for Sak.AI's driver-side AI (driver-demand-check).
// Places realistic passenger demand clusters along a real route — using the
// SAME passenger-facing "waiting-start" edge function a real passenger's
// phone calls, so it's genuinely the same data path the driver AI reads
// from (passenger_waiting_state), not a separate faked dataset. Clusters
// are positioned using the route's real stored polyline (routes.path) via
// the get_route_point_at_distance RPC, and each individual passenger within
// a cluster gets waiting-start's own server-side GPS fuzzing (80-150m),
// which is what naturally spreads them out around the cluster point.
//
// Run with an interactive terminal so you can drive the demo live:
//   node --env-file=.env mock-passenger-simulator.js --route="Florida"
//   node --env-file=.env mock-passenger-simulator.js --route="Florida" --clusters="8@1.2,5@2.5,2@4"
//
// Once running, type commands + Enter:
//   surge                 Re-place the configured clusters (simulates a wave of new riders)
//   surge 10@0.5           One-off cluster: 10 passengers, 0.5 km ahead
//   clear                 Clear ALL currently-tracked waiting passengers (simulates them boarding/leaving)
//   clear half             Clear roughly half of them (partial drop-off)
//   list                   Show current tracked waiting-passenger count
//
// This is what lets a driver's screen visibly flip GO -> WAIT -> GARAGE
// live during a demo: "surge" pushes demand up, "clear" brings it back down,
// and driver-demand-check recomputes on the very next broadcast/poll.

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");

function getCliArg(name, defaultValue) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (arg) return arg.slice(prefix.length);
  return process.env[name.toUpperCase().replace(/-/g, "_")] || defaultValue;
}

const ROUTE_NAME = getCliArg("route", null);
const DEFAULT_CLUSTERS_SPEC = getCliArg("clusters", "8@1.2,5@2.5,2@4");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Run this script with: node --env-file=.env mock-passenger-simulator.js`);
    process.exit(1);
  }
  return value;
}

// ---------- low-level REST helpers (same conventions as mock-fleet-simulator.js) ----------

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

// waiting-start/waiting-clear are the exact functions a passenger's phone
// calls, with no user login — same as the real WaitingForJeepPage flow, just
// authenticated as the anon key instead of a signed-in session.
async function callPublicFunction(name, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) console.error(`[${name}] failed:`, data);
  return data;
}

// ---------- cluster spec parsing ----------

// "8@1.2,5@2.5,2@4" -> [{ count: 8, km: 1.2 }, { count: 5, km: 2.5 }, { count: 2, km: 4 }]
function parseClustersSpec(spec) {
  return spec
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [countStr, kmStr] = part.split("@");
      const count = parseInt(countStr, 10);
      const km = parseFloat(kmStr);
      if (!Number.isFinite(count) || !Number.isFinite(km)) {
        throw new Error(`Invalid cluster spec segment "${part}" — expected "<count>@<km>"`);
      }
      return { count, km };
    });
}

// ---------- demo state ----------

// Tracks every waiting_id this simulator has created and not yet cleared,
// per route, so "clear"/"clear half" have something real to act on.
const activeWaitingIds = [];

async function placeCluster(routeId, label, count, km) {
  const points = await callRpc("get_route_point_at_distance", {
    p_route_id: routeId,
    p_distance_meters: km * 1000,
  });
  const point = points?.[0];
  if (!point) {
    console.warn(`⚠️  Could not resolve a point ${km} km along this route (no stored path?) — skipping ${label}.`);
    return;
  }

  console.log(`👥 Placing ${label}: ${count} passenger(s) ~${km} km ahead...`);
  for (let i = 0; i < count; i++) {
    const result = await callPublicFunction("waiting-start", {
      route_id: routeId,
      lat: point.lat,
      lng: point.lng,
      discount_type: "regular",
    });
    if (result?.waiting_id) activeWaitingIds.push(result.waiting_id);
  }
}

async function surge(routeId, spec) {
  const clusters = parseClustersSpec(spec);
  const labels = ["Cluster A", "Cluster B", "Cluster C", "Cluster D", "Cluster E"];
  for (let i = 0; i < clusters.length; i++) {
    await placeCluster(routeId, labels[i] ?? `Cluster ${i + 1}`, clusters[i].count, clusters[i].km);
  }
  console.log(`✅ Surge complete — ${activeWaitingIds.length} passenger(s) currently tracked as waiting.\n`);
}

async function clearWaiting(mode) {
  if (!activeWaitingIds.length) {
    console.log("(no tracked waiting passengers to clear)");
    return;
  }

  const howMany = mode === "half" ? Math.ceil(activeWaitingIds.length / 2) : activeWaitingIds.length;
  console.log(`🧹 Clearing ${howMany} of ${activeWaitingIds.length} tracked passenger(s)...`);

  for (let i = 0; i < howMany; i++) {
    const waitingId = activeWaitingIds.shift();
    await callPublicFunction("waiting-clear", { waiting_id: waitingId });
  }
  console.log(`✅ Done — ${activeWaitingIds.length} passenger(s) still tracked as waiting.\n`);
}

// ---------- interactive controls ----------

function setupDemoControls(routeId) {
  if (!process.stdin.isTTY) return; // non-interactive run — just do the initial surge and exit
  console.log('\nDemo controls: "surge", "surge <count>@<km>", "clear", "clear half", "list", then Enter.\n');

  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      if (trimmed === "list") {
        console.log(`${activeWaitingIds.length} passenger(s) currently tracked as waiting.`);
        return;
      }
      if (trimmed === "clear" || trimmed === "clear half") {
        await clearWaiting(trimmed === "clear half" ? "half" : "all");
        return;
      }
      if (trimmed === "surge") {
        await surge(routeId, DEFAULT_CLUSTERS_SPEC);
        return;
      }
      const surgeMatch = trimmed.match(/^surge\s+(.+)$/i);
      if (surgeMatch) {
        await surge(routeId, surgeMatch[1]);
        return;
      }
      console.log('Unrecognized command. Use "surge", "surge <count>@<km>", "clear", "clear half", or "list".');
    } catch (err) {
      console.error("Command failed:", err.message ?? err);
    }
  });
}

// ---------- main ----------

async function main() {
  console.log("==================================================");
  console.log("  cAIabe Passenger Demand Simulator                ");
  console.log("==================================================");
  if (!ROUTE_NAME) {
    console.error('Missing --route="<name>". Example: --route="Florida"');
    process.exit(1);
  }

  const routes = await restSelect(`routes?name=eq.${encodeURIComponent(ROUTE_NAME)}&select=id,name`);
  const route = routes?.[0];
  if (!route) {
    console.error(`No route named "${ROUTE_NAME}" found.`);
    process.exit(1);
  }

  console.log(`Route              : ${route.name}`);
  console.log(`Default clusters   : ${DEFAULT_CLUSTERS_SPEC}\n`);

  setupDemoControls(route.id);
  await surge(route.id, DEFAULT_CLUSTERS_SPEC);

  if (!process.stdin.isTTY) {
    console.log("Non-interactive run — placed the initial surge and exiting.");
    console.log("Re-run in an interactive terminal to drive the demo live (surge/clear/list).");
  }
}

main().catch((err) => {
  console.error("Passenger simulator fatal error:", err);
  process.exit(1);
});
