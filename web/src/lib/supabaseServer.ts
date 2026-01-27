import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Create a Supabase client for Server Components and API routes.
 * Uses cookies for session management, which is more reliable on mobile.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing sessions.
        }
      },
    },
  });
}

/**
 * Build a Supabase client for API routes using the anon key
 * and the Authorization header from the incoming request.
 *
 * This is a fallback for API routes that receive Bearer tokens
 * (for backward compatibility with existing client code).
 */
export function supabaseServerFromRequest(req: Request) {
  const { createClient } = require("@supabase/supabase-js");

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
