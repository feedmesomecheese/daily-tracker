import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const todayISO = new Date().toISOString().slice(0, 10);

  const daysBetween = (d1: string, d2: string) => {
    const t1 = Date.parse(d1);
    const t2 = Date.parse(d2);
    if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 0;
    return Math.floor((t2 - t1) / 86400000);
  };

  // 1) last_log_date
  const { data: bounds, error: boundsError } = await supabase
    .from("log")
    .select("date")
    .eq("owner_id", user.id);

  if (boundsError) {
    return NextResponse.json({ error: boundsError.message }, { status: 500 });
  }

  let last_log_date: string | null = null;
  if (bounds && bounds.length > 0) {
    last_log_date = bounds
      .map((r) => r.date as string)
      .sort()
      .at(-1)!;
  }

  // 2) required metrics
  const { data: reqMetrics, error: reqError } = await supabase
    .from("config")
    .select("metric_id, required, required_since, start_date, active")
    .eq("owner_id", user.id)
    .eq("active", true)
    .eq("required", true);

  if (reqError) {
    return NextResponse.json({ error: reqError.message }, { status: 500 });
  }

  const required = reqMetrics ?? [];
  const requiredCount = required.length;

  // If nothing is required, keep it simple
  if (requiredCount === 0) {
    return NextResponse.json({
      today: todayISO,
      last_log_date,
      last_required_complete_date: null,
      suggested_date: last_log_date || todayISO,
      missing_required_days: 0,
      required_days_completed: 0,
      required_days_possible: 0,
    });
  }

  let last_required_complete_date: string | null = null;
  let missing_required_days = 0;
  let suggested_date = todayISO;
  let required_days_completed = 0;
  let required_days_possible = 0;

  // earliest date when any required metric becomes required
  const effectiveStarts = required
    .map(
      (m) => (m.required_since as string) || (m.start_date as string)
    )
    .filter(Boolean) as string[];

  if (effectiveStarts.length > 0) {
    const minEffective = effectiveStarts.sort()[0];

    const { data: rows, error: logError } = await supabase
      .from("log")
      .select("date, metric_id")
      .eq("owner_id", user.id)
      .gte("date", minEffective)
      .in(
        "metric_id",
        required.map((m) => m.metric_id)
      );

    if (logError) {
      return NextResponse.json({ error: logError.message }, { status: 500 });
    }

    // date -> set of metric_ids with rows
    const byDate: Record<string, Set<string>> = {};
    for (const row of rows ?? []) {
      const d = row.date as string;
      const mid = row.metric_id as string;
      if (!byDate[d]) byDate[d] = new Set();
      byDate[d].add(mid);
    }

    const dates = Object.keys(byDate).sort();

    // last date where all required metrics are present
    for (const d of dates) {
      const set = byDate[d];
      if (set.size === requiredCount) {
        last_required_complete_date = d;
      }
    }

    // ---- coverage stats (all-time required coverage) ----
    let requiredStart: string | null = null;
    for (const m of reqMetrics ?? []) {
      if (!m.required_since) continue;
      if (!requiredStart || m.required_since < requiredStart) {
        requiredStart = m.required_since;
      }
    }

    if (requiredStart && requiredCount > 0) {
      // inclusive possible days from requiredStart to today
      required_days_possible = daysBetween(requiredStart, todayISO) + 1;

      for (const d of dates) {
        if (d < requiredStart) continue;
        const set = byDate[d];
        if (set && set.size === requiredCount) {
          required_days_completed += 1;
        }
      }
    }
  }

  // ---- gap + suggested date logic ----
  if (last_required_complete_date) {
    // how many days strictly between last complete day and today?
    // example: last=2025-12-03, today=2025-12-04 -> diff=1 -> missing=0
    const diff = daysBetween(last_required_complete_date, todayISO);
    const missing = Math.max(0, diff - 1);

    missing_required_days = missing;

    // candidate next date is always "day after last complete required day",
    // clamped to today
    const d = new Date(last_required_complete_date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    const candidate = d.toISOString().slice(0, 10);
    suggested_date = candidate > todayISO ? todayISO : candidate;
  } else if (last_log_date) {
    // no fully complete required day yet
    const candidate = last_log_date > todayISO ? todayISO : last_log_date;
    suggested_date = candidate;
  } else {
    // no logs at all
    suggested_date = todayISO;
  }

  return NextResponse.json({
    today: todayISO,
    last_log_date,
    last_required_complete_date,
    suggested_date,
    missing_required_days,
    required_days_completed,
    required_days_possible,
  });
}
