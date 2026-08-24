// Placeholder data for the driver dashboard. No auth/backend yet, so this
// stands in for "the logged-in driver's profile" until that's wired up.

export const CURRENT_DRIVER_PROFILE_FIXTURE = {
  fullName: "Juan Dela Cruz",
  unitNickname: "Bayanihan",
  assignedRouteId: "route-balibago-dau",
  assignedTerminalId: "terminal-balibago-market",
};

// A fake starting position ~650m from the assigned terminal, used only to
// draw a "driver position" marker on the heading-to-terminal map.
export const SIMULATED_DRIVER_START_POSITION = { lat: 15.1755, lng: 120.5835 };

export const QUEUE_POSITION_FIXTURE = 3;

export const GEOFENCE_TRIGGER_DELAY_MS = 6000;

// How long a driver waits in queue before the frontend simulates them
// wandering outside the terminal geofence, and how long the "slot held"
// confirmation stays up before auto-dismissing.
export const QUEUE_EXIT_ALERT_DELAY_MS = 8000;
export const SLOT_HELD_AUTO_DISMISS_MS = 4000;

// Passengers currently in passenger_waiting_state along the driver's route.
// Starts empty — no backend feed wired up yet, so nothing appears until a
// later pass adds a way to simulate passengers showing up.
export const WAITING_PASSENGERS_ALONG_ROUTE_FIXTURE = [];

// The nearest passenger_waiting_state pickup once the driver is en route
// (i.e. after "Go now").
export const NEXT_WAITING_PICKUP_FIXTURE = {
  locationName: "Marisol Southstar Drug",
  distanceMeters: 250,
  etaMinutes: 1,
  waitingPassengerCount: 2,
  mapPositionPercent: { x: 42, y: 27 },
};

// No real geofencing yet — simulates the driver's GPS re-entering the
// terminal after completing a route.
export const TRIP_COMPLETE_TRIGGER_DELAY_MS = 8000;
export const TRIP_TIME_MINUTES_FIXTURE = 47;
export const NEW_QUEUE_SLOT_FIXTURE = 4;
