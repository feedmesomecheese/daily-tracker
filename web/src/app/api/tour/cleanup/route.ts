import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const uid = user.id.replace(/-/g, "").slice(0, 8);
  const prefix = `__demo_${uid}_`;

  // Delete log rows before config (FK order)
  const { error: logErr } = await supabaseAdmin
    .from("log")
    .delete()
    .eq("owner_id", user.id)
    .like("metric_id", `${prefix}%`);

  if (logErr) {
    return NextResponse.json({ error: logErr.message }, { status: 500 });
  }

  const { error: configErr } = await supabaseAdmin
    .from("config")
    .delete()
    .eq("owner_id", user.id)
    .like("metric_id", `${prefix}%`);

  if (configErr) {
    return NextResponse.json({ error: configErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
