import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type CheckboxStreakRow = {
  metric_id: string;
  current_streak_true: number;
  longest_streak_true: number;
};

type StatsResponse = {
  checkbox_streaks: CheckboxStreakRow[];
};

function addDays(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 1) Get checkbox metrics for this user
  const { data: metrics, error: configError } = await supabase
    .from("config")
    .select("metric_id, type, active, private, start_date")
    .eq("owner_id", user.id)
    .eq("active", true)
    .eq("type", "checkbox");

  if (configError) {
    return NextResponse.json(
      { error: `Failed to load config: ${configError.message}` },
      { status: 500 }
    );
  }

  const checkboxMetrics = (metrics ?? []).filter((m) => !m.private);
  const metricIds = checkboxMetrics.map((m) => m.metric_id);

  if (metricIds.length === 0) {
    const empty: StatsResponse = { checkbox_streaks: [] };
    return NextResponse.json(empty);
  }

  // 2) Load all logs for these metrics for this user
  const { data: logs, error: logError } = await supabase
    .from("log")
    .select("metric_id, date, value")
    .eq("owner_id", user.id)
    .in("metric_id", metricIds)
    .order("metric_id", { ascending: true })
    .order("date", { ascending: true });

  if (logError) {
    return NextResponse.json(
      { error: `Failed to load logs: ${logError.message}` },
      { status: 500 }
    );
  }

  type LogRow = { metric_id: string; date: string; value: any };

  const byMetric = new Map<string, LogRow[]>();
  for (const row of (logs ?? []) as LogRow[]) {
    if (!byMetric.has(row.metric_id)) byMetric.set(row.metric_id, []);
    byMetric.get(row.metric_id)!.push(row);
  }

  const today = todayISO();
  const results: CheckboxStreakRow[] = [];

  for (const m of checkboxMetrics) {
    const metric_id = m.metric_id;
    const rows = byMetric.get(metric_id) ?? [];

    if (rows.length === 0) {
      results.push({
        metric_id,
        current_streak_true: 0,
        longest_streak_true: 0,
      });
      continue;
    }

    // Build a map of date -> bool (true when value is truthy)
    const trueDates = new Set<string>();
    let earliestDate = today;

    for (const r of rows) {
      const d = r.date as string;
      if (d < earliestDate) earliestDate = d;
      const isTrue = !!r.value && Number(r.value) !== 0;
      if (isTrue) {
        trueDates.add(d);
      }
    }

    // Optionally, we could use m.start_date as a lower bound
    if (m.start_date && m.start_date < earliestDate) {
      earliestDate = m.start_date;
    }

    // Walk from earliestDate to today, day by day
    let curDate = earliestDate;
    let currentStreak = 0;
    let longestStreak = 0;

    while (curDate <= today) {
      if (trueDates.has(curDate)) {
        currentStreak += 1;
        if (currentStreak > longestStreak) {
          longestStreak = currentStreak;
        }
      } else {
        currentStreak = 0;
      }
      curDate = addDays(curDate, 1);
    }

    results.push({
      metric_id,
      current_streak_true: currentStreak,
      longest_streak_true: longestStreak,
    });
  }

  const resp: StatsResponse = {
    checkbox_streaks: results,
  };

  return NextResponse.json(resp);
}
