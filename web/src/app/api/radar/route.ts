import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type MetricStats = {
  metric_id: string;
  metric_name: string;
  min: number;
  max: number;
  avg: number;
  values: { date: string; value: number }[];
  higher_is_better: boolean;
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

  const url = new URL(req.url);
  const metricIds = url.searchParams.get("metrics")?.split(",").filter(Boolean) || [];
  const view = url.searchParams.get("view") || "average"; // "day", "7d", "30d", "average"
  const date = url.searchParams.get("date"); // For single day view
  const compareDate = url.searchParams.get("compare_date"); // Optional comparison date

  if (metricIds.length === 0) {
    return NextResponse.json({ error: "No metrics specified" }, { status: 400 });
  }

  // Calculate date range for log fetch (only fetch what we need)
  let startDateForLogs: string | undefined;
  if (view === "7d" || view === "30d" || view === "day") {
    const refDate = new Date((date || compareDate || new Date().toISOString().slice(0, 10)) + "T00:00:00");
    const daysBack = view === "30d" ? 60 : view === "7d" ? 14 : 1; // Extra buffer for comparison
    refDate.setDate(refDate.getDate() - daysBack);
    startDateForLogs = refDate.toISOString().slice(0, 10);
  }

  // Run queries in parallel
  const [configResult, logResult] = await Promise.all([
    // Get metric config
    supabase
      .from("config")
      .select("metric_id, metric_name, analytics_config")
      .eq("owner_id", user.id)
      .in("metric_id", metricIds),
    // Get log data for selected metrics (with date filter if applicable)
    (() => {
      let q = supabase
        .from("log")
        .select("date, metric_id, value")
        .eq("owner_id", user.id)
        .in("metric_id", metricIds)
        .not("value", "is", null)
        .order("date", { ascending: false });

      if (startDateForLogs) {
        q = q.gte("date", startDateForLogs);
      }
      return q;
    })(),
  ]);

  if (configResult.error) {
    return NextResponse.json({ error: configResult.error.message }, { status: 500 });
  }
  if (logResult.error) {
    return NextResponse.json({ error: logResult.error.message }, { status: 500 });
  }

  const configData = configResult.data;
  const logData = logResult.data;

  const configMap = new Map(
    (configData || []).map((c) => [
      c.metric_id,
      {
        metric_name: c.metric_name,
        higher_is_better: c.analytics_config?.higher_is_better ?? true,
      },
    ])
  );

  // Group by metric
  const metricLogs = new Map<string, { date: string; value: number }[]>();
  for (const log of logData || []) {
    const existing = metricLogs.get(log.metric_id) || [];
    existing.push({ date: log.date, value: log.value });
    metricLogs.set(log.metric_id, existing);
  }

  // Calculate stats for each metric
  const metricStats: MetricStats[] = [];
  for (const metricId of metricIds) {
    const config = configMap.get(metricId);
    const logs = metricLogs.get(metricId) || [];

    if (logs.length === 0) continue;

    const values = logs.map((l) => l.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    metricStats.push({
      metric_id: metricId,
      metric_name: config?.metric_name || metricId,
      min,
      max,
      avg,
      values: logs,
      higher_is_better: config?.higher_is_better ?? true,
    });
  }

  // Calculate normalized values based on view
  function normalizeValue(value: number, stats: MetricStats): number {
    const range = stats.max - stats.min || 1;
    let normalized = ((value - stats.min) / range) * 100;
    // Invert if lower is better
    if (!stats.higher_is_better) {
      normalized = 100 - normalized;
    }
    return Math.round(normalized * 10) / 10;
  }

  function getAverageForPeriod(stats: MetricStats, days: number, endDate?: string): number {
    const end = endDate || stats.values[0]?.date;
    if (!end) return 0;

    const startDate = new Date(end + "T00:00:00");
    startDate.setDate(startDate.getDate() - days + 1);
    const start = startDate.toISOString().slice(0, 10);

    const periodValues = stats.values
      .filter((v) => v.date >= start && v.date <= end)
      .map((v) => v.value);

    if (periodValues.length === 0) return 0;
    return periodValues.reduce((a, b) => a + b, 0) / periodValues.length;
  }

  // Build radar data based on view
  type RadarPoint = {
    metric: string;
    metric_id: string;
    value: number;
    normalized: number;
    compare_value?: number;
    compare_normalized?: number;
  };

  const radarData: RadarPoint[] = [];

  for (const stats of metricStats) {
    let value: number;
    let compareValue: number | undefined;

    switch (view) {
      case "day":
        if (!date) {
          return NextResponse.json({ error: "date required for day view" }, { status: 400 });
        }
        const dayLog = stats.values.find((v) => v.date === date);
        value = dayLog?.value ?? 0;
        if (compareDate) {
          const compareDayLog = stats.values.find((v) => v.date === compareDate);
          compareValue = compareDayLog?.value;
        }
        break;

      case "7d":
        value = getAverageForPeriod(stats, 7, date);
        if (compareDate) {
          compareValue = getAverageForPeriod(stats, 7, compareDate);
        }
        break;

      case "30d":
        value = getAverageForPeriod(stats, 30, date);
        if (compareDate) {
          compareValue = getAverageForPeriod(stats, 30, compareDate);
        }
        break;

      case "average":
      default:
        value = stats.avg;
        break;
    }

    const point: RadarPoint = {
      metric: stats.metric_name,
      metric_id: stats.metric_id,
      value: Math.round(value * 100) / 100,
      normalized: normalizeValue(value, stats),
    };

    if (compareValue !== undefined) {
      point.compare_value = Math.round(compareValue * 100) / 100;
      point.compare_normalized = normalizeValue(compareValue, stats);
    }

    radarData.push(point);
  }

  return NextResponse.json({
    view,
    date,
    compare_date: compareDate,
    data: radarData,
    stats: metricStats.map((s) => ({
      metric_id: s.metric_id,
      metric_name: s.metric_name,
      min: s.min,
      max: s.max,
      avg: Math.round(s.avg * 100) / 100,
      higher_is_better: s.higher_is_better,
    })),
  });
}
