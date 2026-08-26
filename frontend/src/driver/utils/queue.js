import { supabase } from "../../shared/lib/supabaseClient.js";

// Fetches everything the dashboard/next-to-go screens need about the
// caller's own queue standing in one query: their 1-indexed position among
// "waiting"/"next_to_go" entries (ordered the same way the backend's
// queue-advance function orders them — arrival_at ascending), their real
// status (including "driving", so callers can detect promotion), and the
// notified_at/responded_at pair that drives the next-2 turn alert. RLS
// ("driver reads own-route queue") already scopes the underlying rows to
// the caller's own route.
export async function fetchOwnQueueEntry(routeId, driverId) {
  const { data } = await supabase
    .from("queue_entries")
    .select("id, driver_id, status, arrival_at, notified_at, responded_at")
    .eq("route_id", routeId)
    .in("status", ["waiting", "next_to_go", "driving"])
    .order("arrival_at", { ascending: true });

  if (!data) return null;

  const own = data.find((entry) => entry.driver_id === driverId);
  if (!own) return null;

  const queueOnly = data.filter((entry) => entry.status !== "driving");
  const positionIndex = queueOnly.findIndex((entry) => entry.driver_id === driverId);

  return {
    status: own.status,
    notifiedAt: own.notified_at,
    respondedAt: own.responded_at,
    position: positionIndex === -1 ? null : positionIndex + 1,
  };
}
