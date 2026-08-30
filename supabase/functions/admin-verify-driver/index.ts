// POST /functions/v1/admin-verify-driver
// Auth: required — caller must have a row in `admins`.
// Body: {
//   driver_id: string, status: "approved" | "rejected",
//   rejection_reason?: string,  // required when status is "rejected"
// }

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

    const { driver_id, status, rejection_reason } = (await req.json()) as {
      driver_id?: string;
      status?: string;
      rejection_reason?: string;
    };

    if (!driver_id || !status) {
      return json({ error: "driver_id and status are required" }, 400);
    }
    if (!["approved", "rejected"].includes(status)) {
      return json({ error: "status must be approved or rejected" }, 400);
    }
    if (status === "rejected" && !rejection_reason?.trim()) {
      return json({ error: "rejection_reason is required when rejecting a driver" }, 400);
    }

    const { data: driver, error } = await supabase
      .from("drivers")
      .update({
        verification_status: status,
        rejection_reason: status === "rejected" ? rejection_reason!.trim() : null,
      })
      .eq("id", driver_id)
      .select()
      .single();

    if (error) return json({ error: error.message }, 500);

    return json({ driver });
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
