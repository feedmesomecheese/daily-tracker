import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// This client runs in the browser and uses cookies for session persistence
// which is more reliable on mobile browsers than localStorage
export const supabaseBrowser = createBrowserClient(url, anonKey);
