import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";

// GET /api/settings/ai-config
// Returns AI integration config for the settings page.
export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: keyRow } = await service
    .from("user_ai_keys")
    .select("key_prefix, last_used_at")
    .eq("owner_id", user.id)
    .maybeSingle();

  const host = req.headers.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const specUrl = `${protocol}://${host}/api/ai/openapi`;

  return NextResponse.json({
    key_prefix: keyRow?.key_prefix ?? null,
    key_last_used_at: keyRow?.last_used_at ?? null,
    spec_url: specUrl,
  });
}
