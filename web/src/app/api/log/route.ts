import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const url = new URL(req.url);
  const date = url.searchParams.get("date");

  let q = supabase
    .from("log")
    .select("date,metric_id,value")
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
