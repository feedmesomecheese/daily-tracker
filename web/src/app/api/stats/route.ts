import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  // Checkbox lifetime
  const { data: checkboxLifetime, error: err1 } = await supabase
    .from("checkbox_lifetime_stats")
    .select("*")
    .order("metric_id");
  if (err1) return NextResponse.json({ error: err1.message }, { status: 500 });

  // Checkbox streaks
  const { data: checkboxStreaks, error: err2 } = await supabase
    .from("checkbox_streak_stats")
    .select("*")
    .order("metric_id");
  if (err2) return NextResponse.json({ error: err2.message }, { status: 500 });

  // Numeric lifetime
  const { data: numericLifetime, error: err3 } = await supabase
    .from("numeric_lifetime_stats")
    .select("*")
    .order("metric_id");
  if (err3) return NextResponse.json({ error: err3.message }, { status: 500 });

  // Numeric recent windows
  const { data: numericRecent, error: err4 } = await supabase
    .from("numeric_recent_stats")
    .select("*")
    .order("metric_id,window_days");
  if (err4) return NextResponse.json({ error: err4.message }, { status: 500 });

  return NextResponse.json({
    checkbox_lifetime: checkboxLifetime ?? [],
    checkbox_streaks: checkboxStreaks ?? [],
    numeric_lifetime: numericLifetime ?? [],
    numeric_recent: numericRecent ?? [],
  });
}
