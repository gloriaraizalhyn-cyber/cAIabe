// POST /functions/v1/admin-delete-drivers
// Auth: required — caller must have a row in `admins`.
// Body: { driver_ids: string[] }
//
// Deletes the underlying auth.users account for each driver, not just their
// `drivers` row — "delete driver accounts" means the account is gone. This
// cascades (see schema.sql's `on delete cascade` chain) to `drivers`,
// `queue_entries`, and `driver_live_state` automatically. Their license
// photo in storage is not cleaned up here (out of scope for this pass).
//
// The admin API only deletes one user per call, so a multi-select bulk
// delete loops sequentially and reports per-id results rather than
// all-or-nothing, so one bad id doesn't block deleting the rest.

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAuthedDriverId, getServiceClient } from "../_shared/client.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const callerId = await getAuthedDriverId(req.headers.get("Authorization"));
    if (!callerId) return json({ error: "not authenticated" }, 401);

    const supabase = getServiceClient();

    const { data: adminRow } = await supabase
      .from("admins")
      .select("id")
      .eq("id", callerId)
      .maybeSingle();
    if (!adminRow) return json({ error: "not an admin" }, 403);

    const { driver_ids } = (await req.json().catch(() => ({}))) as { driver_ids?: string[] };
    if (!Array.isArray(driver_ids) || driver_ids.length === 0) {
      return json({ error: "driver_ids must be a non-empty array" }, 400);
    }

    const results = [];
    for (const driverId of driver_ids) {
      const { error } = await supabase.auth.admin.deleteUser(driverId);
      results.push({ id: driverId, error: error?.message ?? null });
    }

    return json({ results });
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
