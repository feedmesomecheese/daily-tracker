import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const url = new URL(req.url);
  const date = url.searchParams.get("date");

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let q = supabase
    .from("log")
    .select("date,metric_id,value")
    .eq("owner_id", user.id)
    .order("date", { ascending: true })
    .order("metric_id", { ascending: true });

  if (date) {
    q = q.eq("date", date);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
