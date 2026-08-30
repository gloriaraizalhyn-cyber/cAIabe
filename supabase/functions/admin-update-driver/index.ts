// POST /functions/v1/admin-update-driver
// Auth: required — caller must have a row in `admins`.
// Body: {
//   driver_id: string,
//   full_name?: string, mobile_number?: string,
//   plate_number?: string, vehicle_registration_number?: string,
//   jeep_color?: string, vehicle_type?: string,
//   route_id?: string | null, home_terminal_id?: string | null,
// }
//
// Splits the edit across two backends: the applicant-info fields live in
// auth.users.user_metadata (only the admin API can write those), the rest
// live directly on `drivers`. These are the only four metadata keys the
// driver-onboarding flow ever sets (see DriverRegistrationPage.jsx), so
// replacing user_metadata wholesale here is safe — there's nothing else in
// it to clobber.

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

    const body = (await req.json().catch(() => ({}))) as {
      driver_id?: string;
      full_name?: string;
      mobile_number?: string;
      plate_number?: string;
      vehicle_registration_number?: string;
      jeep_color?: string;
      vehicle_type?: string;
      route_id?: string | null;
      home_terminal_id?: string | null;
    };

    if (!body.driver_id) return json({ error: "driver_id is required" }, 400);

    const { error: metadataError } = await supabase.auth.admin.updateUserById(body.driver_id, {
      user_metadata: {
        full_name: body.full_name ?? null,
        mobile_number: body.mobile_number ?? null,
        plate_number: body.plate_number ?? null,
        vehicle_registration_number: body.vehicle_registration_number ?? null,
      },
    });
    if (metadataError) return json({ error: metadataError.message }, 500);

    const { data: driver, error: driverError } = await supabase
      .from("drivers")
      .update({
        jeep_color: body.jeep_color ?? null,
        vehicle_type: body.vehicle_type ?? null,
        route_id: body.route_id || null,
        home_terminal_id: body.home_terminal_id || null,
      })
      .eq("id", body.driver_id)
      .select("id, jeep_color, vehicle_type, verification_status, route:routes(id, name, color), terminal:terminals(id, name)")
      .single();

    if (driverError) return json({ error: driverError.message }, 500);

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
