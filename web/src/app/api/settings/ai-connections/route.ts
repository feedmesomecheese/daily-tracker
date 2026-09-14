import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { getAgentSupabase } from "@/lib/agent/auth";

/**
 * DELETE /api/settings/ai-connections?id=…
 *
 * Revokes an OAuth connection. The client's tokens stop working immediately;
 * reconnecting requires going through consent again.
 */
export async function DELETE(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const service = getAgentSupabase();

  // Look up the token row first so every token that client holds for this user
  // is revoked, not just the one the settings page happened to list.
  const { data: token } = await service
    .from("oauth_tokens")
    .select("client_id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!token) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  const { error: revokeError } = await service
    .from("oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("owner_id", user.id)
    .eq("client_id", token.client_id)
    .is("revoked_at", null);

  if (revokeError) return NextResponse.json({ error: revokeError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
