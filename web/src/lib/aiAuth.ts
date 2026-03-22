import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Validates the Authorization: Bearer <key> header against AI_API_KEY env var.
 * Returns a 401 response if invalid, or null if valid.
 */
export function validateAiKey(req: Request): NextResponse | null {
  const authHeader = req.headers.get("Authorization") || "";
  const key = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader.trim();
  if (!key || key !== process.env.AI_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Returns a Supabase client using the service role key (bypasses RLS).
 */
export function getAiSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Returns the owner_id for AI queries (set via AI_OWNER_ID env var).
 */
export function getAiOwnerId(): string {
  const id = process.env.AI_OWNER_ID;
  if (!id) throw new Error("AI_OWNER_ID env var is not set");
  return id;
}
