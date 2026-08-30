// POST /functions/v1/admin-list-drivers
// Auth: required — caller must have a row in `admins`.
// Body: { status?: "pending" | "approved" | "rejected" }  (defaults to "pending")
//
// Returns drivers matching that status with the fields the admin dashboard
// needs but can't get any other way from the client: the applicant's name/
// email/mobile (auth.users isn't exposed via the Data API) and short-lived
// signed URLs for their three verification photos (the bucket is private).

import { corsHeaders, handleOptions } from "../_shared/cors.ts";
import { getAuthedDriverId, getServiceClient } from "../_shared/client.ts";

const DOCUMENT_SIGNED_URL_TTL_SECONDS = 300;

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

    const { status } = (await req.json().catch(() => ({}))) as { status?: string };
    const filterStatus = status ?? "pending";
    if (!["pending", "approved", "rejected"].includes(filterStatus)) {
      return json({ error: "status must be pending, approved, or rejected" }, 400);
    }

    const { data: drivers, error } = await supabase
      .from("drivers")
      .select(
        "id, jeep_color, vehicle_type, license_photo_url, franchise_permit_photo_url, " +
          "vehicle_registration_photo_url, verification_status, rejection_reason, created_at, " +
          "route:routes(id, name, color), terminal:terminals(id, name)",
      )
      .eq("verification_status", filterStatus)
      .order("created_at", { ascending: true });

    if (error) return json({ error: error.message }, 500);

    const enriched = await Promise.all(
      (drivers ?? []).map(async (driver) => {
        const { data: userData } = await supabase.auth.admin.getUserById(driver.id);
        const metadata = userData?.user?.user_metadata ?? {};

        const [licensePhotoSignedUrl, franchisePermitPhotoSignedUrl, vehicleRegistrationPhotoSignedUrl] =
          await Promise.all([
            signUrlFor(supabase, driver.license_photo_url),
            signUrlFor(supabase, driver.franchise_permit_photo_url),
            signUrlFor(supabase, driver.vehicle_registration_photo_url),
          ]);

        return {
          id: driver.id,
          fullName: metadata.full_name ?? null,
          email: userData?.user?.email ?? null,
          mobileNumber: metadata.mobile_number ?? null,
          plateNumber: metadata.plate_number ?? null,
          vehicleRegistrationNumber: metadata.vehicle_registration_number ?? null,
          jeepColor: driver.jeep_color,
          vehicleType: driver.vehicle_type,
          route: driver.route,
          terminal: driver.terminal,
          licensePhotoSignedUrl,
          franchisePermitPhotoSignedUrl,
          vehicleRegistrationPhotoSignedUrl,
          verificationStatus: driver.verification_status,
          rejectionReason: driver.rejection_reason,
          createdAt: driver.created_at,
        };
      }),
    );

    return json({ drivers: enriched });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

async function signUrlFor(
  supabase: ReturnType<typeof getServiceClient>,
  storagePath: string | null,
): Promise<string | null> {
  if (!storagePath) return null;
  const { data } = await supabase.storage
    .from("license-photos")
    .createSignedUrl(storagePath, DOCUMENT_SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
