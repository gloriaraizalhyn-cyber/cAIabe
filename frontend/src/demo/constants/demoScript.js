// The hackathon demo journey, as data.
//
// The passenger waits at Bayanihan Park (Astro Park) in Balibago, which sits
// directly ON the grey Balibago route's polyline (0 m walk to board) — landmark
// coordinates in add_landmarks.sql. Route-search plans it on the existing
// seeded data with no new routes: ride the grey route, transfer around
// Nepo/Pampang, finish on the yellow Telabastagan route.
export const DEMO_JOURNEY = {
  origin: { label: "Astro Park", lat: 15.1695, lng: 120.588 },
  destination: { label: "SM City Telabastagan", lat: 15.120246, lng: 120.6018769 },
  discountType: "student",
};

// The two routes route-search actually returns for this journey (verified by
// calling it directly): board the grey Balibago route at Astro Park, transfer
// around Nepo/Pampang, finish on the yellow Telabastagan route.
export const DEMO_ROUTES = [
  {
    leg: 1,
    id: "e5f1a7fe-d258-44ca-a823-0360df2d1221",
    name: "Checkpoint - Holy Angel University - Balibago",
    shortName: "Balibago (grey)",
    color: "#574F54",
  },
  {
    leg: 2,
    id: "f821d810-ef7e-43f9-9b8a-b419d6309615",
    name: "Pampang - SM Telabastagan",
    shortName: "Telabastagan (yellow)",
    color: "#EDF43D",
  },
];

// The driver pane watches the route the passenger boards first — that's the
// driver whose screen the passenger's "I'm here" tap actually changes.
export const DEMO_LEAD_ROUTE = DEMO_ROUTES[0];

// Where the pane driver parks, and therefore where the stage reads demand
// from: the grey route's own SM Clark terminal ("Public Transport Terminal
// (SM Clark)"), where the grey jeepneys actually start. demo-prep.js places
// that terminal exactly on the route's start/terminus (routes.terminus,
// 15.1682564, 120.5823745 — beside SM City Clark); the seeded row was ~456 m
// off it.
//
// Geometry, along the 10,530 m grey loop (jeepneys run in increasing order):
//     SM Clark terminal   ~0 m          Astro Park   9,848 m
// So Astro Park is ~9.8 km AHEAD of the terminal by driving order (the unit
// passes it at the end of the loop, just before returning). driver-demand-check
// keeps her (not behind the driver) but scores her in the far, low-demand
// band — her single tap shows on the driver's screen, and the SURGE lever
// (clusters placed relative to this terminal, below) is what flips WAIT to GO.
//
// The terminal is also the grey route's end point, and the server requeues a
// driving unit the moment it is within 100 m of that point (is_near_terminus).
// The route is within 100 m of it in THREE stretches, measured along the
// polyline: the start (0-314 m), a small loop around SM City Clark that
// returns past it (1,086-1,220 m), and the real end (10,422-10,530 m). Only
// the last one is a finished trip, so the scripted drive does not report
// positions to the server inside the first two (they still show on screen) —
// see DrivingPage's demo drive loop.
export const DEMO_LEAD_TERMINAL_ALONG_METERS = 0;
export const DEMO_LEAD_ROUTE_LENGTH_METERS = 10530;
export const DEMO_ROUTE_END_ZONE_METERS = 150;
export const DEMO_TERMINUS_RADIUS_METERS = 105;
export const DEMO_DRIVE_STEP_METERS = 70;

// The second driver phone on the stage: a Telabastagan (yellow) driver, who
// parks at the yellow route's own terminal and reacts to the passenger the
// moment she is waiting at the transfer stop. Like the grey pane driver it is
// a unit the fleet simulator does NOT drive — run the Pampang fleet with
// --jeeps=2 so unit #3 stays free for this pane.
export const DEMO_YELLOW_PANE_DRIVER_UNIT = 3;

// Per-route geometry for the stage driver pane's scripted drive (see
// DrivingPage). `terminal` is the route's own start/end point — the server
// requeues a driving unit within 100 m of it, so the drive must not report
// positions there until it has genuinely finished the lap. `lengthMeters` is
// the polyline's length. Measured against the stored polylines:
//   grey:   within 100 m of its end point at 0-314 m, 1,086-1,220 m (a small
//           loop around SM City Clark) and 10,422-10,530 m; length 10,530 m
//   yellow: within 100 m at 0-127 m and 4,737-4,815 m only; length 4,815 m
export const DEMO_DRIVE_ROUTES = {
  "e5f1a7fe-d258-44ca-a823-0360df2d1221": {
    terminal: { lat: 15.1682564, lng: 120.5823745 },
    lengthMeters: 10530,
    startAlongMeters: 0,
  },
  "f821d810-ef7e-43f9-9b8a-b419d6309615": {
    terminal: { lat: 15.122755, lng: 120.599655 },
    lengthMeters: 4815,
    startAlongMeters: 0,
  },
};
export const DEMO_DRIVE_STEP_INTERVAL_MS = 2000;
export const DEMO_LEAD_TERMINAL = { name: "Public Transport Terminal (SM Clark)", lat: 15.1682564, lng: 120.5823745 };

// The driver pane gets a unit the fleet simulator does NOT drive.
//
// Both would otherwise write to driver-location-update for the same driver:
// the simulator every ~800 ms with its position along the route, and the
// page whenever it reports GPS — so the jeepney would flip between Angeles
// City and wherever the presenter's laptop is. Running the simulator with
// --jeeps=3 and pointing the pane at unit #4 keeps them disjoint.
//
// It also makes a better story: this driver is parked at the terminal
// deciding whether to roll out, which is exactly what WaitOrGoCard answers.
export const DEMO_PANE_DRIVER_UNIT = 4;
export const DEMO_SIM_JEEPS_PER_ROUTE = 3;

// Must match slugify() in mock-fleet-simulator.js, which is what names the
// simulated driver accounts it creates.
export function slugifyRouteName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function simDriverEmail(routeName, unitIndex = 1) {
  return `sim.${slugifyRouteName(routeName)}.${unitIndex}@caiabe.test`;
}

// A number that will never belong to a real person, so the SMS beat can't
// text a stranger even if a live TextBee device is somehow attached.
export const DEMO_SMS_PHONE = "+639171234567";

export const DEMO_SMS_SCRIPT = [
  `ROUTE ${DEMO_JOURNEY.origin.label} to ${DEMO_JOURNEY.destination.label}`,
  "1",
];

// Cluster spec for the surge lever: count, and how far ALONG THE ROUTE
// POLYLINE from the route's start to place them (not distance from the
// driver). The pane driver parks at the route's start (the SM Clark terminal),
// so these are also its distances ahead: ~0.7 km (HIGH PRIORITY) and ~1.5 km
// (GOOD DEMAND). Placing them too close to the driver's own projection makes
// the signed distance wrap around the loop and read as "behind", which reads
// as LOW/IRRELEVANT on screen.
export const DEMO_SURGE_CLUSTERS = [
  { count: 5, km: 0.7 },
  { count: 3, km: 1.5 },
];

export const DEMO_BEATS = [
  {
    id: "search",
    title: "Search",
    focus: "passenger",
    caption: "Astro Park → SM City Telabastagan. Two jeepneys, one transfer, ₱21.12 as a student.",
    narration:
      "The passenger picks Astro Park and a mall. cAIabe plans it across two different jeepney routes and prices the whole thing — this is real PostGIS route planning, not a lookup table.",
  },
  {
    id: "waiting",
    title: "\"I'm here\"",
    focus: "both",
    caption: "One tap. The driver's screen changes.",
    narration:
      "She taps once to say she's waiting. Watch the driver's phone on the right — a yellow dot appears there and on the map at the same moment. Her exact location is never shared; it's fuzzed 80–150 m server-side.",
  },
  {
    id: "demand",
    title: "Demand",
    focus: "driver",
    caption: "Surge → the driver AI flips WAIT to GO.",
    narration:
      "More riders start waiting along the route. The driver's assistant recomputes and flips to GO, and it shows its reasoning — the score is computed in code, the AI only puts it into words.",
    lever: "surge",
  },
  {
    id: "traffic",
    title: "Traffic",
    focus: "passenger",
    caption: "Real traffic. Real recompute.",
    narration:
      "Now we put that jeepney in traffic — it genuinely moves back along its route and slows down. Her ETA goes up, because it's measured against a real moving vehicle with traffic-aware routing.",
    lever: "traffic",
  },
  {
    id: "board",
    title: "Board & transfer",
    focus: "passenger",
    caption: "A grey jeep with open seats picks her up → rides → transfers → a yellow jeep → arrived.",
    narration:
      "The first grey jeep with open seats that reaches her picks her up automatically, and her screen says she's on board. She rides it to the transfer stop, walks to the yellow stop, and the next open yellow jeep takes her to Telabastagan. The fare adds up per leg, and at the end she sees her total fare and the CO2 she saved. The jeeps are fast-forwarded for the demo — tap the Demo speed chip to change it.",
  },
  {
    id: "sms",
    title: "No data? Text it.",
    focus: "sms",
    caption: "Same planner, over SMS, with zero data connection.",
    narration:
      "Not everyone has mobile data. The same planning engine answers a plain text message — she texts where she's going and gets the same options back, split into real 160-character SMS.",
    lever: "sms",
  },
  {
    id: "close",
    title: "The network",
    focus: "map",
    caption: "Every unit live. Every rider counted.",
    narration:
      "Scaled up, that's the whole picture: every jeepney broadcasting, every waiting rider visible to the drivers who can actually reach them.",
  },
];
