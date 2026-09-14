import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { getAgentSupabase, sha256Hex } from "@/lib/agent/auth";
import { SUPPORTED_SCOPES } from "@/lib/agent/oauth";

/**
 * API key management.
 *
 * Users can hold several keys now that scopes exist — a read-only key for one
 * assistant and a read-write key for another is the point of having scopes at
 * all. Only the SHA-256 hash is stored; the key itself is shown once.
 */

function generateRawKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `dt_${hex}`;
}

async function requireUser(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// GET /api/settings/ai-key — list this user's keys (never their secrets)
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const service = getAgentSupabase();
  const { data, error } = await service
    .from("user_ai_keys")
    .select("id, name, key_prefix, scopes, created_at, last_used_at")
    .eq("owner_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ keys: data ?? [] });
}

// POST /api/settings/ai-key — mint a new key
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* defaults are fine */ }

  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 60)
      : "Default";

  const requested = Array.isArray(body.scopes) ? body.scopes.map(String) : ["read"];
  const scopes = SUPPORTED_SCOPES.filter((s) => requested.includes(s));
  if (scopes.length === 0) scopes.push("read");

  const rawKey = generateRawKey();
  const keyHash = await sha256Hex(rawKey);
  const keyPrefix = rawKey.slice(0, 11); // "dt_" + first 8 hex chars

  const service = getAgentSupabase();
  const { data, error } = await service
    .from("user_ai_keys")
    .insert({
      owner_id: user.id,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name,
      scopes,
      last_used_at: null,
    })
    .select("id, name, key_prefix, scopes, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The raw key is returned once and is not recoverable afterwards.
  return NextResponse.json({ key: rawKey, ...data });
}

// DELETE /api/settings/ai-key?id=… — revoke one key, or all of them if no id
export async function DELETE(req: Request) {
  const user = await requireUser(req);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  const service = getAgentSupabase();

  let query = service.from("user_ai_keys").delete().eq("owner_id", user.id);
  if (id) query = query.eq("id", id);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
