// Remaining placeholder data for the driver dashboard/driving flow. Most of
// this file's old fixtures (fake driver profile, geofence timers, fake
// queue numbers) were replaced by real Supabase Auth/queue_entries/GPS
// wiring — see useDriverSession.js and DriverDashboardPage/NextToGoPage/
// DrivingPage. What's left here has no backend equivalent by design.

// The nearest passenger_waiting_state pickup once the driver is en route.
// There's no per-driver pickup-assignment concept server-side (passengers
// just show up as fuzzed pins broadcast per route), so this stays a fixture.
export const NEXT_WAITING_PICKUP_FIXTURE = {
  locationName: "Marisol Southstar Drug",
  distanceMeters: 250,
  etaMinutes: 1,
  waitingPassengerCount: 2,
  mapPositionPercent: { x: 42, y: 27 },
};
