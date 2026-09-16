import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { getAgentSupabase, baseUrlFrom } from "@/lib/agent/auth";
import { AGENT_TOOLS } from "@/lib/agent/registry";

/**
 * GET /api/settings/ai-config
 *
 * Everything the AI assistant settings page needs: the connection URLs, the
 * user's keys, the OAuth clients they have approved, and what the agent surface
 * can actually do.
 */
export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const service = getAgentSupabase();

  const [keysResult, connectionsResult] = await Promise.all([
    service
      .from("user_ai_keys")
      .select("id, name, key_prefix, scopes, created_at, last_used_at")
      .eq("owner_id", user.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    service
      .from("oauth_tokens")
      .select("id, client_id, scopes, created_at, last_used_at, expires_at, oauth_clients(client_name)")
      .eq("owner_id", user.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const baseUrl = baseUrlFrom(req);

  type ConnectionRow = {
    id: string;
    client_id: string;
    scopes: string[];
    created_at: string;
    last_used_at: string | null;
    oauth_clients: { client_name: string } | { client_name: string }[] | null;
  };

  const connections = ((connectionsResult.data ?? []) as ConnectionRow[]).map((row) => {
    const client = Array.isArray(row.oauth_clients) ? row.oauth_clients[0] : row.oauth_clients;
    return {
      id: row.id,
      client_name: client?.client_name ?? "Unknown client",
      scopes: row.scopes,
      created_at: row.created_at,
      last_used_at: row.last_used_at,
    };
  });

  return NextResponse.json({
    spec_url: `${baseUrl}/api/ai/openapi`,
    mcp_url: `${baseUrl}/api/mcp`,
    base_url: baseUrl,
    keys: keysResult.data ?? [],
    connections,
    tools: AGENT_TOOLS.map((t) => ({
      name: t.name,
      summary: t.summary,
      read_only: t.readOnly,
    })),
  });
}
