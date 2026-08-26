import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "Supabase env vars are missing (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). " +
      "Copy frontend/.env.local.example to frontend/.env.local and fill them in."
  );
}

// Client-side only: uses the anon key, so access is governed by the
// database's Row Level Security policies, not by anything in this file.
export const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "");
