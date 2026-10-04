import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// A second client, used ONLY by the demo stage page, holding a driver
// session of its own.
//
// The stage needs driver-scoped calls (driver-demand-check for the waiting
// dots and clusters on the god map, driver-capacity-toggle for the "Mark
// FULL" lever), but it must not put a driver session on the shared default
// client — that one is what the stage uses for plain anon reads, and it's
// also the session a developer would find themselves holding afterwards if
// they opened /driver/dashboard normally in the same browser.
//
// Its own storageKey keeps it isolated from the default client AND from
// both iframes (which use sb-caiabe-demo-passenger / -driver, see
// shared/lib/supabaseClient.js).
export const demoStageClient = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "", {
  auth: { storageKey: "sb-caiabe-demo-stage" },
});

export async function signInDemoStageDriver(email, password) {
  const { data } = await demoStageClient.auth.getSession();
  if (data.session?.user?.email?.toLowerCase() === email.toLowerCase()) {
    return { ok: true, session: data.session };
  }

  if (data.session) await demoStageClient.auth.signOut();

  const { data: signedIn, error } = await demoStageClient.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, session: signedIn.session };
}
