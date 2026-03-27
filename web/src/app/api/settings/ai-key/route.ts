import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
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

function generateRawKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `dt_${hex}`;
}

// POST /api/settings/ai-key — generate a new key (revokes any existing one)
export async function POST(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const rawKey = generateRawKey();
  const keyHash = await hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 11); // "dt_" + first 8 hex chars

  // Use service role to upsert (owner_id is unique — replaces any existing key)
  const service = getServiceClient();
  const { error: upsertErr } = await service
    .from("user_ai_keys")
    .upsert(
      { owner_id: user.id, key_hash: keyHash, key_prefix: keyPrefix, last_used_at: null },
      { onConflict: "owner_id" }
    );

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  // Return the raw key once — it is never stored and cannot be recovered
  return NextResponse.json({ key: rawKey, key_prefix: keyPrefix });
}

// DELETE /api/settings/ai-key — revoke current key
export async function DELETE(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const service = getServiceClient();
  const { error: delErr } = await service
    .from("user_ai_keys")
    .delete()
    .eq("owner_id", user.id);

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
