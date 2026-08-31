import { createClient } from "@supabase/supabase-js";

// These are PUBLIC values, safe to commit and ship in the client bundle: the
// project URL and the publishable (anon) key. All data is protected by
// Row-Level Security on Supabase (a user can only read/write rows where
// user_id = auth.uid()). Overridable via Vite env for other deployments.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://hykdbyizzigtyytzrlyo.supabase.co";
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_Z5rAuMympSwEG9LxyckOnw_RuW9muVQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
