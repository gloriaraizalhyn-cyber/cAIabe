// The hackathon demo journey, as data.
//
// Coordinates are the real ones, verified against the mall's published
// locations — SM City Clark sits on M.A. Roxas Hwy in Brgy Malabanias,
// Angeles City (by the Clark Main Gate), NOT deep inside the freeport.
// That places it ~178 m from the grey Balibago route's polyline, which is
// why this journey plans on the existing seeded data with no new routes.
export const DEMO_JOURNEY = {
  origin: { label: "SM City Clark", lat: 15.16845, lng: 120.58018 },
  destination: { label: "SM City Telabastagan", lat: 15.120246, lng: 120.6018769 },
  discountType: "student",
};

// The two routes route-search actually returns for this journey (verified by
// calling it directly): board the grey Balibago route near Clark, transfer
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
// from. Friendship Highway, not the grey route's usual SMC Checkpoint, for a
// geometric reason that decides whether the demo works at all:
//
//   along the 10,530 m grey loop —
//     Friendship Highway terminal    141 m
//     SM Clark boarding point        444 m
//     SMC Checkpoint terminal      1,267 m
//
// driver-demand-check drops any passenger more than 150 m BEHIND the driver
// (jeepneys don't turn around). From SMC Checkpoint the SM Clark passenger is
// 823 m behind and is filtered out — the driver would never see her tap.
// From Friendship Highway she is 303 m ahead, in the HIGH PRIORITY band.
//
// It's also the truer story: this terminal sits by the Clark Main Gate, a few
// hundred metres from the mall, so a unit here is genuinely the one she'd board.
export const DEMO_LEAD_TERMINAL = { name: "Friendship Highway", lat: 15.16662, lng: 120.583175 };

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
// POLYLINE to place them (not distance from the driver). Tuned against the
// pane driver's 141 m position so both land in useful bands — ~0.6 km ahead
// (HIGH PRIORITY) and ~1.4 km ahead (GOOD DEMAND). Placing them too close to
// the driver's own projection makes the signed distance wrap around the loop
// and read as "behind", which reads as LOW/IRRELEVANT on screen.
export const DEMO_SURGE_CLUSTERS = [
  { count: 5, km: 0.7 },
  { count: 3, km: 1.5 },
];

export const DEMO_BEATS = [
  {
    id: "search",
    title: "Search",
    focus: "passenger",
    caption: "SM City Clark → SM City Telabastagan. Two jeepneys, one transfer, ₱21.90 as a student.",
    narration:
      "The passenger picks two malls. cAIabe plans it across two different jeepney routes and prices the whole thing — this is real PostGIS route planning, not a lookup table.",
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
    focus: "both",
    caption: "Grey jeep → transfer → yellow jeep → arrived.",
    narration:
      "She boards, rides the grey Balibago jeepney, transfers, and finishes on the yellow Telabastagan route. The fare adds up per leg, the way a real jeepney trip does.",
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
