import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// This client runs in the browser for auth & client-side calls
export const supabaseBrowser = createClient(url, anonKey, {
  auth: {
    persistSession: true,
  },
});
