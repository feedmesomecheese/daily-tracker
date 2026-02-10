import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type PeriodType = "week" | "month" | "quarter" | "year";

function getLocalDateString(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function getPeriodBounds(
  type: PeriodType,
  referenceDate: string
): { start: string; end: string; prevStart: string; prevEnd: string } {
  const [year, month, day] = referenceDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);

  let start: Date, end: Date, prevStart: Date, prevEnd: Date;

  switch (type) {
    case "week": {
      // Monday-Sunday (ISO week)
      const dayOfWeek = d.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      start = new Date(year, month - 1, day - daysToMonday);
      end = new Date(start);
      end.setDate(end.getDate() + 6);
      prevEnd = new Date(start);
      prevEnd.setDate(prevEnd.getDate() - 1);
      prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - 6);
      break;
    }
    case "month": {
      start = new Date(year, month - 1, 1);
      end = new Date(year, month, 0);
      prevEnd = new Date(year, month - 1, 0);
      prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), 1);
      break;
    }
    case "quarter": {
      const q = Math.floor((month - 1) / 3);
      start = new Date(year, q * 3, 1);
      end = new Date(year, q * 3 + 3, 0);
      const prevQ = q === 0 ? 3 : q - 1;
      const prevYear = q === 0 ? year - 1 : year;
      prevStart = new Date(prevYear, prevQ * 3, 1);
      prevEnd = new Date(prevYear, prevQ * 3 + 3, 0);
      break;
    }
    case "year": {
      start = new Date(year, 0, 1);
      end = new Date(year, 11, 31);
      prevStart = new Date(year - 1, 0, 1);
      prevEnd = new Date(year - 1, 11, 31);
      break;
    }
  }

  return {
    start: getLocalDateString(start),
    end: getLocalDateString(end),
    prevStart: getLocalDateString(prevStart),
    prevEnd: getLocalDateString(prevEnd),
  };
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
  const type = (url.searchParams.get("type") || "month") as PeriodType;
  const dateParam = url.searchParams.get("date") || getLocalDateString();
  const showPrivate = url.searchParams.get("show_private") === "true";

  if (!["week", "month", "quarter", "year"].includes(type)) {
    return NextResponse.json({ error: "Invalid period type" }, { status: 400 });
  }

  const bounds = getPeriodBounds(type, dateParam);

  // Build config query with optional privacy filter
  let configQuery = supabase
    .from("config")
    .select("metric_id, metric_name, type, analytics_config, active, private")
    .eq("owner_id", user.id)
    .eq("active", true);

  if (!showPrivate) {
    configQuery = configQuery.or("private.is.null,private.eq.false");
  }

  // Run all queries in parallel for better performance
  const [configResult, currentLogsResult, prevLogsResult] = await Promise.all([
    configQuery,
    // Get logs for current period
    supabase
      .from("log")
      .select("date, metric_id, value")
      .eq("owner_id", user.id)
      .gte("date", bounds.start)
      .lte("date", bounds.end)
      .not("value", "is", null),
    // Get logs for previous period
    supabase
      .from("log")
      .select("date, metric_id, value")
      .eq("owner_id", user.id)
      .gte("date", bounds.prevStart)
      .lte("date", bounds.prevEnd)
      .not("value", "is", null),
  ]);

  if (configResult.error) {
    return NextResponse.json({ error: configResult.error.message }, { status: 500 });
  }
  if (currentLogsResult.error) {
    return NextResponse.json({ error: currentLogsResult.error.message }, { status: 500 });
  }
  if (prevLogsResult.error) {
    return NextResponse.json({ error: prevLogsResult.error.message }, { status: 500 });
  }

  const configData = configResult.data;
  const currentLogs = currentLogsResult.data;
  const prevLogs = prevLogsResult.data;

  const configMap = new Map(
    (configData || []).map((c) => [
      c.metric_id,
      {
        metric_name: c.metric_name,
        type: c.type,
        direction: c.analytics_config?.direction || (c.analytics_config?.higher_is_better === false ? "decrease" : "increase"),
      },
    ])
  );

  // Get all-time extremes per metric (max for increase, min for decrease)
  const metricsWithData = [...new Set((currentLogs || []).map((l) => l.metric_id))].filter(
    (id) => configMap.has(id)
  );
  const allTimeExtremeMap = new Map<string, { max: number; min: number }>();

  if (metricsWithData.length > 0) {
    const extremeQueries = metricsWithData.map(async (metricId) => {
      const [maxResult, minResult] = await Promise.all([
        supabase
          .from("log")
          .select("value")
          .eq("owner_id", user.id)
          .eq("metric_id", metricId)
          .not("value", "is", null)
          .order("value", { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from("log")
          .select("value")
          .eq("owner_id", user.id)
          .eq("metric_id", metricId)
          .not("value", "is", null)
          .order("value", { ascending: true })
          .limit(1)
          .single(),
      ]);
      return {
        metricId,
        max: maxResult.data?.value ?? null,
        min: minResult.data?.value ?? null,
      };
    });

    const extremeResults = await Promise.all(extremeQueries);
    for (const { metricId, max, min } of extremeResults) {
      if (max !== null && min !== null) {
        allTimeExtremeMap.set(metricId, { max, min });
      }
    }
  }

  // Calculate metrics
  function calculateStats(logs: { date: string; metric_id: string; value: number }[] | null, metricId: string) {
    const metricLogs = (logs || []).filter((l) => l.metric_id === metricId);
    if (metricLogs.length === 0) return null;

    const values = metricLogs.map((l) => l.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    return { total: sum, average: avg, count: values.length, min, max };
  }

  // Build metrics summary
  const metrics: {
    metric_id: string;
    metric_name: string;
    type: string;
    direction: "increase" | "decrease" | "neutral";
    total: number;
    average: number;
    count: number;
    min: number;
    max: number;
    vs_previous: { pct_change: number; change_direction: "up" | "down" | "flat"; prev_average: number } | null;
    records: { is_period_high: boolean; is_all_time_high: boolean; is_period_low: boolean; is_all_time_low: boolean };
  }[] = [];

  for (const [metricId, config] of configMap) {
    const currentStats = calculateStats(currentLogs, metricId);
    const prevStats = calculateStats(prevLogs, metricId);

    if (!currentStats) continue;

    let vsPrevious: { pct_change: number; change_direction: "up" | "down" | "flat"; prev_average: number } | null = null;
    if (prevStats && prevStats.average !== 0) {
      const change = ((currentStats.average - prevStats.average) / prevStats.average) * 100;
      vsPrevious = {
        pct_change: Math.round(change * 10) / 10,
        change_direction: change > 1 ? "up" : change < -1 ? "down" : "flat",
        prev_average: Math.round(prevStats.average * 100) / 100,
      };
    }

    const allTimeExtreme = allTimeExtremeMap.get(metricId);

    // For checkbox, check if total is all-time high
    let isAllTimeHigh = false;
    let isAllTimeLow = false;
    let isPeriodHigh = false;
    let isPeriodLow = false;

    if (config.type === "checkbox") {
      // For checkbox, compare total checked count
      // We'd need to calculate this across all periods, so skip for now
      // Could be implemented with a sum aggregate query
    } else {
      isAllTimeHigh = allTimeExtreme !== undefined && currentStats.max >= allTimeExtreme.max;
      isAllTimeLow = allTimeExtreme !== undefined && currentStats.min <= allTimeExtreme.min;
      isPeriodHigh = prevStats !== null && currentStats.max > prevStats.max;
      isPeriodLow = prevStats !== null && currentStats.min < prevStats.min;
    }

    metrics.push({
      metric_id: metricId,
      metric_name: config.metric_name,
      type: config.type,
      direction: config.direction as "increase" | "decrease" | "neutral",
      total: Math.round(currentStats.total * 100) / 100,
      average: Math.round(currentStats.average * 100) / 100,
      count: currentStats.count,
      min: Math.round(currentStats.min * 100) / 100,
      max: Math.round(currentStats.max * 100) / 100,
      vs_previous: vsPrevious,
      records: {
        is_period_high: isPeriodHigh,
        is_all_time_high: isAllTimeHigh,
        is_period_low: isPeriodLow,
        is_all_time_low: isAllTimeLow,
      },
    });
  }

  // Calculate days logged
  const daysInPeriod = new Set<string>();
  let d = new Date(bounds.start + "T00:00:00");
  const endDate = new Date(bounds.end + "T00:00:00");
  while (d <= endDate) {
    daysInPeriod.add(getLocalDateString(d));
    d.setDate(d.getDate() + 1);
  }

  const daysWithLogs = new Set(
    (currentLogs || []).filter((l) => configMap.has(l.metric_id)).map((l) => l.date)
  );

  // Notable achievements in this period - respect direction
  const achievements: { type: string; metric: string; value: number; date: string; direction: string }[] = [];
  for (const m of metrics) {
    // For "increase" direction, show all-time highs
    if (m.direction === "increase" && m.records.is_all_time_high) {
      const dayWithMax = (currentLogs || []).find(
        (l) => l.metric_id === m.metric_id && l.value === m.max
      );
      achievements.push({
        type: "all_time_high",
        metric: m.metric_name,
        value: m.max,
        date: dayWithMax?.date || bounds.start,
        direction: m.direction,
      });
    }
    // For "decrease" direction, show all-time lows (which is good)
    if (m.direction === "decrease" && m.records.is_all_time_low) {
      const dayWithMin = (currentLogs || []).find(
        (l) => l.metric_id === m.metric_id && l.value === m.min
      );
      achievements.push({
        type: "all_time_low",
        metric: m.metric_name,
        value: m.min,
        date: dayWithMin?.date || bounds.start,
        direction: m.direction,
      });
    }
  }

  return NextResponse.json({
    period: {
      type,
      start: bounds.start,
      end: bounds.end,
      prev_start: bounds.prevStart,
      prev_end: bounds.prevEnd,
    },
    metrics,
    achievements,
    summary: {
      days_logged: daysWithLogs.size,
      total_days: daysInPeriod.size,
    },
  });
}
