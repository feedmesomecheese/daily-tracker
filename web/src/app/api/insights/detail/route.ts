import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type LogRow = {
  metric_id: string;
  date: string;
  value: number | null;
};

type MetricConfig = {
  metric_id: string;
  metric_name: string | null;
  type: string;
  analytics_config: { higher_is_better?: boolean } | null;
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
  const type = url.searchParams.get("type");
  const metricsParam = url.searchParams.get("metrics");
  const range = url.searchParams.get("range") || "all";

  if (!type || !metricsParam) {
    return NextResponse.json(
      { error: "Missing type or metrics parameter" },
      { status: 400 }
    );
  }

  const metricIds = metricsParam.split(",").filter(Boolean);
  if (metricIds.length === 0 || metricIds.length > 2) {
    return NextResponse.json(
      { error: "Must provide 1 or 2 metric IDs" },
      { status: 400 }
    );
  }

  // Validate metrics belong to user and get config
  const { data: configs, error: configError } = await supabase
    .from("config")
    .select("metric_id, metric_name, type, analytics_config")
    .eq("owner_id", user.id)
    .in("metric_id", metricIds);

  if (configError) {
    return NextResponse.json(
      { error: `Failed to load config: ${configError.message}` },
      { status: 500 }
    );
  }

  const metricConfigs = (configs ?? []) as MetricConfig[];
  if (metricConfigs.length !== metricIds.length) {
    return NextResponse.json(
      { error: "One or more metrics not found" },
      { status: 404 }
    );
  }

  const configMap = new Map<string, MetricConfig>();
  for (const c of metricConfigs) {
    configMap.set(c.metric_id, c);
  }

  // Calculate date cutoff based on range
  let dateFilter: string | null = null;
  if (range !== "all") {
    const now = new Date();
    const days = range === "30d" ? 30 : range === "90d" ? 90 : range === "1y" ? 365 : 0;
    if (days > 0) {
      now.setDate(now.getDate() - days);
      dateFilter = now.toISOString().slice(0, 10);
    }
  }

  // Fetch logs for these specific metrics only
  const allLogs: LogRow[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("log")
      .select("metric_id, date, value")
      .eq("owner_id", user.id)
      .in("metric_id", metricIds)
      .order("date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (dateFilter) {
      query = query.gte("date", dateFilter);
    }

    const { data: logs, error: logError } = await query;

    if (logError) {
      return NextResponse.json(
        { error: `Failed to load logs: ${logError.message}` },
        { status: 500 }
      );
    }

    const rows = (logs ?? []) as LogRow[];
    allLogs.push(...rows);
    hasMore = rows.length === PAGE_SIZE;
    offset += PAGE_SIZE;
    if (offset > 500000) break;
  }

  // Build per-metric date->value maps
  const byMetric = new Map<string, Map<string, number | null>>();
  const allDates = new Set<string>();

  for (const row of allLogs) {
    if (!byMetric.has(row.metric_id)) {
      byMetric.set(row.metric_id, new Map());
    }
    byMetric.get(row.metric_id)!.set(row.date, row.value);
    allDates.add(row.date);
  }

  const sortedDates = Array.from(allDates).sort();

  switch (type) {
    case "numeric_numeric":
      return handleNumericNumeric(metricIds, configMap, byMetric, sortedDates);
    case "trend":
      return handleTrend(metricIds[0], configMap, byMetric, sortedDates);
    case "day_of_week":
      return handleDayOfWeek(metricIds[0], configMap, byMetric, sortedDates, dateFilter);
    case "checkbox_numeric":
      return handleCheckboxNumeric(metricIds, configMap, byMetric, sortedDates);
    case "time_lagged":
      return handleTimeLagged(metricIds, configMap, byMetric, sortedDates);
    case "checkbox_checkbox":
      return handleCheckboxCheckbox(metricIds, configMap, byMetric, sortedDates);
    default:
      return NextResponse.json({ error: "Unknown insight type" }, { status: 400 });
  }
}

function handleNumericNumeric(
  metricIds: string[],
  configMap: Map<string, MetricConfig>,
  byMetric: Map<string, Map<string, number | null>>,
  sortedDates: string[]
) {
  const [idA, idB] = metricIds;
  const dataA = byMetric.get(idA);
  const dataB = byMetric.get(idB);
  const cfgA = configMap.get(idA)!;
  const cfgB = configMap.get(idB)!;

  const points: { date: string; valueA: number; valueB: number }[] = [];
  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0;

  for (const date of sortedDates) {
    const vA = dataA?.get(date);
    const vB = dataB?.get(date);
    if (vA != null && vB != null) {
      points.push({ date, valueA: vA, valueB: vB });
      sumA += vA;
      sumB += vB;
      sumAB += vA * vB;
      sumA2 += vA * vA;
      sumB2 += vB * vB;
    }
  }

  const n = points.length;
  let correlation = 0;
  if (n > 1) {
    const denom = Math.sqrt(
      (n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB)
    );
    if (denom > 0) {
      correlation = Math.round(((n * sumAB - sumA * sumB) / denom) * 1000) / 1000;
    }
  }

  return NextResponse.json({
    points,
    metricAName: cfgA.metric_name || idA,
    metricBName: cfgB.metric_name || idB,
    correlation,
    metricAHigherIsBetter: cfgA.analytics_config?.higher_is_better !== false,
    metricBHigherIsBetter: cfgB.analytics_config?.higher_is_better !== false,
  });
}

function handleTrend(
  metricId: string,
  configMap: Map<string, MetricConfig>,
  byMetric: Map<string, Map<string, number | null>>,
  sortedDates: string[]
) {
  const data = byMetric.get(metricId);
  const cfg = configMap.get(metricId)!;
  const metricType = cfg.type;

  const points: { date: string; value: number }[] = [];
  let total = 0;

  if (metricType === "count" && sortedDates.length > 0) {
    // For count metrics, fill missing dates with 0
    const start = new Date(sortedDates[0] + "T00:00:00");
    const end = new Date(sortedDates[sortedDates.length - 1] + "T00:00:00");
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().slice(0, 10);
      const val = data?.get(ds) ?? 0;
      points.push({ date: ds, value: val });
      total += val;
    }
  } else {
    for (const date of sortedDates) {
      const val = data?.get(date);
      if (val != null) {
        points.push({ date, value: val });
        total += val;
      }
    }
  }

  const overallAvg = points.length > 0 ? Math.round((total / points.length) * 100) / 100 : 0;

  return NextResponse.json({
    points,
    metricName: cfg.metric_name || metricId,
    metricType: cfg.type,
    overallAvg,
    higherIsBetter: cfg.analytics_config?.higher_is_better !== false,
  });
}

function handleDayOfWeek(
  metricId: string,
  configMap: Map<string, MetricConfig>,
  byMetric: Map<string, Map<string, number | null>>,
  sortedDates: string[],
  dateFilter: string | null
) {
  const data = byMetric.get(metricId);
  const cfg = configMap.get(metricId)!;

  const DAY_NAMES = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
  ];

  const byDay: number[][] = [[], [], [], [], [], [], []];
  const dailyValues: { date: string; value: number }[] = [];

  for (const date of sortedDates) {
    if (dateFilter && date < dateFilter) continue;
    const val = data?.get(date);
    if (val != null) {
      const dow = new Date(date + "T00:00:00").getDay();
      byDay[dow].push(val);
      dailyValues.push({ date, value: val });
    }
  }

  const allVals = byDay.flat();
  const overallAvg = allVals.length > 0
    ? Math.round((allVals.reduce((a, b) => a + b, 0) / allVals.length) * 100) / 100
    : 0;

  const dayAverages = DAY_NAMES.map((name, i) => ({
    day: name,
    avg: byDay[i].length > 0
      ? Math.round((byDay[i].reduce((a, b) => a + b, 0) / byDay[i].length) * 100) / 100
      : 0,
    total: Math.round(byDay[i].reduce((a, b) => a + b, 0) * 100) / 100,
    count: byDay[i].length,
  }));

  return NextResponse.json({
    dayAverages,
    dailyValues,
    metricName: cfg.metric_name || metricId,
    metricType: cfg.type,
    overallAvg,
    higherIsBetter: cfg.analytics_config?.higher_is_better !== false,
  });
}

function handleCheckboxNumeric(
  metricIds: string[],
  configMap: Map<string, MetricConfig>,
  byMetric: Map<string, Map<string, number | null>>,
  sortedDates: string[]
) {
  const [cbId, numId] = metricIds;
  const cbData = byMetric.get(cbId);
  const numData = byMetric.get(numId);
  const cfgCb = configMap.get(cbId)!;
  const cfgNum = configMap.get(numId)!;

  const distribution: { date: string; value: number; checked: boolean }[] = [];
  const whenTrue: number[] = [];
  const whenFalse: number[] = [];

  for (const date of sortedDates) {
    const cbVal = cbData?.get(date);
    const numVal = numData?.get(date);
    if (numVal == null) continue;

    const checked = cbVal != null && cbVal !== 0;
    distribution.push({ date, value: numVal, checked });

    if (checked) {
      whenTrue.push(numVal);
    } else {
      whenFalse.push(numVal);
    }
  }

  const avgWhenTrue = whenTrue.length > 0
    ? Math.round((whenTrue.reduce((a, b) => a + b, 0) / whenTrue.length) * 100) / 100
    : 0;
  const avgWhenFalse = whenFalse.length > 0
    ? Math.round((whenFalse.reduce((a, b) => a + b, 0) / whenFalse.length) * 100) / 100
    : 0;

  return NextResponse.json({
    avgWhenTrue,
    avgWhenFalse,
    daysTrue: whenTrue.length,
    daysFalse: whenFalse.length,
    distribution,
    checkboxName: cfgCb.metric_name || cbId,
    numericName: cfgNum.metric_name || numId,
    numericHigherIsBetter: cfgNum.analytics_config?.higher_is_better !== false,
  });
}

function handleTimeLagged(
  metricIds: string[],
  configMap: Map<string, MetricConfig>,
  byMetric: Map<string, Map<string, number | null>>,
  sortedDates: string[]
) {
  const [cbId, numId] = metricIds;
  const cbData = byMetric.get(cbId);
  const numData = byMetric.get(numId);
  const cfgCb = configMap.get(cbId)!;
  const cfgNum = configMap.get(numId)!;

  const dateSet = new Set(sortedDates);
  const distribution: { date: string; nextDayValue: number; checkedToday: boolean }[] = [];
  const whenTrue: number[] = [];
  const whenFalse: number[] = [];

  for (const date of sortedDates) {
    const cbVal = cbData?.get(date);
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + 1);
    const nextDate = d.toISOString().slice(0, 10);

    if (!dateSet.has(nextDate)) continue;
    const nextVal = numData?.get(nextDate);
    if (nextVal == null) continue;

    const checked = cbVal != null && cbVal !== 0;
    distribution.push({ date, nextDayValue: nextVal, checkedToday: checked });

    if (checked) {
      whenTrue.push(nextVal);
    } else {
      whenFalse.push(nextVal);
    }
  }

  const avgNextDayWhenTrue = whenTrue.length > 0
    ? Math.round((whenTrue.reduce((a, b) => a + b, 0) / whenTrue.length) * 100) / 100
    : 0;
  const avgNextDayWhenFalse = whenFalse.length > 0
    ? Math.round((whenFalse.reduce((a, b) => a + b, 0) / whenFalse.length) * 100) / 100
    : 0;

  return NextResponse.json({
    avgNextDayWhenTrue,
    avgNextDayWhenFalse,
    daysTrue: whenTrue.length,
    daysFalse: whenFalse.length,
    distribution,
    triggerName: cfgCb.metric_name || cbId,
    outcomeName: cfgNum.metric_name || numId,
    outcomeHigherIsBetter: cfgNum.analytics_config?.higher_is_better !== false,
  });
}

function handleCheckboxCheckbox(
  metricIds: string[],
  configMap: Map<string, MetricConfig>,
  byMetric: Map<string, Map<string, number | null>>,
  sortedDates: string[]
) {
  const [idA, idB] = metricIds;
  const dataA = byMetric.get(idA);
  const dataB = byMetric.get(idB);
  const cfgA = configMap.get(idA)!;
  const cfgB = configMap.get(idB)!;

  let aTrueBTrue = 0, aTrueBFalse = 0, aFalseBTrue = 0, aFalseBFalse = 0;
  const dailyData: { date: string; a: boolean; b: boolean }[] = [];

  for (const date of sortedDates) {
    const valA = dataA?.get(date);
    const valB = dataB?.get(date);
    if (valA === undefined || valB === undefined) continue;

    const aTrue = valA != null && valA !== 0;
    const bTrue = valB != null && valB !== 0;
    dailyData.push({ date, a: aTrue, b: bTrue });

    if (aTrue && bTrue) aTrueBTrue++;
    else if (aTrue && !bTrue) aTrueBFalse++;
    else if (!aTrue && bTrue) aFalseBTrue++;
    else aFalseBFalse++;
  }

  const daysATrue = aTrueBTrue + aTrueBFalse;
  const daysAFalse = aFalseBTrue + aFalseBFalse;
  const rateWhenATrue = daysATrue > 0 ? Math.round((aTrueBTrue / daysATrue) * 1000) / 10 : 0;
  const rateWhenAFalse = daysAFalse > 0 ? Math.round((aFalseBTrue / daysAFalse) * 1000) / 10 : 0;

  return NextResponse.json({
    rateWhenATrue,
    rateWhenAFalse,
    daysATrue,
    daysAFalse,
    dailyData,
    metricAName: cfgA.metric_name || idA,
    metricBName: cfgB.metric_name || idB,
  });
}
