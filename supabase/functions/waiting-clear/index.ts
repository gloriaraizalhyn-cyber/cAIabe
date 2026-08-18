// POST /functions/v1/waiting-clear
// Body: { waiting_id: string }
// Called when the passenger taps GO (or by a cleanup job). Marks the row
// cleared and broadcasts so it disappears from the driver's tracker.

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/client.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { waiting_id } = await req.json() as { waiting_id: string };
    if (!waiting_id) return json({ error: "waiting_id is required" }, 400);

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from("passenger_waiting_state")
      .update({ status: "cleared" })
      .eq("id", waiting_id)
      .select()
      .single();

    if (error) return json({ error: error.message }, 500);

    await supabase.channel(`route:${data.route_id}:waiting`).send({
      type: "broadcast",
      event: "passenger_cleared",
      payload: { waiting_id },
    });

    return json({ cleared: true });
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
