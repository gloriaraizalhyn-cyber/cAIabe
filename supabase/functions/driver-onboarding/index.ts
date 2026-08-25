// POST /functions/v1/driver-onboarding
// Auth: required (driver JWT — this fills in the driver's OWN profile)
// Body: {
//   route_id: string,
//   home_terminal_id: string,
//   jeep_color?: string,
//   license_photo_base64: string,   // raw base64, no "data:image/..;base64," prefix
//   license_photo_mime?: string     // defaults to "image/jpeg"
// }
//
// Uploads the license photo to the private `license-photos` bucket and
// creates/updates the driver's profile row. verification_status is always
// (re)set to 'pending' here — admin approval is out of scope, so for
// testing you'll still manually flip it to 'approved' in Table Editor,
// same as before.

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAuthedDriverId, getServiceClient } from "../_shared/client.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const driverId = await getAuthedDriverId(req.headers.get("Authorization"));
    if (!driverId) return json({ error: "not authenticated" }, 401);

    const {
      route_id,
      home_terminal_id,
      jeep_color,
      license_photo_base64,
      license_photo_mime,
    } = await req.json() as {
      route_id: string;
      home_terminal_id: string;
      jeep_color?: string;
      license_photo_base64: string;
      license_photo_mime?: string;
    };

    if (!route_id || !home_terminal_id || !license_photo_base64) {
      return json(
        { error: "route_id, home_terminal_id, and license_photo_base64 are required" },
        400,
      );
    }

    const supabase = getServiceClient();

    // Confirm route_id and home_terminal_id are real, to fail with a clear
    // error instead of a confusing foreign-key violation later.
    const { data: route } = await supabase
      .from("routes")
      .select("id")
      .eq("id", route_id)
      .maybeSingle();
    if (!route) return json({ error: "route_id does not exist" }, 400);

    const { data: terminal } = await supabase
      .from("terminals")
      .select("id")
      .eq("id", home_terminal_id)
      .maybeSingle();
    if (!terminal) return json({ error: "home_terminal_id does not exist" }, 400);

    // Decode and upload the license photo
    const mime = license_photo_mime || "image/jpeg";
    const ext = mime.split("/")[1] || "jpg";
    const bytes = base64ToBytes(license_photo_base64);
    const storagePath = `${driverId}/license.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("license-photos")
      .upload(storagePath, bytes, { contentType: mime, upsert: true });

    if (uploadErr) {
      return json({ error: `photo upload failed: ${uploadErr.message}` }, 500);
    }

    // Upsert the driver's profile. Resubmitting always resets status to
    // 'pending' — a driver changing their route/photo should be re-reviewed.
    const { data: driver, error: upsertErr } = await supabase
      .from("drivers")
      .upsert(
        {
          id: driverId,
          route_id,
          home_terminal_id,
          jeep_color: jeep_color ?? null,
          license_photo_url: storagePath, // storage path, not a public URL — bucket is private
          verification_status: "pending",
        },
        { onConflict: "id" },
      )
      .select()
      .single();

    if (upsertErr) return json({ error: upsertErr.message }, 500);

    return json({ driver, message: "Submitted for review." });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
