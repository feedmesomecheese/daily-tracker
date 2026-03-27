import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const AI_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function handleAiOptions() {
  return new NextResponse(null, { status: 204, headers: AI_CORS_HEADERS });
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

async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validates the Authorization: Bearer <key> header.
 *
 * Lookup order:
 *   1. user_ai_keys table — key hash matched → returns that user's owner_id
 *   2. AI_API_KEY env var + AI_OWNER_ID env var — legacy single-user fallback
 *
 * Returns { ownerId } on success, or a 401 NextResponse on failure.
 */
export async function validateAiRequest(
  req: Request
): Promise<{ ownerId: string } | NextResponse> {
  const authHeader = req.headers.get("Authorization") || "";
  const key = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: AI_CORS_HEADERS });
  }

  // 1. DB lookup
  const supabase = getAiSupabase();
  const keyHash = await hashKey(key);

  const { data: keyRow } = await supabase
    .from("user_ai_keys")
    .select("owner_id")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (keyRow?.owner_id) {
    // Update last_used_at asynchronously — don't block the response
    supabase
      .from("user_ai_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("key_hash", keyHash)
      .then(() => {});

    return { ownerId: keyRow.owner_id };
  }

  // 2. Env var fallback (existing single-user setup)
  const envKey = process.env.AI_API_KEY;
  const envOwnerId = process.env.AI_OWNER_ID;
  if (envKey && envOwnerId && key === envKey) {
    return { ownerId: envOwnerId };
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: AI_CORS_HEADERS });
}

/**
 * @deprecated Use validateAiRequest() which supports per-user keys.
 * Kept for any callers that haven't migrated yet.
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
 * @deprecated Use validateAiRequest() which returns ownerId directly.
 */
export function getAiOwnerId(): string {
  const id = process.env.AI_OWNER_ID;
  if (!id) throw new Error("AI_OWNER_ID env var is not set");
  return id;
}
