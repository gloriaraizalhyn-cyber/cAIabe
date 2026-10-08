import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "Supabase env vars are missing (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). " +
      "Copy frontend/.env.local.example to frontend/.env.local and fill them in."
  );
}

// The demo stage (/demo/stage) runs the passenger app and the driver app as
// two same-origin iframes side by side. Same origin means they'd otherwise
// share one auth entry in localStorage, so the driver signing in would put
// that driver's JWT on the passenger frame's functions.invoke() and rpc()
// calls too. Passenger pages never read auth, but they do call
// get_route_visible_drivers and the waiting-* functions, and those should go
// out as anon exactly like they do for a real passenger. Giving each frame
// its own storageKey keeps the two sessions completely independent.
//
// Inert outside the demo: with no ?demoFrame= in the URL this is the same
// default-storage client it has always been.
const demoParams =
  typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
const demoFrame = demoParams?.get("demoFrame") ?? null;
// The stage can hold TWO driver frames (grey and yellow) that are both
// demoFrame=driver. They need separate logins too, or signing one driver in
// would replace the other's session in the shared storage entry. ?demoSlot=
// names the frame ("grey" | "yellow") and is part of the storage key.
const demoSlot = demoParams?.get("demoSlot") ?? null;

// Client-side only: uses the anon key, so access is governed by the
// database's Row Level Security policies, not by anything in this file.
export const supabase = createClient(
  SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY ?? "",
  demoFrame
    ? { auth: { storageKey: `sb-caiabe-demo-${demoFrame}${demoSlot ? `-${demoSlot}` : ""}` } }
    : undefined
);
