// POST /functions/v1/driver-idle-response
// Auth: required (driver JWT)
// Body: { response: "engine_off", minutes?: number }
//
// The driver tapped the big "ENGINE OFF" button on the roadside-idle prompt
// (see IdleEngineOffToast.jsx). Marks the driver's current roadside_idle
// episode (logged by driver-demand-check) with the minute the engine went
// off. From then on, driver-demand-check counts the rest of the episode as
// fuel SAVED instead of fuel wasted — see logRoadsideIdleEpisode there.
//
// This is self-reported, so the UI always labels the saving "estimated".

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAuthedDriverId, getServiceClient } from "../_shared/client.ts";

// An episode is only "current" if driver-demand-check touched it recently
// (it polls roughly every 30 s while the driver is stopped).
const CURRENT_EPISODE_MAX_AGE_MS = 3 * 60 * 1000;
const MAX_MINUTES = 240;

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const driverId = await getAuthedDriverId(req.headers.get("Authorization"));
    if (!driverId) return json({ error: "not authenticated" }, 401);

    const { response, minutes } = await req.json().catch(() => ({})) as {
      response?: string;
      minutes?: number;
    };
    if (response !== "engine_off") return json({ error: "response must be 'engine_off'" }, 400);

    const supabase = getServiceClient();

    const { data: episode, error } = await supabase
      .from("carbon_impact_events")
      .select("id, minutes")
      .eq("kind", "roadside_idle")
      .eq("driver_id", driverId)
      .is("engine_off_after_minutes", null)
      .gte("updated_at", new Date(Date.now() - CURRENT_EPISODE_MAX_AGE_MS).toISOString())
      .order("episode_started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!episode) return json({ recorded: false });

    // Prefer the client's live timer (the server's figure can be ~30 s stale);
    // never record less than what was already logged.
    const reported = typeof minutes === "number" && isFinite(minutes) ? minutes : 0;
    const engineOffAfter = Math.min(MAX_MINUTES, Math.max(Number(episode.minutes) || 0, reported));

    const { error: updateErr } = await supabase
      .from("carbon_impact_events")
      .update({ engine_off_after_minutes: engineOffAfter, updated_at: new Date().toISOString() })
      .eq("id", episode.id);
    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ recorded: true, engine_off_after_minutes: Math.round(engineOffAfter * 100) / 100 });
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
