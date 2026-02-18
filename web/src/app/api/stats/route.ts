import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { getLocalDateString, addDays, getServerTimezone } from "@/lib/dateUtils";

type CheckboxStreakRow = {
  metric_id: string;
  current_streak_true: number;
  longest_streak_true: number;
};

type CountStreakRow = {
  metric_id: string;
  metric_name: string | null;
  private: boolean | null;
  active: boolean | null;
  current_streak: number;
  longest_streak: number;
  total_count: number;
  days_with_value: number;
};

type StatsResponse = {
  checkbox_streaks: CheckboxStreakRow[];
  count_streaks: CountStreakRow[];
};

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const tz = await getServerTimezone();

  // 1) Get checkbox and count metrics for this user
  const { data: metrics, error: configError } = await supabase
    .from("config")
    .select("metric_id, metric_name, type, active, private, start_date")
    .eq("owner_id", user.id)
    .eq("active", true)
    .in("type", ["checkbox", "count"]);

  if (configError) {
    return NextResponse.json(
      { error: `Failed to load config: ${configError.message}` },
      { status: 500 }
    );
  }

  const allMetrics = (metrics ?? []).filter((m: { private?: boolean }) => !m.private);
  const checkboxMetrics = allMetrics.filter((m: { type: string }) => m.type === "checkbox");
  const countMetrics = allMetrics.filter((m: { type: string }) => m.type === "count");
  const metricIds = allMetrics.map((m: { metric_id: string }) => m.metric_id);

  if (metricIds.length === 0) {
    const empty: StatsResponse = { checkbox_streaks: [], count_streaks: [] };
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

  const today = getLocalDateString(new Date(), tz);
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

  // Calculate count metrics streaks (based on non-zero values)
  const countResults: CountStreakRow[] = [];

  for (const m of countMetrics) {
    const metric_id = m.metric_id;
    const rows = byMetric.get(metric_id) ?? [];

    if (rows.length === 0) {
      countResults.push({
        metric_id,
        metric_name: m.metric_name ?? null,
        private: m.private ?? null,
        active: m.active ?? null,
        current_streak: 0,
        longest_streak: 0,
        total_count: 0,
        days_with_value: 0,
      });
      continue;
    }

    // Build a set of dates with non-zero values and sum total
    const nonZeroDates = new Set<string>();
    let earliestDate = today;
    let totalCount = 0;

    for (const r of rows) {
      const d = r.date as string;
      if (d < earliestDate) earliestDate = d;
      const val = Number(r.value);
      if (!isNaN(val) && val !== 0) {
        nonZeroDates.add(d);
        totalCount += val;
      }
    }

    if (m.start_date && m.start_date < earliestDate) {
      earliestDate = m.start_date;
    }

    // Walk from earliestDate to today for streak calculation
    let curDate = earliestDate;
    let currentStreak = 0;
    let longestStreak = 0;

    while (curDate <= today) {
      if (nonZeroDates.has(curDate)) {
        currentStreak += 1;
        if (currentStreak > longestStreak) {
          longestStreak = currentStreak;
        }
      } else {
        currentStreak = 0;
      }
      curDate = addDays(curDate, 1);
    }

    countResults.push({
      metric_id,
      metric_name: m.metric_name ?? null,
      private: m.private ?? null,
      active: m.active ?? null,
      current_streak: currentStreak,
      longest_streak: longestStreak,
      total_count: totalCount,
      days_with_value: nonZeroDates.size,
    });
  }

  const resp: StatsResponse = {
    checkbox_streaks: results,
    count_streaks: countResults,
  };

  return NextResponse.json(resp);
}
