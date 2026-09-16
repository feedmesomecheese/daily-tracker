import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { getAgentSupabase } from "@/lib/agent/auth";

/**
 * GET /api/settings/ai-activity
 *
 * Recent agent calls against this account. This is the answer to "what did my
 * assistant actually change?" — the reason the audit log exists.
 */
export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "25", 10) || 25, 100);
  const writesOnly = url.searchParams.get("writes") === "true";

  const service = getAgentSupabase();

  let query = service
    .from("agent_audit_log")
    .select("id, tool, transport, auth_method, read_only, args, status, error, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (writesOnly) query = query.eq("read_only", false);

  const { data, error: queryError } = await query;
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 });

  return NextResponse.json({ activity: data ?? [] });
}
