// POST /functions/v1/driver-notify-wait
// Auth: required (driver JWT)
// Body: none — uses the calling driver's own route_id.
//
// Backs NextToGoCard's "Wait for more" button (see NextToGoPage.jsx): the
// product spec asks that choosing WAIT tell already-waiting passengers this
// unit likely won't leave soon, WITHOUT ever revealing the driver's current
// passenger count. This broadcasts exactly that — a fixed delay estimate,
// no counts, no driver identity beyond the route itself — to every
// passenger currently waiting on this route.

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAuthedDriverId, getServiceClient } from "../_shared/client.ts";

// Matches the spec's own wording ("not likely to arrive in ~30 minutes").
// Not a promise — just the same fixed heads-up every "wait" notice gives.
const ESTIMATED_DELAY_MINUTES = 30;

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const driverId = await getAuthedDriverId(req.headers.get("Authorization"));
    if (!driverId) return json({ error: "not authenticated" }, 401);

    const supabase = getServiceClient();

    const { data: driver, error: driverErr } = await supabase
      .from("drivers")
      .select("route_id")
      .eq("id", driverId)
      .single();
    if (driverErr || !driver) return json({ error: "driver not found" }, 404);
    if (!driver.route_id) return json({ error: "driver has no assigned route" }, 400);

    await supabase.channel(`route:${driver.route_id}:waiting`).send({
      type: "broadcast",
      event: "driver_wait_notice",
      payload: { estimated_delay_minutes: ESTIMATED_DELAY_MINUTES },
    });

    return json({ notified: true, estimated_delay_minutes: ESTIMATED_DELAY_MINUTES });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
