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
//   node --env-file=.env mock-fleet-simulator.js --jeeps=3 --requeue
//
// Flags:
//   --jeeps=N        Number of jeepneys per route (default: 3)
//   --delay=MS       Delay between steps in ms (default: 5000)
//   --route=NAME     Filter to a single route by name (optional)
//   --requeue        Accepted for backwards compatibility; now a no-op.
//                     Units ALWAYS rejoin the queue on reaching the route's
//                     terminus. The old default (keep driving instead) was
//                     based on a wrong assumption: driver-location-update
//                     flips the unit back to "waiting" the moment it passes
//                     the terminus, and both the realtime broadcast gate and
//                     get_route_visible_drivers hide anything that isn't
//                     next_to_go/driving — so "keep driving" actually meant
//                     "keep driving where no passenger can see you". Staggered
//                     start offsets are what keep units continuously visible.

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
// Location updates fan out through the Edge Function, queue lookups, geofence
// RPCs, and realtime broadcasts. Five seconds is enough for a convincing demo
// without turning the simulator into a high-volume database workload.
const STEP_DELAY_MS = parseInt(getCliArg("delay", "5000"), 10) || 5000;
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

// Same as restSelect, but authenticated as a specific unit's own driver
// session rather than the anon key — needed for reading queue_entries,
// whose RLS policy scopes reads to the caller's own route.
async function restSelectAuthed(path, accessToken) {
  const doFetch = () =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${liveToken(accessToken)}` },
    });
  let res = await doFetch();
  if (res.status === 401 && (await refreshSession(accessToken))) res = await doFetch();
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Updates the caller's own rows (drivers may update their own queue entry
// under RLS), authenticated as that unit's driver session.
async function restPatchAuthed(path, accessToken, body) {
  const doFetch = () =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: "PATCH",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${liveToken(accessToken)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  let res = await doFetch();
  if (res.status === 401 && (await refreshSession(accessToken))) res = await doFetch();
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status} ${await res.text()}`);
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
  const doFetch = () =>
    fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${liveToken(accessToken)}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  let res = await doFetch();
  if (res.status === 401 && (await refreshSession(accessToken))) res = await doFetch();

  // A gateway hiccup (cold start, brief outage, rate limit) can return an
  // HTML error page instead of JSON. Every unit's road/queue loop calls
  // this every few seconds forever, so a single bad response must NOT throw
  // here — that would permanently kill that unit's simulation (nothing
  // upstream retries a crashed loop, it just dies silently into the
  // fleet-level .catch()).
  const rawText = await res.text();
  let data;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { error: `non-JSON response (HTTP ${res.status}): ${rawText.slice(0, 200)}` };
  }

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
  const session = { accessToken: data.access_token, refreshToken: data.refresh_token, userId: data.user.id };
  sessionsByToken.set(session.accessToken, session);
  return session;
}

// Access tokens last about an hour, but every unit's loop runs for as long as
// the demo does and passes the token around as a plain string. Every token
// ever issued maps back to its session, so a stale copy still resolves to the
// live token, and a 401 triggers one refresh + retry (see callFunction /
// restSelectAuthed) instead of the unit crashing with "JWT expired".
const sessionsByToken = new Map();

function liveToken(token) {
  return sessionsByToken.get(token)?.accessToken ?? token;
}

async function refreshSession(token) {
  const session = sessionsByToken.get(token);
  if (!session?.refreshToken) return false;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  const data = await res.json();
  if (!data.access_token) return false;
  session.accessToken = data.access_token;
  session.refreshToken = data.refresh_token ?? session.refreshToken;
  sessionsByToken.set(session.accessToken, session);
  return true;
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

// Builds the circuit a unit drives from the route's OWN stored polyline
// (routes.path, via get_route_subpath_points over the whole 0..1 span)
// rather than a Google Directions path between the terminal and the
// terminus, which is what this used to do. Two reasons:
//
//  1) Most seeded routes are loops whose terminal and terminus nearly
//     coincide, so the old approach produced a stub instead of a route:
//     "Checkpoint - Holy Angel University - Balibago" has 290m between them
//     against a 10,530m real path, and "Pampang - SM Telabastagan" has 3m
//     against 4,815m. Units shuttled on the spot.
//  2) routes.path is the hand-verified geometry — see fix_balibago_route.sql,
//     which replaced a path that deviated from the real road by up to ~2.8km.
//     Following it is strictly more accurate than re-deriving one, and it
//     drops a paid Directions call from the demo's hot path.
//
// Returns { circuit, isLoop }. A closed route cycles forward forever (going
// back along it would drive units the wrong way down a one-way loop); an
// open route still runs out-and-back the way it always did.
const LOOP_CLOSE_METERS = 60;

async function getRouteCircuit(route, terminal, label) {
  const stored = await callRpc("get_route_subpath_points", {
    p_route_id: route.id,
    p_fraction_a: 0,
    p_fraction_b: 1,
  });

  if (Array.isArray(stored) && stored.length >= 2) {
    const path = densifyPath(stored, 15);
    const isLoop = haversineDistanceMeters(path[0], path[path.length - 1]) <= LOOP_CLOSE_METERS;
    const circuit = isLoop ? path : [...path, ...[...path].reverse()];
    console.log(
      `📍 [${label}] Using stored route path — ${stored.length} pts → ${circuit.length} steps ` +
        `(${isLoop ? "closed loop" : "out-and-back"}).`,
    );
    return { circuit, isLoop };
  }

  // No stored polyline — the pathless Florida/Porac/San Fernando rows from
  // schema.sql. Fall back to the original terminal→terminus Directions path
  // so those keep behaving exactly as before.
  console.warn(`[${label}] No stored routes.path — falling back to a Directions path from the terminal.`);
  const [terminus] = await callRpc("get_route_terminus_coords", { p_route_id: route.id });
  if (!terminus) throw new Error(`[${label}] no stored path and no terminus found`);
  const forward = await getRoadPath(
    { lat: terminal.lat, lng: terminal.lng },
    { lat: terminus.lat, lng: terminus.lng },
    label,
  );
  return { circuit: [...forward, ...[...forward].reverse()], isLoop: false };
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

// ---------- live demo controls (triggered from stdin, see setupDemoControls) ----------
//
// Keyed by the same label printed next to each unit at startup
// ("<route name> (Unit #N)") so the presenter can target one by name during
// a live demo instead of editing code. Slowing a unit is a REAL change —
// it jumps the unit backward along its road path (so the next live GPS
// broadcast is genuinely farther from any waiting passenger) and multiplies
// its step delay, so every AI recommendation that reads live position
// (nearby-jeepney-eta) reacts to real, changed data rather than a faked
// label.
const activeUnits = new Map();

// The single implementation behind BOTH presenter surfaces: the stdin
// commands below, and the /demo/stage presenter bar (which reaches this
// process through the demo_commands table — see pollDemoCommands). Keeping
// one implementation means the stage can't drift into faking something the
// typed command does for real.
//
// `target` matches on the driver id (as shown by "list" and in the app's own
// queue screen — same id, that's the point) OR the unit label, so either
// works no matter which view you're looking at. "all" hits every active unit.
async function applyDemoAction(action, target, payload = {}) {
  const needle = String(target ?? "").trim().toLowerCase();
  if (!needle) return 0;

  const matches =
    needle === "all"
      ? [...activeUnits.entries()]
      : [...activeUnits.entries()].filter(
          ([label, state]) =>
            state.driverId.toLowerCase().includes(needle) || label.toLowerCase().includes(needle)
        );

  if (!matches.length) {
    console.log(`No active unit matches "${target}". Try "list" to see active units.`);
    return 0;
  }

  for (const [label, state] of matches) {
    const tag = `${state.driverId.slice(0, 8)} (${label})`;
    if (action === "slow") {
      state.delayMultiplier = 6;
      state.jumpBackRequested = true;
      console.log(`🐢 [${tag}] simulating heavy traffic — jumped back on its path and slowed down.`);
    } else if (action === "resume") {
      // `multiplier` < 1 fast-forwards (the passenger demo's "demo speed"
      // control sends 1/8 for x8); `capacity` pins the unit's seats open/full
      // until the next resume without one. Sent through the existing "resume"
      // type because demo_commands only accepts a fixed list of types.
      const multiplier = Number(payload.multiplier);
      state.delayMultiplier = multiplier > 0 ? multiplier : 1;
      state.lockCapacity = payload.capacity === "available" || payload.capacity === "full" ? payload.capacity : null;
      console.log(
        state.delayMultiplier === 1 && !state.lockCapacity
          ? `✅ [${tag}] back to normal speed.`
          : `⏩ [${tag}] speed x${(1 / state.delayMultiplier).toFixed(1)}${state.lockCapacity ? `, seats pinned ${state.lockCapacity}` : ""}.`,
      );
    } else if (action === "leave") {
      // ~300m from the terminal — comfortably past the default 130m exit
      // radius, so the next driver-location-update reports "outside".
      state.awayOverride = { lat: state.terminalPosition.lat + 0.0027, lng: state.terminalPosition.lng };
      console.log(`🚶 [${tag}] stepped away from the terminal — still holds its queue slot.`);
    } else if (action === "return") {
      state.awayOverride = null;
      console.log(`🏠 [${tag}] heading back to the terminal.`);
    } else if (action === "lining_up") {
      await callFunction("driver-queue-respond", state.accessToken, { response: "lining_up" }, { quiet: true });
      console.log(`🙋 [${tag}] responded "lining up" — keeps its FIFO spot, must return to be dispatched.`);
    } else if (action === "skip_temp") {
      await callFunction("driver-queue-respond", state.accessToken, { response: "skip_temp" }, { quiet: true });
      console.log(`⏸️  [${tag}] responded "leave temporarily" — queue moves on without it.`);
    } else if (action === "skip_done") {
      await callFunction("driver-queue-respond", state.accessToken, { response: "skip_done" }, { quiet: true });
      console.log(`🌙 [${tag}] responded "done for the day" — queue session ended.`);
    }
  }

  return matches.length;
}

async function setupDemoControls() {
  if (!process.stdin.isTTY) return; // no interactive terminal (e.g. piped/background run) — skip
  console.log('\nDemo controls (type a command + Enter):');
  console.log('  slow / resume <driver id>   simulate heavy traffic on a driving unit');
  console.log('  leave <driver id>           step a queued unit away from the terminal (keeps its slot)');
  console.log('  return <driver id>          bring a queued unit back to the terminal');
  console.log('  lining_up <driver id>       respond "lining up" to that unit\'s turn prompt');
  console.log('  skip_temp <driver id>       respond "leave temporarily" (forfeits current turn)');
  console.log('  skip_done <driver id>       respond "done for the day" (ends that unit\'s queue session)');
  console.log('  list                        show active units (label + driver id)');
  console.log('<driver id> is the short id shown in "list" below AND in the app\'s own queue');
  console.log('screen ("Driver ca577a15") — the two are the same id, so whichever you\'re looking');
  console.log('at, that\'s what you type here. A unit label (e.g. "(Unit #1)") also still works.');
  console.log('Example: leave ca577a15');
  console.log('Typical "away → skip → return" demo sequence for one unit: leave, skip_temp, (wait), return\n');

  // Dynamic import (not require) so this works whether Node parses this
  // file as CommonJS or ESM — module type is decided by the nearest
  // package.json anywhere up the directory tree, which this repo doesn't
  // control (e.g. an unrelated "type": "module" package.json elsewhere on
  // a machine's home folder would otherwise break a plain require() here).
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed === "list") {
      if (!activeUnits.size) {
        console.log("(no active units yet)");
        return;
      }
      for (const [label, state] of activeUnits.entries()) {
        console.log(`  - ${state.driverId.slice(0, 8)}  (${label})`);
      }
      return;
    }

    const parsed = trimmed.match(
      /^(slow|resume|leave|return|lining_up|skip_temp|skip_done)\s+(.+)$/i
    );

    if (!parsed) {
      console.log(
        'Unrecognized command. Use "slow/resume/leave/return/lining_up/skip_temp/skip_done <driver id>", or "list".'
      );
      return;
    }

    await applyDemoAction(parsed[1].toLowerCase(), parsed[2]);
  });
}

// ---------- demo_commands bridge (drives the /demo/stage presenter bar) ----------
//
// The stage's presenter bar runs in a browser, but two of its levers can't:
// "throw traffic at a unit" has to move a driver, which only the process
// holding that driver's session can do, and "send the demo SMS" has to sign
// an HMAC with TEXTBEE_WEBHOOK_SECRET, which must never ship to a client.
// Both are enqueued into demo_commands (see supabase/sql/add_demo_control.sql)
// and consumed here. Every other lever on the stage — surge, clear, capacity
// toggle — calls its edge function directly and never comes through here.
const DEMO_COMMAND_POLL_MS = 1000;

async function restService(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Posts a message to sms-webhook exactly the way TextBee really does: a flat
// {webhookEvent, sender, message} body, with a lowercase hex HMAC-SHA256 of
// the RAW body in X-Signature. The body string is signed and sent byte-for-byte
// identical — re-serializing between signing and sending would change the
// bytes and fail verification.
async function sendDemoSms({ from, text }) {
  const secret = process.env.TEXTBEE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("⚠️  TEXTBEE_WEBHOOK_SECRET is not set — sms-webhook will reject this with a 401.");
    return;
  }

  const { createHmac } = await import("node:crypto");
  const rawBody = JSON.stringify({
    webhookEvent: "MESSAGE_RECEIVED",
    sender: from,
    message: text,
  });
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/sms-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Signature": signature },
    body: rawBody,
  });
  console.log(
    res.ok
      ? `📱 [SMS] delivered "${text}" from ${from} (HTTP ${res.status}) — reply lands in sms_log.`
      : `❌ [SMS] sms-webhook returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`,
  );
}

async function handleDemoCommand(row) {
  const payload = row.payload ?? {};
  if (row.type === "send_sms") {
    await sendDemoSms({ from: payload.from, text: payload.text });
    return;
  }
  await applyDemoAction(row.type, payload.target, payload);
}

async function pollDemoCommands() {
  console.log("🎛️  Listening for /demo/stage presenter commands (demo_commands table).\n");

  while (true) {
    try {
      const rows = await restService(
        "demo_commands?consumed_at=is.null&order=created_at.asc&limit=10&select=id,type,payload",
      );

      for (const row of rows ?? []) {
        // Mark consumed FIRST: a command that throws must not be retried on
        // every poll forever, which would wedge the queue mid-demo.
        await restService(`demo_commands?id=eq.${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({ consumed_at: new Date().toISOString() }),
        });

        try {
          await handleDemoCommand(row);
        } catch (err) {
          console.error(`demo command ${row.type} failed:`, err.message ?? err);
        }
      }
    } catch (err) {
      // The table may not exist yet (add_demo_control.sql not run). Warn once
      // and keep the fleet driving — the stage's other levers still work.
      if (!pollDemoCommands.warned) {
        console.warn(`⚠️  demo_commands poll failed (${err.message ?? err}). Have you run supabase/sql/add_demo_control.sql?`);
        pollDemoCommands.warned = true;
      }
    }

    await sleep(DEMO_COMMAND_POLL_MS);
  }
}

// ---------- queueing phase (runs before a unit starts road-looping) ----------
//
// Joins the real terminal queue — the same driver-queue-join a real driver's
// phone calls — then reports position every QUEUE_POLL_DELAY_MS (terminal
// coords by default, or the demo-controlled "away" override) until this
// unit's own queue_entries row reaches 'driving'. This is what makes
// "leave/return/lining_up/skip_temp/skip_done <unit>" meaningful in
// setupDemoControls: they mutate real DB state via the exact same edge
// functions a real driver's app calls, not a faked label.
const QUEUE_POLL_DELAY_MS = 3000;

async function driveThroughQueue(driverLabel, session, demoState) {
  await callFunction(
    "driver-queue-join",
    session.accessToken,
    { terminal_id: demoState.terminalId },
    { quiet: true },
  );

  const readEntry = async () =>
    (
      await restSelectAuthed(
        `queue_entries?driver_id=eq.${session.userId}` +
          `&status=in.(waiting,next_to_go,driving)` +
          `&select=id,status,notified_at,responded_at,geofence_status&order=arrival_at.desc&limit=1`,
        session.accessToken,
      )
    )?.[0];

  let hasReportedPosition = false;

  while (true) {
    // Status first, position second. Another unit's dispatch tick can promote
    // this one at any moment, and a driving unit that then reports the
    // terminal's coordinates is treated as having finished its trip when the
    // terminal doubles as the route's end point (the grey route's does) — it
    // would be requeued straight away, forever. So never report the terminal
    // position for a unit that is already dispatched.
    let entry = await readEntry();

    if (entry?.status === "driving") {
      console.log(`  🚦 [${driverLabel}] dispatched — starting road loop.`);
      return;
    }

    // Report the terminal (or the demo-controlled "away" spot) only when it
    // changes something: first report, an away override, or the geofence
    // status not yet confirmed inside. Steady-state repeats added nothing but
    // egress and that end-of-route race.
    if (!hasReportedPosition || demoState.awayOverride || entry?.geofence_status !== "inside") {
      const pos = demoState.awayOverride ?? demoState.terminalPosition;
      await callFunction(
        "driver-location-update",
        session.accessToken,
        { lat: pos.lat, lng: pos.lng },
        { quiet: true },
      );
      hasReportedPosition = true;
      entry = (await readEntry()) ?? entry;
      if (entry?.status === "driving") {
        console.log(`  🚦 [${driverLabel}] dispatched — starting road loop.`);
        return;
      }
    }

    // queue-advance only dispatches a unit whose geofence_status is "inside".
    // The backend normally maintains that from driver-location-update, but its
    // geofence check can be switched off (GEOFENCE_ENABLED, an egress guard),
    // which would leave every simulated unit stuck at the terminal forever.
    // These units ARE reporting the terminal's coordinates, so state it
    // directly — except while a demo "leave" has deliberately moved one away.
    if (entry && entry.geofence_status !== "inside" && !demoState.awayOverride) {
      await restPatchAuthed(`queue_entries?id=eq.${entry.id}`, session.accessToken, {
        geofence_status: "inside",
        last_inside_at: new Date().toISOString(),
      }).catch(() => {});
    }

    // Lined up and ready (or waiting to be notified): run the dispatch tick
    // ourselves — queue-advance is the exact function the pg_cron job calls,
    // and the "Skip wait" button on the driver app invokes it the same way.
    // Keeps the demo moving even when the cron job is paused or disabled.
    // Re-read straight after: a unit promoted here must be recognised as
    // dispatched BEFORE the next loop reports the terminal's coordinates
    // again, because a driving unit at a terminal that doubles as its route's
    // end point is (correctly) treated as having finished and is requeued.
    const needsTick =
      entry?.status === "next_to_go" || (entry?.status === "waiting" && !entry.notified_at);
    if (needsTick && !demoState.awayOverride) {
      await callFunction("queue-advance", session.accessToken, {}, { quiet: true });
      entry = await readEntry();
      if (entry?.status === "driving") {
        console.log(`  🚦 [${driverLabel}] dispatched — starting road loop.`);
        return;
      }
    }

    // Answer the turn prompt the way a real driver does by tapping "Lining
    // up" in QueueTurnAlert. Without this a unit never leaves the terminal:
    // queue-advance only ever promotes next_to_go -> driving, and the only
    // way into next_to_go is driver-queue-respond, so an unanswered unit
    // just cycles between notified and the 90s soft-skip forever.
    //
    // Skipped while a unit is deliberately "away" (the leave/skip_temp demo
    // sequence), so that still plays out exactly as scripted.
    if (
      entry?.status === "waiting" &&
      entry.notified_at &&
      !entry.responded_at &&
      !demoState.awayOverride
    ) {
      await callFunction("driver-queue-respond", session.accessToken, { response: "lining_up" }, { quiet: true });
      console.log(`  🙋 [${driverLabel}] its turn came up — lining up.`);
    }

    await sleep(QUEUE_POLL_DELAY_MS);
  }
}

// ---------- driving loop for a single jeepney unit ----------

// End-of-route guard (see the loop in driveSingleJeep): the server's own
// radius is 100 m; the last 1.5% of the circuit (~150 m on a ~10 km loop) is
// where a genuine finish happens.
const END_OF_ROUTE_GUARD_METERS = 105;
const END_OF_ROUTE_ZONE_FRACTION = 0.985;

function haversineMeters(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function driveSingleJeep(route, terminal, circuit, driverIndex, totalJeeps) {
  const session = await ensureMockDriver(route, terminal.id, driverIndex);
  const driverLabel = `${route.name} (Unit #${driverIndex})`;
  console.log(`  🚐 [${driverLabel}] active (${session.userId.slice(0, 8)}…)`);

  const circuitLength = circuit.length;

  // Evenly distribute initial positions around the full loop, offset by half
  // a slot so no unit starts ON index 0. On a closed route index 0 IS the
  // terminus, and starting there trips is_near_terminus on the very first
  // location update — the unit would be requeued before it had moved.
  const startOffset = Math.floor(((driverIndex - 0.5) / totalJeeps) * circuitLength);

  // Stagger initial capacity: alternate available and full
  let capacityState = driverIndex % 2 === 1 ? "available" : "full";
  let step = 0;

  // Add slight timing variance (750ms - 850ms) so vehicles drive naturally
  const baseVehicleDelay = STEP_DELAY_MS + ((driverIndex * 67) % 100) - 50;

  let currentIdx = startOffset;

  const demoState = {
    delayMultiplier: 1,
    lockCapacity: null, // "available" | "full" while pinned by the passenger demo
    jumpBackRequested: false,
    accessToken: session.accessToken,
    driverId: session.userId,
    terminalId: terminal.id,
    terminalPosition: { lat: terminal.lat, lng: terminal.lng },
    awayOverride: null, // set by "leave <unit>", cleared by "return <unit>"
  };
  activeUnits.set(driverLabel, demoState);

  do {
    await driveThroughQueue(driverLabel, session, demoState);

    while (true) {
      if (demoState.jumpBackRequested) {
        // Jump back a third of the loop so the next broadcast position is
        // genuinely farther from wherever this unit already was.
        currentIdx = (currentIdx - Math.floor(circuitLength / 3) + circuitLength) % circuitLength;
        demoState.jumpBackRequested = false;
      }

      const point = circuit[currentIdx];

      // Fast-forward (the passenger demo's "demo speed", see applyDemoAction's
      // "resume"): every update waits on a server round trip (~1 s), so
      // shortening the delay alone tops out around 2-3x. Instead cover
      // several route points per update — x8 moves 8 points at a time — and
      // pace the updates so the unit really does cover 1/multiplier times the
      // ground per second. Real time (multiplier 1) is untouched.
      const tickStartedAt = Date.now();
      const stride = demoState.delayMultiplier < 1 ? Math.max(1, Math.round(1 / demoState.delayMultiplier)) : 1;

      // driver-location-update requeues a driving unit the moment it is within
      // 100 m of the route's terminus, but a loop route can pass back near its
      // own start part-way round (the grey route does, around SM City Clark,
      // ~1 km in) — that is not a finished trip. Only the last stretch of the
      // circuit is the real end, so skip the report anywhere else near the
      // terminus; the unit simply carries on (it isn't requeued mid-lap).
      const terminus = circuit[circuitLength - 1];
      const isNearTerminus = haversineMeters(point, terminus) <= END_OF_ROUTE_GUARD_METERS;
      const isRealEnd = currentIdx >= circuitLength * END_OF_ROUTE_ZONE_FRACTION;
      if (isNearTerminus && !isRealEnd) {
        currentIdx = (currentIdx + stride) % circuitLength;
        await sleep(baseVehicleDelay * demoState.delayMultiplier * stride);
        continue;
      }

      const result = await callFunction(
        "driver-location-update",
        session.accessToken,
        {
          lat: point.lat,
          lng: point.lng,
          capacity_state: capacityState,
        },
        { quiet: true },
      );

      // driver-location-update auto-requeues this unit to "waiting" as soon
      // as it passes within 100m of the route's terminus (is_near_terminus).
      // Once that happens the unit is INVISIBLE to passengers — the realtime
      // broadcast gate and get_route_visible_drivers both only ever show
      // next_to_go/driving — so it must go back through the queue and get
      // redispatched rather than keep driving. Ignoring this (which is what
      // the old --requeue=off mode did) left the unit circling the route
      // forever with nobody able to see it.
      if (result?.end_of_route) {
        console.log(`  🏁 [${driverLabel}] completed its route — rejoining the queue.`);
        // Next lap starts from the beginning. Left where it finished, the
        // unit's very first report after being redispatched would be at the
        // route's end again, finishing it instantly — an endless
        // requeue/dispatch loop in which it never leaves the terminal. (The
        // start stretch is within the end-of-route radius, but the guard
        // above skips reporting there until the unit has moved clear.)
        currentIdx = 0;
        break;
      }

      step++;
      if (demoState.lockCapacity) {
        // Pinned by the passenger demo (so the unit she is waiting for isn't
        // randomly "full" when it reaches her). Skips the random toggle below.
        if (capacityState !== demoState.lockCapacity) {
          capacityState = demoState.lockCapacity;
          await callFunction(
            "driver-capacity-toggle",
            session.accessToken,
            { state: capacityState },
            { quiet: true },
          );
        }
      } else if (step % TOGGLE_CAPACITY_EVERY_N_STEPS === 0) {
        capacityState = capacityState === "available" ? "full" : "available";
        await callFunction(
          "driver-capacity-toggle",
          session.accessToken,
          { state: capacityState },
          { quiet: true },
        );
      }

      currentIdx = (currentIdx + stride) % circuitLength;
      // Pace by the wall-clock the whole tick should take, minus what the
      // server call already used, so fast-forward isn't capped by latency.
      const tickBudgetMs = baseVehicleDelay * demoState.delayMultiplier * stride;
      await sleep(Math.max(stride > 1 ? 150 : 0, tickBudgetMs - (stride > 1 ? Date.now() - tickStartedAt : 0)));
    }
  } while (true);
}

// ---------- per-route fleet orchestrator ----------

async function driveRouteFleet(route, terminal) {
  const label = route.name;

  const { circuit } = await getRouteCircuit(route, terminal, label);
  console.log(`🚦 [${label}] Deploying ${JEEPS_PER_ROUTE} units...`);

  const jeepPromises = [];
  for (let i = 1; i <= JEEPS_PER_ROUTE; i++) {
    jeepPromises.push(
      driveSingleJeep(route, terminal, circuit, i, JEEPS_PER_ROUTE).catch((err) => {
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

  // Set up AFTER we know there's actually something to control — starting
  // an interactive readline interface and then hitting process.exit() above
  // (bad route filter, no routes at all) crashes Node on Windows
  // ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)") because
  // readline leaves an open stdin handle behind.
  setupDemoControls();

  // Runs forever alongside the fleet; never awaited, and never allowed to
  // take the process down if the table is missing.
  pollDemoCommands().catch((err) => console.error("demo command poller stopped:", err));

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
