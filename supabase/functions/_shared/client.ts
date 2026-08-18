import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Service-role client: bypasses RLS entirely. Use this ONLY inside Edge
// Functions (never shipped to a browser/frontend) for operations that must
// write regardless of who's calling — e.g. passenger waiting-state writes,
// since passengers have no login/JWT to satisfy a user-scoped policy.
export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// User-scoped client: forwards the caller's JWT so RLS policies (e.g.
// "driver reads own-route queue") are enforced. Use this whenever the
// action should be constrained to whoever is authenticated.
export function getUserClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

// Pulls driver_id (== auth.uid()) out of the caller's JWT via the user
// client. Returns null if the request isn't authenticated.
export async function getAuthedDriverId(
  authHeader: string | null,
): Promise<string | null> {
  if (!authHeader) return null;
  const client = getUserClient(authHeader);
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}
