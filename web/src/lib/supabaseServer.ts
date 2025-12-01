import { createClient } from "@supabase/supabase-js";

/**
 * Build a Supabase client for API routes using the anon key
 * and the Authorization header from the incoming request.
 *
 * This ensures RLS (auth.uid()) is evaluated based on the
 * logged-in user that called the route.
 */
export function supabaseServerFromRequest(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const authHeader = req.headers.get("Authorization") || "";

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      persistSession: false,
    },
  });
}
