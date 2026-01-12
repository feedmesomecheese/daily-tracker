import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let q = supabase
    .from("log")
    .select("date,metric_id,value,value_text")
    .eq("owner_id", user.id);

  if (date) {
    q = q.eq("date", date);
  } else if (start && end) {
    q = q.gte("date", start).lte("date", end);
  } else {
    return NextResponse.json({ error: "Provide ?date=YYYY-MM-DD or ?start=YYYY-MM-DD&end=YYYY-MM-DD" }, { status: 400 });
  }

  q = q.order("date", { ascending: true });


  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
