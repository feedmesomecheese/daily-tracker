import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type MetricStats = {
  metric_id: string;
  metric_name: string;
  metric_type: string;
  min: number;
  max: number;
  avg: number;
  values: { date: string; value: number }[];
  higher_is_better: boolean;
};

type ConfigEntry = {
  metric_id: string;
  metric_name: string;
  type: string;
  analytics_config: { higher_is_better?: boolean } | null;
};

type MetricConfig = {
  metric_name: string;
  metric_type: string;
  higher_is_better: boolean;
};

// Format hhmm value as H:MM
function formatHHMM(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes)) return "0:00";
  const minutes = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

// Format duration as H:MM or Xm
function formatDuration(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes)) return "0m";
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}:${String(m).padStart(2, "0")}`;
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
      .select("metric_id, metric_name, type, analytics_config")
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

  const configMap = new Map<string, MetricConfig>(
    (configData || []).map((c: ConfigEntry) => [
      c.metric_id,
      {
        metric_name: c.metric_name,
        metric_type: c.type || "number",
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

    const metricType = config?.metric_type || "number";
    const values = logs.map((l) => l.value);
    const min = Math.min(...values);
    const max = Math.max(...values);

    // For checkbox, avg is % of days checked
    let avg: number;
    if (metricType === "checkbox") {
      const checkedCount = values.filter((v) => v >= 0.5).length;
      avg = (checkedCount / values.length) * 100;
    } else {
      avg = values.reduce((a, b) => a + b, 0) / values.length;
    }

    metricStats.push({
      metric_id: metricId,
      metric_name: config?.metric_name || metricId,
      metric_type: metricType,
      min,
      max,
      avg,
      values: logs,
      higher_is_better: config?.higher_is_better ?? true,
    });
  }

  // Calculate normalized values based on metric type
  function normalizeValue(value: number, stats: MetricStats): number {
    let normalized: number;

    switch (stats.metric_type) {
      case "checkbox":
        // For checkbox, value is already a percentage (0-100 of days checked)
        normalized = value;
        break;

      case "score":
        // Score types use 0-10 range (or 1-10, treat as 0-10 for normalization)
        normalized = (value / 10) * 100;
        break;

      case "hhmm":
      case "time":
        // For time types, use actual data range since there's no fixed "good" range
        // Fall through to default behavior
      default:
        // Use actual data range
        const range = stats.max - stats.min || 1;
        normalized = ((value - stats.min) / range) * 100;
        break;
    }

    // Invert if lower is better (except checkbox which is already a %)
    if (!stats.higher_is_better && stats.metric_type !== "checkbox") {
      normalized = 100 - normalized;
    }

    return Math.round(normalized * 10) / 10;
  }

  // Format value for display based on type
  function formatDisplayValue(value: number, metricType: string): string | number {
    switch (metricType) {
      case "hhmm":
        return formatHHMM(value);
      case "time":
        return formatDuration(value);
      default:
        return Math.round(value * 100) / 100;
    }
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

    // For checkbox, return % of days checked (count of 1s / days in period)
    if (stats.metric_type === "checkbox") {
      const checkedCount = periodValues.filter((v) => v >= 0.5).length;
      return (checkedCount / days) * 100;
    }

    return periodValues.reduce((a, b) => a + b, 0) / periodValues.length;
  }

  // Build radar data based on view
  type RadarPoint = {
    metric: string;
    metric_id: string;
    metric_type: string;
    value: number;
    display_value: string | number;
    normalized: number;
    compare_value?: number;
    compare_display_value?: string | number;
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
        // For checkbox, convert 0/1 to 0/100%
        if (stats.metric_type === "checkbox") {
          value = dayLog && dayLog.value >= 0.5 ? 100 : 0;
        } else {
          value = dayLog?.value ?? 0;
        }
        if (compareDate) {
          const compareDayLog = stats.values.find((v) => v.date === compareDate);
          if (stats.metric_type === "checkbox") {
            compareValue = compareDayLog && compareDayLog.value >= 0.5 ? 100 : 0;
          } else {
            compareValue = compareDayLog?.value;
          }
        }
        break;

      case "7d":
        value = getAverageForPeriod(stats, 7, date ?? undefined);
        if (compareDate) {
          compareValue = getAverageForPeriod(stats, 7, compareDate ?? undefined);
        }
        break;

      case "30d":
        value = getAverageForPeriod(stats, 30, date ?? undefined);
        if (compareDate) {
          compareValue = getAverageForPeriod(stats, 30, compareDate ?? undefined);
        }
        break;

      case "average":
      default:
        value = stats.avg;
        break;
    }

    const roundedValue = Math.round(value * 100) / 100;
    const point: RadarPoint = {
      metric: stats.metric_name,
      metric_id: stats.metric_id,
      metric_type: stats.metric_type,
      value: roundedValue,
      display_value: formatDisplayValue(roundedValue, stats.metric_type),
      normalized: normalizeValue(value, stats),
    };

    if (compareValue !== undefined) {
      const roundedCompare = Math.round(compareValue * 100) / 100;
      point.compare_value = roundedCompare;
      point.compare_display_value = formatDisplayValue(roundedCompare, stats.metric_type);
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
      metric_type: s.metric_type,
      min: s.metric_type === "hhmm" ? formatHHMM(s.min) : s.metric_type === "time" ? formatDuration(s.min) : s.min,
      max: s.metric_type === "hhmm" ? formatHHMM(s.max) : s.metric_type === "time" ? formatDuration(s.max) : s.max,
      avg: s.metric_type === "hhmm" ? formatHHMM(s.avg) : s.metric_type === "time" ? formatDuration(s.avg) : Math.round(s.avg * 100) / 100,
      higher_is_better: s.higher_is_better,
    })),
  });
}
