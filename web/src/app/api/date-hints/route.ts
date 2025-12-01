import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  // Get the logged-in user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const owner_id = user.id;

  // Today in YYYY-MM-DD (UTC is fine for this high-level summary)
  const today = new Date().toISOString().slice(0, 10);

  // 1) Last date with any log row for this user
  const { data: lastRow, error: lastErr } = await supabase
    .from("log")
    .select("date")
    .eq("owner_id", owner_id)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastErr) {
    return NextResponse.json({ error: lastErr.message }, { status: 500 });
  }

  const last_log_date: string | null = lastRow?.date ?? null;

  // 2) Required metrics from config
  const { data: cfg, error: cfgErr } = await supabase
    .from("config")
    .select("metric_id")
    .eq("owner_id", owner_id)
    .eq("required", true)
    .eq("active", true);

  if (cfgErr) {
    return NextResponse.json({ error: cfgErr.message }, { status: 500 });
  }

  const requiredIds = (cfg ?? []).map((c) => c.metric_id as string);
  const requiredCount = requiredIds.length;

  // If nothing is required, just suggest today and bail out
  if (requiredCount === 0) {
    return NextResponse.json({
      today,
      last_log_date,
      last_required_complete_date: null,
      suggested_date: today,
      missing_required_days: 0,
    });
  }

  // 3) For all rows involving required metrics, find dates where *all* required ids appear
  const { data: rows, error: rowsErr } = await supabase
    .from("log")
    .select("date, metric_id")
    .eq("owner_id", owner_id)
    .in("metric_id", requiredIds);

  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 });
  }

  // Build map: date -> Set of required metrics present
  const byDate = new Map<string, Set<string>>();

  for (const row of rows ?? []) {
    const d = row.date as string;
    const m = row.metric_id as string;
    if (!byDate.has(d)) byDate.set(d, new Set());
    byDate.get(d)!.add(m);
  }

  let last_required_complete_date: string | null = null;

  // Any date whose set size equals the number of required metrics counts as “complete”
  for (const [d, set] of Array.from(byDate.entries())) {
    if (set.size === requiredCount) {
      if (!last_required_complete_date || d > last_required_complete_date) {
        last_required_complete_date = d;
      }
    }
  }

  // 4) Suggested date:
  //    - If we’ve ever completed a required day, suggest that day + 1
  //    - Otherwise, fall back to today
  let suggested_date = today;
  if (last_required_complete_date) {
    const next = new Date(last_required_complete_date);
    next.setDate(next.getDate() + 1);

    suggested_date = next.toISOString().slice(0, 10);
  }

  // 5) Missing days (rough estimate between last_required_complete_date and today)
  let missing_required_days = 0;
  if (last_required_complete_date) {
    const start = new Date(last_required_complete_date);
    const end = new Date(today);
    const diffMs = end.getTime() - start.getTime();
    missing_required_days = Math.max(0, Math.floor(diffMs / 86400000));
  }

  return NextResponse.json({
    today,
    last_log_date,
    last_required_complete_date,
    suggested_date,
    missing_required_days,
  });
}
