// mock-driver-simulator.js
//
// Simulates a driver: logs in, joins the queue, gets promoted to "driving",
// then loops through a set of coordinates, calling driver-location-update
// every ~1.5s and occasionally toggling capacity — so your future frontend
// has real, moving data to render against instead of static pins.
//
// Run with: node mock-driver-simulator.js
// Requires Node 18+ (uses native fetch).

// ---------- CONFIG — fill these in ----------
const SUPABASE_URL = "https://hprgaaynsucaguzlcndd.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcmdhYXluc3VjYWd1emxjbmRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDY4MDUsImV4cCI6MjEwMjYyMjgwNX0.d2lKpZpTUEEcBxmqu1trZuejAgQ4q5icQrpHojgSyCY";

const DRIVER_EMAIL = "ramosjhoven05@gmail.com";
const DRIVER_PASSWORD = "testpass123";

const TERMINAL_ID = "7a63fbe5-adf2-482f-98dd-a8162a7044e1";
// route_id isn't needed here directly — it's read from the driver's own
// profile server-side, so make sure this driver already has a `drivers`
// row with a route_id set (see the manual insert from earlier).

// A short mock path (lat, lng). Replace with real coordinates along one of
// your seeded routes later — for now this just needs to move visibly.
const MOCK_PATH = [
  { lat: 15.0794, lng: 120.9647 },
  { lat: 15.0850, lng: 120.9600 },
  { lat: 15.0910, lng: 120.9550 },
  { lat: 15.0970, lng: 120.9500 },
  { lat: 15.1030, lng: 120.9460 },
  { lat: 15.1090, lng: 120.9420 },
  { lat: 15.1150, lng: 120.9390 },
  { lat: 15.1220, lng: 120.9360 },
  { lat: 15.1300, lng: 120.9340 },
  { lat: 15.1449, lng: 120.9317 }, // matches Florida route terminus in seed data
];

const STEP_DELAY_MS = 1500;
const TOGGLE_CAPACITY_EVERY_N_STEPS = 4;
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
  if (!data.access_token) {
    throw new Error(`Login failed: ${JSON.stringify(data)}`);
  }
  console.log("✅ Logged in as", DRIVER_EMAIL);
  return data.access_token;
}

async function callFunction(name, accessToken, body) {
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
  if (!res.ok) {
    console.error(`❌ ${name} failed:`, data);
  }
  return data;
}

async function main() {
  const accessToken = await login();

  console.log("🚏 Joining queue...");
  const joinResult = await callFunction("driver-queue-join", accessToken, {
    terminal_id: TERMINAL_ID,
  });
  console.log(joinResult);

  console.log("🙋 Responding 'lining_up'...");
  await callFunction("driver-queue-respond", accessToken, {
    response: "lining_up",
  });

  console.log("⏭  Triggering queue-advance to promote to 'driving'...");
  // queue-advance normally runs on a schedule; with just one driver in the
  // queue, calling it once here promotes them from next_to_go -> driving.
  await fetch(`${SUPABASE_URL}/functions/v1/queue-advance`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
  });

  console.log("🚐 Starting movement loop — Ctrl+C to stop.\n");

  let capacityState = "available";

  for (let i = 0; i < MOCK_PATH.length; i++) {
    const point = MOCK_PATH[i];

    const result = await callFunction("driver-location-update", accessToken, {
      lat: point.lat,
      lng: point.lng,
    });

    console.log(
      `📍 Step ${i + 1}/${MOCK_PATH.length} → (${point.lat}, ${point.lng})`,
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

  console.log("\n✅ Reached end of mock path.");
}

main().catch((err) => {
  console.error("Simulator crashed:", err);
  process.exit(1);
});
