// demo-prep.js
//
// One-shot setup for the hackathon demo stage (/demo/stage). Run this BEFORE
// the fleet simulator, and before judges are watching — it removes every
// cold-start delay from the live run.
//
// Usage:
//   node --env-file=.env demo-prep.js
//
// What it does, all idempotent (safe to re-run between rehearsals):
//   1. Checks the Astro Park landmark exists and its coordinate is right.
//   2. Creates/approves the simulated driver accounts for both demo routes,
//      using the same account naming mock-fleet-simulator.js uses, so the
//      stage's driver pane can sign straight in.
//   3. Confirms route-search actually plans Astro Park -> SM City
//      Telabastagan on the seeded data, and prints the itinerary.
//   4. Prints the exact commands and URL for the run.
//
// It does NOT place waiting passengers or start driving — the fleet
// simulator does the driving, and demand is a live lever on the stage.

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const SIM_DRIVER_PASSWORD = "MockFleet123!";
const JEEPS_PER_ROUTE = parseInt(getCliArg("jeeps", "3"), 10) || 3;
// Must match DEMO_PANE_DRIVER_UNIT / DEMO_LEAD_TERMINAL in
// frontend/src/demo/constants/demoScript.js.
const PANE_DRIVER_UNIT = 4;
// The yellow route's driver pane (DEMO_YELLOW_PANE_DRIVER_UNIT): a spare unit on
// the Pampang route that the fleet simulator must not drive (--jeeps=2).
const YELLOW_PANE_DRIVER_UNIT = 3;
const PANE_DRIVER_TERMINAL = "Public Transport Terminal (SM Clark)";
// Where that terminal must sit: the grey route's own start/terminus (its
// routes.terminus), right beside SM City Clark. The seeded row was ~456 m
// away from it. Must match DEMO_LEAD_TERMINAL in demoScript.js.
const PANE_DRIVER_TERMINAL_POSITION = { lat: 15.1682564, lng: 120.5823745 };

// Must match frontend/src/demo/constants/demoScript.js.
const ORIGIN = { label: "Astro Park", landmark: "Bayanihan Park (Astro Park)", lat: 15.1695, lng: 120.588 };
const DESTINATION = { label: "SM City Telabastagan", lat: 15.120246, lng: 120.6018769 };
const DEMO_ROUTE_NAMES = [
  "Checkpoint - Holy Angel University - Balibago",
  "Pampang - SM Telabastagan",
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Run this script with: node --env-file=.env demo-prep.js`);
    process.exit(1);
  }
  return value;
}

function getCliArg(name, defaultValue) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : defaultValue;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ---------- REST helpers (same conventions as the simulators) ----------

async function restSelect(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
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
      { id, route_id: routeId, jeep_color: jeepColor, home_terminal_id: homeTerminalId, verification_status: "approved" },
    ]),
  });
  if (!res.ok) throw new Error(`drivers upsert failed: ${res.status} ${await res.text()}`);
}

// ---------- checks ----------

async function checkLandmarks() {
  console.log("① Landmarks");
  const rows = await restSelect(
    "landmarks?label=in.(%22Bayanihan%20Park%20(Astro%20Park)%22,%22SM%20City%20Telabastagan%22)&select=label,lat,lng",
  );

  const clark = rows.find((r) => r.label === ORIGIN.landmark);
  const tela = rows.find((r) => r.label === "SM City Telabastagan");

  if (!clark) {
    console.log("   ❌ Astro Park landmark is missing — run supabase/sql/add_landmarks.sql");
    return false;
  }
  console.log(`   ✅ ${ORIGIN.label}  ${clark.lat}, ${clark.lng}`);

  if (!tela) {
    console.log("   ❌ SM City Telabastagan is missing — run supabase/sql/add_landmarks.sql");
    return false;
  }
  const telaFixed = Math.abs(tela.lat - DESTINATION.lat) < 0.0005;
  console.log(
    telaFixed
      ? `   ✅ SM City Telabastagan  ${tela.lat}, ${tela.lng}`
      : `   ⚠️  SM City Telabastagan is still at ${tela.lat}, ${tela.lng} (the old Petron terminal pin) — run add_demo_sm_clark_landmark.sql to correct it. The demo still works.`,
  );
  return true;
}

async function checkDemoControl() {
  console.log("\n② Demo control table");
  try {
    await restSelect("demo_commands?select=id&limit=1");
    console.log("   ✅ demo_commands is present (traffic + SMS levers will work)");
    return true;
  } catch {
    console.log("   ❌ demo_commands is missing — run supabase/sql/add_demo_control.sql");
    console.log("      Without it the Throw-traffic and SMS levers do nothing; everything else still works.");
    return false;
  }
}

async function ensureTerminalLocation() {
  console.log("\n②b Grey route terminal");
  const name = encodeURIComponent(PANE_DRIVER_TERMINAL);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/terminals?name=eq.${name}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      location: `SRID=4326;POINT(${PANE_DRIVER_TERMINAL_POSITION.lng} ${PANE_DRIVER_TERMINAL_POSITION.lat})`,
    }),
  });
  const rows = await res.json();
  if (!res.ok || !rows.length) {
    console.log(`   ❌ Could not move "${PANE_DRIVER_TERMINAL}": ${JSON.stringify(rows)}`);
    return;
  }
  console.log(
    `   ✅ ${PANE_DRIVER_TERMINAL} at ${PANE_DRIVER_TERMINAL_POSITION.lat}, ${PANE_DRIVER_TERMINAL_POSITION.lng} (the grey route's own start)`,
  );
}

async function ensureDrivers() {
  console.log("\n③ Simulated drivers");

  const [routes, terminalRoutes, terminals] = await Promise.all([
    restSelect("routes?select=id,name,color"),
    restSelect("terminal_routes?select=terminal_id,route_id"),
    restSelect("terminals?select=id,name"),
  ]);
  const terminalIdByRoute = new Map(terminalRoutes.map((tr) => [tr.route_id, tr.terminal_id]));
  const paneTerminalId = terminals.find((t) => t.name === PANE_DRIVER_TERMINAL)?.id ?? null;

  for (const routeName of DEMO_ROUTE_NAMES) {
    const route = routes.find((r) => r.name === routeName);
    if (!route) {
      console.log(`   ❌ Route "${routeName}" not found — has caiabe_seed_routes.sql been run?`);
      continue;
    }
    const terminalId = terminalIdByRoute.get(route.id);
    if (!terminalId) {
      console.log(`   ❌ Route "${routeName}" has no terminal_routes link.`);
      continue;
    }

    // Units 1..N are driven by the fleet simulator. The lead route gets one
    // EXTRA account (PANE_DRIVER_UNIT) that the simulator never touches —
    // that's the one the stage's driver pane signs in as. If they shared an
    // account, the simulator and the page would both be writing that
    // driver's position and it would flip between the route and wherever the
    // presenter's laptop is.
    const isLeadRoute = routeName === DEMO_ROUTE_NAMES[0];
    const lastUnit = isLeadRoute ? PANE_DRIVER_UNIT : JEEPS_PER_ROUTE;

    for (let i = 1; i <= lastUnit; i += 1) {
      const email = `sim.${slugify(route.name)}.${i}@caiabe.test`;
      let session = await signIn(email, SIM_DRIVER_PASSWORD);
      if (!session) {
        await adminCreateUser(email, SIM_DRIVER_PASSWORD);
        session = await signIn(email, SIM_DRIVER_PASSWORD);
      }
      if (!session) {
        console.log(`   ❌ Could not sign in ${email}`);
        continue;
      }
      // The pane driver parks at the grey route's SM Clark terminal, where
      // the grey jeepneys start. See DEMO_LEAD_TERMINAL in demoScript.js.
      const isPaneDriver = isLeadRoute && i === PANE_DRIVER_UNIT;
      await upsertDriverRow({
        id: session.userId,
        routeId: route.id,
        jeepColor: route.color,
        homeTerminalId: isPaneDriver && paneTerminalId ? paneTerminalId : terminalId,
      });
      if (i === 1) console.log(`   ✅ ${routeName}`);
      const isYellowPaneDriver = !isLeadRoute && i === YELLOW_PANE_DRIVER_UNIT;
      const role = isPaneDriver
        ? `  ← grey driver pane, parks at ${PANE_DRIVER_TERMINAL}`
        : isYellowPaneDriver
          ? "  ← yellow driver pane (leave undriven: run its fleet with --jeeps=2)"
          : "";
      console.log(`      unit #${i}  ${email}  (${session.userId.slice(0, 8)}…)${role}`);
    }
  }
}

async function checkJourney() {
  console.log("\n④ The journey");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/route-search`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: { lat: ORIGIN.lat, lng: ORIGIN.lng },
      destination: { lat: DESTINATION.lat, lng: DESTINATION.lng },
      discount_type: "student",
    }),
  });

  if (!res.ok) {
    console.log(`   ❌ route-search returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }

  const data = await res.json();
  const pick = data.recommended;
  if (!pick) {
    console.log("   ❌ route-search returned no recommended itinerary.");
    return;
  }

  console.log(
    `   ✅ ${ORIGIN.label} → ${DESTINATION.label}: ` +
      `${Math.round(pick.duration_min)} min · ₱${pick.fare.toFixed(2)} (was ₱${pick.fare_before_discount.toFixed(2)}) · ` +
      `${pick.transfer_count} transfer${pick.transfer_count === 1 ? "" : "s"}`,
  );
  for (const leg of pick.legs) {
    console.log(
      leg.kind === "walk"
        ? `      walk  ${Math.round(leg.distance_m)} m  (${Math.round(leg.duration_min)} min)`
        : `      ride  ${leg.route_name}  ${leg.distance_km} km  ₱${leg.fare.toFixed(2)}`,
    );
  }
  console.log(`   ${data.alternatives?.length ?? 0} alternative itineraries also available.`);
}

// Clears any waiting passengers still active on the demo routes.
//
// passenger_waiting_state rows live for 2 hours, so without this a rehearsal
// leaves its surge behind and the next run opens already at GO — which kills
// the whole point of the WAIT -> GO beat. Service role, because the table is
// deliberately service-role-only (schema.sql).
async function resetWaitingPassengers() {
  console.log("\n⑤ Clean slate");

  const routes = await restSelect("routes?select=id,name");
  let cleared = 0;

  for (const routeName of DEMO_ROUTE_NAMES) {
    const route = routes.find((r) => r.name === routeName);
    if (!route) continue;

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/passenger_waiting_state?route_id=eq.${route.id}&status=eq.waiting`,
      {
        method: "PATCH",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ status: "cleared" }),
      },
    );
    if (!res.ok) {
      console.log(`   ⚠️  Could not clear waiting passengers on "${routeName}": ${res.status}`);
      continue;
    }
    cleared += (await res.json()).length;
  }

  console.log(
    cleared
      ? `   ✅ Cleared ${cleared} leftover waiting passenger(s) — the driver AI starts at WAIT.`
      : "   ✅ No leftover waiting passengers — the driver AI starts at WAIT.",
  );
}

// ---------- main ----------

async function main() {
  console.log("==================================================");
  console.log("  cAIabe Demo Prep — Mission Control              ");
  console.log("==================================================\n");

  const landmarksOk = await checkLandmarks();
  const controlOk = await checkDemoControl();
  await ensureTerminalLocation();
  await ensureDrivers();
  await checkJourney();
  await resetWaitingPassengers();

  console.log("\n--------------------------------------------------");
  console.log("Ready. Three terminals, in this order:\n");
  console.log("  Terminal 1 — boarding route fleet (leave running):");
  console.log(`     node --env-file=.env mock-fleet-simulator.js --jeeps=${JEEPS_PER_ROUTE} \\`);
  console.log('       --route="Checkpoint - Holy Angel University - Balibago"');
  console.log("     Wait for all units to print \"dispatched — starting road loop\" (~30-60s).\n");
  console.log("  Terminal 2 — second-leg fleet (leave running):");
  console.log('     node --env-file=.env mock-fleet-simulator.js --jeeps=2 --route="Pampang - SM Telabastagan"\n');
  console.log("  Terminal 3 — frontend:");
  console.log("     npm --prefix frontend run dev\n");
  console.log("  Then open, and fullscreen on the projector:");
  console.log("     http://localhost:5173/demo/stage\n");
  console.log("  In the DRIVER pane, tap \"Use terminal location\" once — that parks it at");
  console.log(`  ${DEMO_ROUTE_NAMES[0].split(" - ")[0]}'s terminal and stops it asking for GPS.`);
  console.log("  Space / → advances a beat. Levers stay live the whole time.");

  if (!landmarksOk || !controlOk) {
    console.log("\n⚠️  Fix the ❌ items above first — see supabase/sql/.");
  }
}

main().catch((err) => {
  console.error("demo-prep failed:", err);
  process.exit(1);
});
