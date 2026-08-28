import { supabase } from "../../shared/lib/supabaseClient.js";

// 1-indexed position among "waiting"/"next_to_go" entries on the driver's
// own route, ordered the same way the backend's queue-advance function
// orders them (arrival_at ascending). RLS ("driver reads own-route queue")
// already scopes this to the caller's own route.
export async function fetchOwnQueuePosition(routeId, driverId) {
  const { data } = await supabase
    .from("queue_entries")
    .select("id, driver_id, status, arrival_at")
    .eq("route_id", routeId)
    .in("status", ["waiting", "next_to_go"])
    .order("arrival_at", { ascending: true });

  if (!data) return null;
  const index = data.findIndex((entry) => entry.driver_id === driverId);
  return index === -1 ? null : index + 1;
}
