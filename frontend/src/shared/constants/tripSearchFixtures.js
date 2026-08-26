// Placeholder data for the trip-planning flow. None of this comes from the
// backend yet — it exists so the UI (and the map layer) can be built and
// exercised before route-search / geocoding are wired in.

export const PLACE_SUGGESTIONS_FIXTURE = [
  { id: "place-1", label: "National University Clark", lat: 15.1862, lng: 120.5602 },
  { id: "place-2", label: "JENRA Grand Mall", lat: 15.1453, lng: 120.5931 },
  { id: "place-3", label: "SM Clark", lat: 15.1809, lng: 120.5566 },
  { id: "place-4", label: "Marquee Mall", lat: 15.1652, lng: 120.5931 },
  { id: "place-5", label: "Clark Freeport Zone", lat: 15.1859, lng: 120.5364 },
  { id: "place-6", label: "Angeles University Foundation", lat: 15.1435, lng: 120.5935 },
  { id: "place-7", label: "Dau Bus Terminal", lat: 15.1697, lng: 120.6122 },
  { id: "place-8", label: "Holy Angel University", lat: 15.1417, lng: 120.5934 },
  { id: "place-9", label: "Checkpoint, Angeles City", lat: 15.1508, lng: 120.5891 },
  { id: "place-10", label: "Balibago", lat: 15.1706, lng: 120.5787 },
  { id: "place-11", label: "Friendship Highway", lat: 15.1780, lng: 120.5750 },
  { id: "place-12", label: "Fields Avenue", lat: 15.1721, lng: 120.5883 },
];

export const SAVED_ROUTES_FIXTURE = [
  {
    id: "saved-1",
    label: "School → Home",
    jeepneyLineCode: "04L",
    origin: "National University Clark",
    destination: "JENRA Grand Mall",
  },
  {
    id: "saved-2",
    label: "SM Clark - CDC",
    jeepneyLineCode: "12L",
    origin: "SM Clark",
    destination: "Clark Freeport Zone",
  },
];

export const AI_SEARCH_TIP_FIXTURE =
  "Traffic is heavy along the Jenra Mall stretch right now — I'll weigh transfers against waiting time.";

// Route accent colors: the same color is used for a route's card outline
// and its polyline on the map, so they stay visually linked.
export const ROUTE_ACCENT_COLORS = {
  best: "#1a9e5c",
  second: "#7c3aed",
  third: "#e08e2c",
};

export const ROUTE_OPTIONS_FIXTURE = [
  {
    id: "route-beige-gray",
    accentColor: ROUTE_ACCENT_COLORS.best,
    jeepColors: ["#c9a876", "#4b4b4b"],
    title: "BEIGE + GRAY JEEP",
    subtitle: "Friendship Hwy + Checkpoint – HAU Jeepney",
    fare: 26.0,
    distanceKm: 6.8,
    walkMinutes: 5,
    travelMinutes: 38,
    transferCount: 1,
    leaveTime: "9:12 AM",
    arriveTime: "9:50 AM",
    availabilityNote: "3 BEIGE Friendship Hwy jeeps within 6 mins • Seats available",
    aiNote:
      "Fastest option with only one transfer. ₱13 more than the white Hensonville route, but saves 14 minutes — and three beige Friendship Hwy units are within 6 minutes of your bay right now.",
    legs: [
      { id: "leg-1", kind: "walk", title: "Walk to Jollibee Cutcut bay", subtitle: "240 m along MacArthur Hwy", duration: "3 min" },
      { id: "leg-2", kind: "jeep", color: "#c9a876", jeepColorName: "BEIGE", jeepneyLineCode: "04L", title: "Beige jeep · Friendship Hwy – Angeles", subtitle: "Cutcut bay → Astro · ₱13", duration: "16 min" },
      { id: "leg-3", kind: "walk", title: "Cross at Overpass 1", subtitle: "160 m to the Checkpoint–HAU bay", duration: "2 min" },
      { id: "leg-4", kind: "jeep", color: "#4b4b4b", jeepColorName: "GRAY", jeepneyLineCode: "07K", title: "Gray jeep · Checkpoint – HAU – Balibago", subtitle: "Astro → JENRA Grand Mall · ₱13", duration: "17 min" },
    ],
    path: [
      { lat: 15.1862, lng: 120.5602 },
      { lat: 15.1780, lng: 120.5750 },
      { lat: 15.1508, lng: 120.5891 },
      { lat: 15.1453, lng: 120.5931 },
    ],
    waitingAtBay: {
      bayName: "Jollibee Cutcut bay",
      walkDistanceMeters: 240,
      walkDurationMinutes: 3,
      jeepColorName: "BEIGE",
      jeepneyLineCode: "04L",
      nearestJeep: { unitNickname: "BAYANIHAN", etaMinutes: 30, distanceKm: 1.1, hasSeatsAvailable: false },
      nearbyJeeps: [
        { id: "nearby-1", unitNickname: null, hasSeatsAvailable: true, mapPositionPercent: { x: 24, y: 15 } },
        { id: "nearby-2", unitNickname: "BAYANIHAN", hasSeatsAvailable: false, mapPositionPercent: { x: 22, y: 32 } },
      ],
      aiWaitRecommendation: {
        recommendationType: "go",
        headline: "GO — try another option",
        body: "This unit is 30 min out and still filling up at the terminal. The 01K bay is a 6-min walk and leaves sooner.",
      },
    },
    onRouteJourney: {
      steps: [
        { id: "stop-1", kind: "boarded", name: "Jollibee Cutcut bay", timestampLabel: "BOARDED 09:12" },
        { id: "stop-2", kind: "get_off", name: "Astro", timestampLabel: "IN 9 MIN" },
        { id: "stop-3", kind: "transfer_walk", name: "Transfer to 07K", timestampLabel: "2 MIN WALK" },
        { id: "stop-4", kind: "arrive", name: "JENRA Grand Mall", timestampLabel: "ARRIVE 09:50" },
      ],
      phaseOrder: ["on_board_leg_1", "transferring", "on_board_leg_2"],
      phases: {
        on_board_leg_1: {
          activeStepIndex: 1,
          statusLabel: "ON BOARD · 04L",
          heading: "Get off at Astro",
          subtext: "In 9 min · 3 stops · then transfer to 07K",
          fareSoFar: 13.0,
          advanceButtonLabel: "I'm getting off",
          nextPhaseKey: "transferring",
        },
        transferring: {
          activeStepIndex: 2,
          statusLabel: "TRANSFERRING · 2 MIN WALK",
          heading: "Walk to board the 07K jeep",
          subtext: "GRAY jeep · then ride 17 more mins to JENRA Grand Mall",
          fareSoFar: 13.0,
          advanceButtonLabel: "I've boarded the 07K jeep",
          nextPhaseKey: "on_board_leg_2",
        },
        on_board_leg_2: {
          activeStepIndex: 3,
          statusLabel: "ON BOARD · 07K",
          heading: "Get off at JENRA Grand Mall",
          subtext: "In 17 min · 0 stops · final stop",
          fareSoFar: 26.0,
          advanceButtonLabel: "I've arrived",
          nextPhaseKey: null,
        },
      },
    },
  },
  {
    id: "route-emerald-blue",
    accentColor: ROUTE_ACCENT_COLORS.second,
    jeepColors: ["#1a9e5c", "#2563eb"],
    title: "EMERALD + BLUE JEEP",
    subtitle: "Marisol – Pampang + Pandan – Angeles jeepney",
    fare: 30.0,
    distanceKm: 8.1,
    walkMinutes: 4,
    travelMinutes: 41,
    transferCount: 1,
    leaveTime: "9:12 AM",
    arriveTime: "9:53 AM",
    availabilityNote: "Nearest emerald Marisol–Pampang jeep is 12 min out",
    aiNote: null,
    legs: [
      { id: "leg-1", kind: "jeep", color: "#1a9e5c", jeepColorName: "EMERALD", jeepneyLineCode: "02L", title: "Emerald jeep · Marisol – Pampang", subtitle: "NU Clark gate → Astro · ₱13", duration: "9 min" },
      { id: "leg-2", kind: "walk", title: "Walk to Overpass 1", subtitle: "300 m", duration: "4 min" },
      { id: "leg-3", kind: "jeep", color: "#2563eb", jeepColorName: "BLUE", jeepneyLineCode: "05K", title: "Blue jeep · Pandan – Angeles", subtitle: "Astro → JENRA Grand Mall · ₱17", duration: "25 min" },
    ],
    path: [
      { lat: 15.1862, lng: 120.5602 },
      { lat: 15.1697, lng: 120.6122 },
      { lat: 15.1508, lng: 120.5891 },
      { lat: 15.1453, lng: 120.5931 },
    ],
    waitingAtBay: {
      bayName: "NU Clark Gate",
      walkDistanceMeters: 80,
      walkDurationMinutes: 1,
      jeepColorName: "EMERALD",
      jeepneyLineCode: "02L",
      nearestJeep: { unitNickname: "MARISOL", etaMinutes: 4, distanceKm: 2.3, hasSeatsAvailable: true },
      nearbyJeeps: [
        { id: "nearby-1", unitNickname: null, hasSeatsAvailable: false, mapPositionPercent: { x: 28, y: 16 } },
        { id: "nearby-2", unitNickname: "MARISOL", hasSeatsAvailable: true, mapPositionPercent: { x: 24, y: 34 } },
      ],
      aiWaitRecommendation: {
        recommendationType: "wait",
        headline: "WAIT for this jeep",
        body: "4 min out with seats open — the next emerald unit isn't due for another 11 minutes.",
      },
    },
    onRouteJourney: {
      steps: [
        { id: "stop-1", kind: "boarded", name: "NU Clark Gate", timestampLabel: "BOARDED 09:12" },
        { id: "stop-2", kind: "get_off", name: "Astro", timestampLabel: "IN 9 MIN" },
        { id: "stop-3", kind: "transfer_walk", name: "Transfer to 05K", timestampLabel: "4 MIN WALK" },
        { id: "stop-4", kind: "arrive", name: "JENRA Grand Mall", timestampLabel: "ARRIVE 09:53" },
      ],
      phaseOrder: ["on_board_leg_1", "transferring", "on_board_leg_2"],
      phases: {
        on_board_leg_1: {
          activeStepIndex: 1,
          statusLabel: "ON BOARD · 02L",
          heading: "Get off at Astro",
          subtext: "In 9 min · 2 stops · then transfer to 05K",
          fareSoFar: 13.0,
          advanceButtonLabel: "I'm getting off",
          nextPhaseKey: "transferring",
        },
        transferring: {
          activeStepIndex: 2,
          statusLabel: "TRANSFERRING · 4 MIN WALK",
          heading: "Walk to board the 05K jeep",
          subtext: "BLUE jeep · then ride 25 more mins to JENRA Grand Mall",
          fareSoFar: 13.0,
          advanceButtonLabel: "I've boarded the 05K jeep",
          nextPhaseKey: "on_board_leg_2",
        },
        on_board_leg_2: {
          activeStepIndex: 3,
          statusLabel: "ON BOARD · 05K",
          heading: "Get off at JENRA Grand Mall",
          subtext: "In 25 min · 0 stops · final stop",
          fareSoFar: 30.0,
          advanceButtonLabel: "I've arrived",
          nextPhaseKey: null,
        },
      },
    },
  },
  {
    id: "route-white",
    accentColor: ROUTE_ACCENT_COLORS.third,
    jeepColors: ["#e5e5e5"],
    title: "WHITE JEEP",
    subtitle: "Checkpoint – Hensonville jeepney",
    fare: 13.0,
    distanceKm: 7.4,
    walkMinutes: 8,
    travelMinutes: 52,
    transferCount: 0,
    leaveTime: "9:12 AM",
    arriveTime: "10:04 AM",
    availabilityNote: "White Hensonville jeeps run every 10–12 mins along this stretch",
    aiNote: null,
    legs: [
      { id: "leg-1", kind: "walk", title: "Walk to Checkpoint bay", subtitle: "420 m along MacArthur Hwy", duration: "8 min" },
      { id: "leg-2", kind: "jeep", color: "#c9c9c9", jeepColorName: "WHITE", jeepneyLineCode: "09L", title: "White jeep · Checkpoint – Hensonville", subtitle: "Checkpoint → JENRA Grand Mall · ₱13", duration: "44 min" },
    ],
    path: [
      { lat: 15.1862, lng: 120.5602 },
      { lat: 15.1508, lng: 120.5891 },
      { lat: 15.1453, lng: 120.5931 },
    ],
    waitingAtBay: {
      bayName: "Checkpoint bay",
      walkDistanceMeters: 420,
      walkDurationMinutes: 8,
      jeepColorName: "WHITE",
      jeepneyLineCode: "09L",
      nearestJeep: { unitNickname: "HENSONVILLE", etaMinutes: 6, distanceKm: 3.4, hasSeatsAvailable: true },
      nearbyJeeps: [
        { id: "nearby-1", unitNickname: "HENSONVILLE", hasSeatsAvailable: true, mapPositionPercent: { x: 26, y: 20 } },
      ],
      aiWaitRecommendation: {
        recommendationType: "wait",
        headline: "WAIT for this jeep",
        body: "White Hensonville units run every 10–12 minutes, so this one is worth the wait.",
      },
    },
    onRouteJourney: {
      steps: [
        { id: "stop-1", kind: "boarded", name: "Checkpoint bay", timestampLabel: "BOARDED 09:12" },
        { id: "stop-2", kind: "arrive", name: "JENRA Grand Mall", timestampLabel: "ARRIVE 10:04" },
      ],
      phaseOrder: ["on_board_only"],
      phases: {
        on_board_only: {
          activeStepIndex: 1,
          statusLabel: "ON BOARD · 09L",
          heading: "Get off at JENRA Grand Mall",
          subtext: "In 44 min · 0 stops · no transfer",
          fareSoFar: 13.0,
          advanceButtonLabel: "I've arrived",
          nextPhaseKey: null,
        },
      },
    },
  },
];
