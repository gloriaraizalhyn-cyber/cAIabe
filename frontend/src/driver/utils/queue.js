import { supabase } from "../../shared/lib/supabaseClient.js";

// Fetches everything the dashboard/next-to-go screens need about the
// caller's own queue standing in one query: their 1-indexed position among
// "waiting"/"next_to_go" entries (ordered the same way the backend's
// queue-advance function orders them — arrival_at ascending), their real
// status (including "driving" and "temporarily_away", so callers can detect
// promotion and away-state), their geofence_status (inside/outside the
// terminal — see driver-location-update), and the notified_at/responded_at
// pair that drives the turn alert. RLS ("driver reads own-route queue")
// already scopes the underlying rows to the caller's own route.
export async function fetchOwnQueueEntry(routeId, driverId) {
  const { data } = await supabase
    .from("queue_entries")
    .select("id, driver_id, status, arrival_at, notified_at, responded_at, geofence_status")
    .eq("route_id", routeId)
    .in("status", ["waiting", "next_to_go", "driving", "temporarily_away"])
    .order("arrival_at", { ascending: true });

  if (!data) return null;

  const own = data.find((entry) => entry.driver_id === driverId);
  if (!own) return null;

  // Position numbering only makes sense among drivers actively holding a
  // FIFO slot — "driving" (already dispatched) and "temporarily_away"
  // (voluntarily forfeited their slot until they physically return) are
  // both excluded from the count.
  const queueOnly = data.filter((entry) => entry.status === "waiting" || entry.status === "next_to_go");
  const positionIndex = queueOnly.findIndex((entry) => entry.driver_id === driverId);

  return {
    status: own.status,
    notifiedAt: own.notified_at,
    respondedAt: own.responded_at,
    geofenceStatus: own.geofence_status,
    position: positionIndex === -1 ? null : positionIndex + 1,
  };
}
