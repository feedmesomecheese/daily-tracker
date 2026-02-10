import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import type {
  Metric,
  LogRow,
  CorrelationInsight,
  CheckboxCheckboxInsight,
  NumericNumericInsight,
  TimeLaggedInsight,
  DayOfWeekInsight,
  TrendInsight,
  HistogramInsight,
  CumulativeInsight,
  YearOverYearInsight,
  StreakTimelineInsight,
  CandlestickInsight,
  InsightsResponse,
} from "@/types/insights";

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Check for showPrivate query param
  const url = new URL(req.url);
  const showPrivate = url.searchParams.get("showPrivate") === "true";

  // Get all active metrics (including calc_expr to filter redundant correlations)
  const { data: metrics, error: configError } = await supabase
    .from("config")
    .select("metric_id, metric_name, type, private, is_calculated, calc_expr, analytics_config")
    .eq("owner_id", user.id)
    .eq("active", true);

  if (configError) {
    return NextResponse.json(
      { error: `Failed to load config: ${configError.message}` },
      { status: 500 }
    );
  }

  const allRawMetrics = (metrics ?? []) as Metric[];
  const privateMetricIds = new Set(
    allRawMetrics.filter((m) => m.private).map((m) => m.metric_id)
  );
  const higherIsBetterMap = new Map<string, boolean>();
  for (const m of allRawMetrics) {
    higherIsBetterMap.set(
      m.metric_id,
      m.analytics_config?.higher_is_better !== false
    );
  }
  const allMetrics = allRawMetrics.filter(
    (m) => showPrivate || !m.private
  );

  const checkboxMetrics = allMetrics.filter((m) => m.type === "checkbox");
  const numericMetrics = allMetrics.filter((m) =>
    ["number", "score", "time", "hhmm", "count", "calculated"].includes(m.type)
  );

  // Build a set of all metric IDs for validation
  const allMetricIds = new Set(allMetrics.map((m) => m.metric_id));

  // Build a map of calculated metrics -> their referenced metric IDs
  const calculatedDependencies = new Map<string, Set<string>>();
  for (const m of allMetrics) {
    if (m.is_calculated && m.calc_expr) {
      const refs = new Set<string>();
      const regex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
      let match;
      while ((match = regex.exec(m.calc_expr)) !== null) {
        const id = match[0];
        if (allMetricIds.has(id) && id !== m.metric_id) {
          refs.add(id);
        }
      }
      if (refs.size > 0) {
        calculatedDependencies.set(m.metric_id, refs);
      }
    }
  }

  const metricIds = allMetrics.map((m) => m.metric_id);

  if (metricIds.length === 0) {
    const empty: InsightsResponse = {
      checkboxNumeric: [],
      checkboxCheckbox: [],
      numericNumeric: [],
      timeLagged: [],
      dayOfWeek: [],
      trends: [],
      histograms: [],
      cumulative: [],
      yearOverYear: [],
      streakTimelines: [],
      candlesticks: [],
      totalDays: 0,
      dateRange: null,
    };
    return NextResponse.json(empty);
  }

  // Load all logs (fetch all for this user, filter by metric in code)
  const allLogs: LogRow[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: logs, error: logError } = await supabase
      .from("log")
      .select("metric_id, date, value")
      .eq("owner_id", user.id)
      .order("date", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (logError) {
      return NextResponse.json(
        { error: `Failed to load logs: ${logError.message}` },
        { status: 500 }
      );
    }

    const rows = (logs ?? []) as LogRow[];
    const filtered = rows.filter((r) => metricIds.includes(r.metric_id));
    allLogs.push(...filtered);

    hasMore = rows.length === PAGE_SIZE;
    offset += PAGE_SIZE;

    if (offset > 500000) break;
  }

  const logRows = allLogs;

  // Build maps
  const byMetric = new Map<string, Map<string, number | null>>();
  const allDates = new Set<string>();

  for (const row of logRows) {
    if (!byMetric.has(row.metric_id)) {
      byMetric.set(row.metric_id, new Map());
    }
    byMetric.get(row.metric_id)!.set(row.date, row.value);
    allDates.add(row.date);
  }

  const sortedDates = Array.from(allDates).sort();
  const totalDays = sortedDates.length;
  const dateRange =
    sortedDates.length > 0
      ? { first: sortedDates[0], last: sortedDates[sortedDates.length - 1] }
      : null;

  // Minimum data requirements
  const MIN_DAYS_EACH_GROUP = 7;
  const MIN_PERCENT_DIFF = 10;

  // 1) Checkbox → Numeric correlations
  const checkboxNumericInsights: CorrelationInsight[] = [];

  for (const cb of checkboxMetrics) {
    const cbData = byMetric.get(cb.metric_id);
    if (!cbData) continue;

    for (const num of numericMetrics) {
      const numData = byMetric.get(num.metric_id);
      if (!numData) continue;

      const deps = calculatedDependencies.get(num.metric_id);
      if (deps && deps.has(cb.metric_id)) continue;

      const valuesWhenTrue: number[] = [];
      const valuesWhenFalse: number[] = [];

      for (const date of sortedDates) {
        const cbVal = cbData.get(date);
        const numVal = numData.get(date);

        if (numVal == null) continue;

        const isTrue = cbVal != null && cbVal !== 0;

        if (isTrue) {
          valuesWhenTrue.push(numVal);
        } else {
          valuesWhenFalse.push(numVal);
        }
      }

      if (
        valuesWhenTrue.length < MIN_DAYS_EACH_GROUP ||
        valuesWhenFalse.length < MIN_DAYS_EACH_GROUP
      ) {
        continue;
      }

      const avgTrue =
        valuesWhenTrue.reduce((a, b) => a + b, 0) / valuesWhenTrue.length;
      const avgFalse =
        valuesWhenFalse.reduce((a, b) => a + b, 0) / valuesWhenFalse.length;

      if (avgFalse === 0 && avgTrue === 0) continue;

      const percentDiff =
        avgFalse !== 0
          ? ((avgTrue - avgFalse) / Math.abs(avgFalse)) * 100
          : avgTrue > 0
          ? 100
          : -100;

      if (Math.abs(percentDiff) < MIN_PERCENT_DIFF) continue;

      checkboxNumericInsights.push({
        type: "checkbox_numeric",
        id: `cn:${cb.metric_id}:${num.metric_id}`,
        checkboxMetricId: cb.metric_id,
        checkboxMetricName: cb.metric_name || cb.metric_id,
        numericMetricId: num.metric_id,
        numericMetricName: num.metric_name || num.metric_id,
        avgWhenTrue: Math.round(avgTrue * 100) / 100,
        avgWhenFalse: Math.round(avgFalse * 100) / 100,
        percentDiff: Math.round(percentDiff * 10) / 10,
        daysTrue: valuesWhenTrue.length,
        daysFalse: valuesWhenFalse.length,
        direction: percentDiff > 0 ? "higher" : "lower",
        involvesPrivate:
          privateMetricIds.has(cb.metric_id) ||
          privateMetricIds.has(num.metric_id),
        numericHigherIsBetter: higherIsBetterMap.get(num.metric_id) ?? true,
      });
    }
  }

  checkboxNumericInsights.sort(
    (a, b) => Math.abs(b.percentDiff) - Math.abs(a.percentDiff)
  );

  // 2) Checkbox → Checkbox correlations
  const checkboxCheckboxInsights: CheckboxCheckboxInsight[] = [];

  for (let i = 0; i < checkboxMetrics.length; i++) {
    for (let j = i + 1; j < checkboxMetrics.length; j++) {
      const metricA = checkboxMetrics[i];
      const metricB = checkboxMetrics[j];

      const dataA = byMetric.get(metricA.metric_id);
      const dataB = byMetric.get(metricB.metric_id);

      if (!dataA || !dataB) continue;

      let aTrueBTrue = 0;
      let aTrueBFalse = 0;
      let aFalseBTrue = 0;
      let aFalseBFalse = 0;

      for (const date of sortedDates) {
        const valA = dataA.get(date);
        const valB = dataB.get(date);

        if (valA === undefined || valB === undefined) continue;

        const aTrue = valA != null && valA !== 0;
        const bTrue = valB != null && valB !== 0;

        if (aTrue && bTrue) aTrueBTrue++;
        else if (aTrue && !bTrue) aTrueBFalse++;
        else if (!aTrue && bTrue) aFalseBTrue++;
        else aFalseBFalse++;
      }

      const daysATrue = aTrueBTrue + aTrueBFalse;
      const daysAFalse = aFalseBTrue + aFalseBFalse;

      if (daysATrue < MIN_DAYS_EACH_GROUP || daysAFalse < MIN_DAYS_EACH_GROUP) {
        continue;
      }

      const rateWhenATrue = daysATrue > 0 ? (aTrueBTrue / daysATrue) * 100 : 0;
      const rateWhenAFalse =
        daysAFalse > 0 ? (aFalseBTrue / daysAFalse) * 100 : 0;

      const percentDiff = rateWhenATrue - rateWhenAFalse;

      if (Math.abs(percentDiff) < MIN_PERCENT_DIFF) continue;

      checkboxCheckboxInsights.push({
        type: "checkbox_checkbox",
        id: `cc:${metricA.metric_id}:${metricB.metric_id}`,
        metricAId: metricA.metric_id,
        metricAName: metricA.metric_name || metricA.metric_id,
        metricBId: metricB.metric_id,
        metricBName: metricB.metric_name || metricB.metric_id,
        rateWhenATrue: Math.round(rateWhenATrue * 10) / 10,
        rateWhenAFalse: Math.round(rateWhenAFalse * 10) / 10,
        percentDiff: Math.round(percentDiff * 10) / 10,
        daysATrue,
        daysAFalse,
        involvesPrivate:
          privateMetricIds.has(metricA.metric_id) ||
          privateMetricIds.has(metricB.metric_id),
      });
    }
  }

  checkboxCheckboxInsights.sort(
    (a, b) => Math.abs(b.percentDiff) - Math.abs(a.percentDiff)
  );

  // 3) Numeric → Numeric correlations (Pearson)
  const numericNumericInsights: NumericNumericInsight[] = [];
  const MIN_OVERLAP_DAYS = 14;
  const MIN_CORRELATION = 0.3;

  for (let i = 0; i < numericMetrics.length; i++) {
    for (let j = i + 1; j < numericMetrics.length; j++) {
      const mA = numericMetrics[i];
      const mB = numericMetrics[j];

      const depsA = calculatedDependencies.get(mA.metric_id);
      const depsB = calculatedDependencies.get(mB.metric_id);
      if (depsA && depsA.has(mB.metric_id)) continue;
      if (depsB && depsB.has(mA.metric_id)) continue;

      const dataA = byMetric.get(mA.metric_id);
      const dataB = byMetric.get(mB.metric_id);
      if (!dataA || !dataB) continue;

      const pairs: { a: number; b: number }[] = [];
      for (const date of sortedDates) {
        const vA = dataA.get(date);
        const vB = dataB.get(date);
        if (vA != null && vB != null) {
          pairs.push({ a: vA, b: vB });
        }
      }

      if (pairs.length < MIN_OVERLAP_DAYS) continue;

      const n = pairs.length;
      let sumA = 0,
        sumB = 0,
        sumAB = 0,
        sumA2 = 0,
        sumB2 = 0;
      for (const p of pairs) {
        sumA += p.a;
        sumB += p.b;
        sumAB += p.a * p.b;
        sumA2 += p.a * p.a;
        sumB2 += p.b * p.b;
      }

      const denom = Math.sqrt(
        (n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB)
      );
      if (denom === 0) continue;

      const r = (n * sumAB - sumA * sumB) / denom;
      if (Math.abs(r) < MIN_CORRELATION) continue;

      numericNumericInsights.push({
        type: "numeric_numeric",
        id: `nn:${mA.metric_id}:${mB.metric_id}`,
        metricAId: mA.metric_id,
        metricAName: mA.metric_name || mA.metric_id,
        metricBId: mB.metric_id,
        metricBName: mB.metric_name || mB.metric_id,
        correlation: Math.round(r * 1000) / 1000,
        direction: r > 0 ? "positive" : "negative",
        daysOverlap: n,
        involvesPrivate:
          privateMetricIds.has(mA.metric_id) ||
          privateMetricIds.has(mB.metric_id),
        metricAHigherIsBetter: higherIsBetterMap.get(mA.metric_id) ?? true,
        metricBHigherIsBetter: higherIsBetterMap.get(mB.metric_id) ?? true,
      });
    }
  }

  numericNumericInsights.sort(
    (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)
  );

  // 4) Time-lagged: checkbox today → numeric tomorrow
  const timeLaggedInsights: TimeLaggedInsight[] = [];

  const dateSet = new Set(sortedDates);

  for (const cb of checkboxMetrics) {
    const cbData = byMetric.get(cb.metric_id);
    if (!cbData) continue;

    for (const num of numericMetrics) {
      const numData = byMetric.get(num.metric_id);
      if (!numData) continue;

      const nextDayWhenTrue: number[] = [];
      const nextDayWhenFalse: number[] = [];

      for (const date of sortedDates) {
        const cbVal = cbData.get(date);
        const d = new Date(date + "T00:00:00");
        d.setDate(d.getDate() + 1);
        const nextDate = d.toISOString().slice(0, 10);

        if (!dateSet.has(nextDate)) continue;
        const nextVal = numData.get(nextDate);
        if (nextVal == null) continue;

        const isTrue = cbVal != null && cbVal !== 0;
        if (isTrue) {
          nextDayWhenTrue.push(nextVal);
        } else {
          nextDayWhenFalse.push(nextVal);
        }
      }

      if (
        nextDayWhenTrue.length < MIN_DAYS_EACH_GROUP ||
        nextDayWhenFalse.length < MIN_DAYS_EACH_GROUP
      )
        continue;

      const avgTrue =
        nextDayWhenTrue.reduce((a, b) => a + b, 0) / nextDayWhenTrue.length;
      const avgFalse =
        nextDayWhenFalse.reduce((a, b) => a + b, 0) / nextDayWhenFalse.length;

      if (avgFalse === 0 && avgTrue === 0) continue;

      const pctDiff =
        avgFalse !== 0
          ? ((avgTrue - avgFalse) / Math.abs(avgFalse)) * 100
          : avgTrue > 0
          ? 100
          : -100;

      if (Math.abs(pctDiff) < MIN_PERCENT_DIFF) continue;

      timeLaggedInsights.push({
        type: "time_lagged",
        id: `tl:${cb.metric_id}:${num.metric_id}`,
        triggerMetricId: cb.metric_id,
        triggerMetricName: cb.metric_name || cb.metric_id,
        outcomeMetricId: num.metric_id,
        outcomeMetricName: num.metric_name || num.metric_id,
        avgNextDayWhenTrue: Math.round(avgTrue * 100) / 100,
        avgNextDayWhenFalse: Math.round(avgFalse * 100) / 100,
        percentDiff: Math.round(pctDiff * 10) / 10,
        direction: pctDiff > 0 ? "higher" : "lower",
        daysTrue: nextDayWhenTrue.length,
        daysFalse: nextDayWhenFalse.length,
        involvesPrivate:
          privateMetricIds.has(cb.metric_id) ||
          privateMetricIds.has(num.metric_id),
        outcomeHigherIsBetter: higherIsBetterMap.get(num.metric_id) ?? true,
      });
    }
  }

  timeLaggedInsights.sort(
    (a, b) => Math.abs(b.percentDiff) - Math.abs(a.percentDiff)
  );

  // 5) Day-of-week patterns
  const dayOfWeekInsights: DayOfWeekInsight[] = [];
  const DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const MIN_DAYS_PER_DOW = 4;
  const MIN_DOW_DIFF = 10;

  for (const m of numericMetrics) {
    const mData = byMetric.get(m.metric_id);
    if (!mData) continue;

    const byDay: number[][] = [[], [], [], [], [], [], []];
    for (const date of sortedDates) {
      const val = mData.get(date);
      if (val == null) continue;
      const dow = new Date(date + "T00:00:00").getDay();
      byDay[dow].push(val);
    }

    const hasEnoughData = byDay.every((d) => d.length >= MIN_DAYS_PER_DOW);
    if (!hasEnoughData) continue;

    const dayAvgs = byDay.map(
      (vals) => vals.reduce((a, b) => a + b, 0) / vals.length
    );
    const allVals = byDay.flat();
    const overallAvg = allVals.reduce((a, b) => a + b, 0) / allVals.length;

    if (overallAvg === 0) continue;

    const hib = higherIsBetterMap.get(m.metric_id) ?? true;
    let bestIdx = 0;
    let worstIdx = 0;
    for (let i = 1; i < 7; i++) {
      if (hib) {
        if (dayAvgs[i] > dayAvgs[bestIdx]) bestIdx = i;
        if (dayAvgs[i] < dayAvgs[worstIdx]) worstIdx = i;
      } else {
        if (dayAvgs[i] < dayAvgs[bestIdx]) bestIdx = i;
        if (dayAvgs[i] > dayAvgs[worstIdx]) worstIdx = i;
      }
    }

    const bestPctDiff =
      ((dayAvgs[bestIdx] - overallAvg) / Math.abs(overallAvg)) * 100;
    const worstPctDiff =
      ((dayAvgs[worstIdx] - overallAvg) / Math.abs(overallAvg)) * 100;

    if (
      Math.abs(bestPctDiff) < MIN_DOW_DIFF &&
      Math.abs(worstPctDiff) < MIN_DOW_DIFF
    )
      continue;

    dayOfWeekInsights.push({
      type: "day_of_week",
      id: `dow:${m.metric_id}`,
      metricId: m.metric_id,
      metricName: m.metric_name || m.metric_id,
      metricType: m.type,
      bestDay: DAY_NAMES[bestIdx],
      worstDay: DAY_NAMES[worstIdx],
      bestAvg: Math.round(dayAvgs[bestIdx] * 100) / 100,
      worstAvg: Math.round(dayAvgs[worstIdx] * 100) / 100,
      overallAvg: Math.round(overallAvg * 100) / 100,
      dayAverages: DAY_NAMES.map((name, i) => ({
        day: name,
        avg: Math.round(dayAvgs[i] * 100) / 100,
      })),
      involvesPrivate: privateMetricIds.has(m.metric_id),
      higherIsBetter: higherIsBetterMap.get(m.metric_id) ?? true,
    });
  }

  dayOfWeekInsights.sort((a, b) => {
    const spreadA =
      Math.abs((a.bestAvg - a.overallAvg) / a.overallAvg) +
      Math.abs((a.worstAvg - a.overallAvg) / a.overallAvg);
    const spreadB =
      Math.abs((b.bestAvg - b.overallAvg) / b.overallAvg) +
      Math.abs((b.worstAvg - b.overallAvg) / b.overallAvg);
    return spreadB - spreadA;
  });

  // 6) Trend detection (recent 30 days vs prior 30 days)
  const trendInsights: TrendInsight[] = [];
  const TREND_WINDOW = 30;
  const MIN_TREND_DAYS = 14;
  const MIN_TREND_DIFF = 10;

  if (sortedDates.length >= TREND_WINDOW) {
    const today = sortedDates[sortedDates.length - 1];
    const todayDate = new Date(today + "T00:00:00");
    const recentCutoff = new Date(todayDate);
    recentCutoff.setDate(recentCutoff.getDate() - TREND_WINDOW);
    const priorCutoff = new Date(recentCutoff);
    priorCutoff.setDate(priorCutoff.getDate() - TREND_WINDOW);

    const recentCutoffStr = recentCutoff.toISOString().slice(0, 10);
    const priorCutoffStr = priorCutoff.toISOString().slice(0, 10);

    for (const m of numericMetrics) {
      const mData = byMetric.get(m.metric_id);
      if (!mData) continue;

      const recentVals: number[] = [];
      const priorVals: number[] = [];

      for (const date of sortedDates) {
        const val = mData.get(date);
        if (val == null) continue;

        if (date > recentCutoffStr) {
          recentVals.push(val);
        } else if (date > priorCutoffStr && date <= recentCutoffStr) {
          priorVals.push(val);
        }
      }

      if (recentVals.length < MIN_TREND_DAYS || priorVals.length < MIN_TREND_DAYS)
        continue;

      const recentAvg =
        recentVals.reduce((a, b) => a + b, 0) / recentVals.length;
      const priorAvg =
        priorVals.reduce((a, b) => a + b, 0) / priorVals.length;

      if (priorAvg === 0 && recentAvg === 0) continue;

      const pctChange =
        priorAvg !== 0
          ? ((recentAvg - priorAvg) / Math.abs(priorAvg)) * 100
          : recentAvg > 0
          ? 100
          : -100;

      if (Math.abs(pctChange) < MIN_TREND_DIFF) continue;

      trendInsights.push({
        type: "trend",
        id: `tr:${m.metric_id}`,
        metricId: m.metric_id,
        metricName: m.metric_name || m.metric_id,
        metricType: m.type,
        recentAvg: Math.round(recentAvg * 100) / 100,
        priorAvg: Math.round(priorAvg * 100) / 100,
        percentChange: Math.round(pctChange * 10) / 10,
        direction: pctChange > 0 ? "up" : "down",
        recentDays: recentVals.length,
        priorDays: priorVals.length,
        involvesPrivate: privateMetricIds.has(m.metric_id),
        higherIsBetter: higherIsBetterMap.get(m.metric_id) ?? true,
      });
    }

    trendInsights.sort(
      (a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange)
    );
  }

  // 7) Histogram / Distribution
  const histogramInsights: HistogramInsight[] = [];

  for (const m of numericMetrics) {
    const mData = byMetric.get(m.metric_id);
    if (!mData) continue;

    const values: number[] = [];
    for (const date of sortedDates) {
      const val = mData.get(date);
      if (val != null) values.push(val);
    }

    if (values.length < 30) continue;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    histogramInsights.push({
      type: "histogram",
      id: `hi:${m.metric_id}`,
      metricId: m.metric_id,
      metricName: m.metric_name || m.metric_id,
      metricType: m.type,
      mean: Math.round(mean * 100) / 100,
      stdDev: Math.round(stdDev * 100) / 100,
      count: values.length,
      involvesPrivate: privateMetricIds.has(m.metric_id),
      higherIsBetter: higherIsBetterMap.get(m.metric_id) ?? true,
    });
  }

  // Sort by count desc
  histogramInsights.sort((a, b) => b.count - a.count);

  // 8) Cumulative / Running Total
  const cumulativeInsights: CumulativeInsight[] = [];

  for (const m of [...numericMetrics, ...checkboxMetrics.filter(() => false)]) {
    const mData = byMetric.get(m.metric_id);
    if (!mData) continue;

    const isCount = m.type === "count";
    const hib = higherIsBetterMap.get(m.metric_id) ?? true;

    // Count metrics always qualify; others need higher_is_better=true and >= 14 data points
    if (!isCount && (!hib || mData.size < 14)) continue;
    if (isCount && mData.size < 1) continue;
    if (!isCount && mData.size < 14) continue;

    let total = 0;
    let count = 0;
    for (const date of sortedDates) {
      const val = mData.get(date);
      if (val != null) {
        total += val;
        count++;
      }
    }

    if (count === 0) continue;

    // Calculate daily rate based on actual calendar span
    const firstDate = sortedDates.find((d) => mData.has(d));
    const lastDate = [...sortedDates].reverse().find((d) => mData.has(d));
    if (!firstDate || !lastDate) continue;

    const spanDays = Math.max(1,
      (new Date(lastDate + "T00:00:00").getTime() - new Date(firstDate + "T00:00:00").getTime()) / 86400000 + 1
    );
    const dailyRate = total / spanDays;

    // Project to year end
    const now = new Date();
    const yearEnd = new Date(now.getFullYear(), 11, 31);
    const daysRemaining = Math.max(0, (yearEnd.getTime() - now.getTime()) / 86400000);
    const projectedYearEnd = total + dailyRate * daysRemaining;

    cumulativeInsights.push({
      type: "cumulative",
      id: `cu:${m.metric_id}`,
      metricId: m.metric_id,
      metricName: m.metric_name || m.metric_id,
      metricType: m.type,
      currentTotal: Math.round(total * 100) / 100,
      dailyRate: Math.round(dailyRate * 100) / 100,
      projectedYearEnd: Math.round(projectedYearEnd),
      involvesPrivate: privateMetricIds.has(m.metric_id),
      higherIsBetter: hib,
    });
  }

  // Count metrics first, then by total desc
  cumulativeInsights.sort((a, b) => {
    if (a.metricType === "count" && b.metricType !== "count") return -1;
    if (a.metricType !== "count" && b.metricType === "count") return 1;
    return b.currentTotal - a.currentTotal;
  });

  // 9) Year-over-Year Comparison
  const yearOverYearInsights: YearOverYearInsight[] = [];

  for (const m of numericMetrics) {
    const mData = byMetric.get(m.metric_id);
    if (!mData) continue;

    // Group data by year
    const yearData = new Map<number, { sum: number; count: number }>();
    for (const date of sortedDates) {
      const val = mData.get(date);
      if (val == null) continue;
      const year = parseInt(date.slice(0, 4));
      const existing = yearData.get(year);
      if (existing) {
        existing.sum += val;
        existing.count++;
      } else {
        yearData.set(year, { sum: val, count: 1 });
      }
    }

    // Need >= 2 years with 60+ days each
    const qualifyingYears = Array.from(yearData.entries())
      .filter(([, d]) => d.count >= 60)
      .sort((a, b) => a[0] - b[0]);

    if (qualifyingYears.length < 2) continue;

    const currentYear = qualifyingYears[qualifyingYears.length - 1];
    const priorYear = qualifyingYears[qualifyingYears.length - 2];

    const currentAvg = currentYear[1].sum / currentYear[1].count;
    const priorAvg = priorYear[1].sum / priorYear[1].count;

    if (priorAvg === 0 && currentAvg === 0) continue;

    const percentChange =
      priorAvg !== 0
        ? ((currentAvg - priorAvg) / Math.abs(priorAvg)) * 100
        : currentAvg > 0
        ? 100
        : -100;

    yearOverYearInsights.push({
      type: "year_over_year",
      id: `yoy:${m.metric_id}`,
      metricId: m.metric_id,
      metricName: m.metric_name || m.metric_id,
      metricType: m.type,
      yearRange: `${qualifyingYears[0][0]}-${currentYear[0]}`,
      currentYearAvg: Math.round(currentAvg * 100) / 100,
      priorYearAvg: Math.round(priorAvg * 100) / 100,
      percentChange: Math.round(percentChange * 10) / 10,
      involvesPrivate: privateMetricIds.has(m.metric_id),
      higherIsBetter: higherIsBetterMap.get(m.metric_id) ?? true,
    });
  }

  // Sort by |percentChange| desc
  yearOverYearInsights.sort(
    (a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange)
  );

  // 10) Streak Timeline
  const streakTimelineInsights: StreakTimelineInsight[] = [];
  const allTrackableMetrics = [...checkboxMetrics, ...numericMetrics];

  for (const m of allTrackableMetrics) {
    const mData = byMetric.get(m.metric_id);
    if (!mData) continue;

    const isCheckbox = m.type === "checkbox";

    // Get sorted values for this metric
    const metricDates = sortedDates.filter((d) => mData.has(d));
    if (metricDates.length < 30) continue;

    // Determine threshold
    let threshold = 0;
    if (!isCheckbox) {
      const vals: number[] = [];
      for (const d of metricDates) {
        const v = mData.get(d);
        if (v != null) vals.push(v);
      }
      vals.sort((a, b) => a - b);
      threshold = vals[Math.floor(vals.length / 2)]; // median
    }

    // Build streaks
    let currentStreak = 0;
    let longestStreak = 0;
    let streakCount = 0;
    let totalStreakLength = 0;
    let inStreak = false;

    for (const date of metricDates) {
      const val = mData.get(date);
      const isActive = isCheckbox
        ? (val != null && val !== 0)
        : (val != null && val >= threshold);

      if (isActive) {
        if (!inStreak) {
          inStreak = true;
          currentStreak = 1;
        } else {
          currentStreak++;
        }
        if (currentStreak > longestStreak) longestStreak = currentStreak;
      } else {
        if (inStreak) {
          streakCount++;
          totalStreakLength += currentStreak;
          inStreak = false;
          currentStreak = 0;
        }
      }
    }
    // Handle final streak
    if (inStreak) {
      streakCount++;
      totalStreakLength += currentStreak;
    } else {
      currentStreak = 0;
    }

    // Need >= 3 completed streaks
    if (streakCount < 3) continue;

    const averageStreak = totalStreakLength / streakCount;

    streakTimelineInsights.push({
      type: "streak_timeline",
      id: `st:${m.metric_id}`,
      metricId: m.metric_id,
      metricName: m.metric_name || m.metric_id,
      metricType: m.type,
      currentStreak,
      longestStreak,
      averageStreak: Math.round(averageStreak * 10) / 10,
      isCheckbox,
      involvesPrivate: privateMetricIds.has(m.metric_id),
      higherIsBetter: higherIsBetterMap.get(m.metric_id) ?? true,
    });
  }

  // Sort by longest streak desc
  streakTimelineInsights.sort((a, b) => b.longestStreak - a.longestStreak);

  // 11) Candlestick Charts
  const candlestickInsights: CandlestickInsight[] = [];

  for (const m of numericMetrics) {
    const mData = byMetric.get(m.metric_id);
    if (!mData) continue;

    // Need >= 8 weeks of data
    const values: number[] = [];
    const metricDates = sortedDates.filter((d) => mData.has(d) && mData.get(d) != null);
    for (const d of metricDates) {
      values.push(mData.get(d)!);
    }

    if (metricDates.length < 56) continue; // ~8 weeks

    // Check coefficient of variation
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) continue;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / Math.abs(mean);

    if (cv <= 0.15) continue;

    // Get recent week's data for card display
    const recentDates = metricDates.slice(-7);
    const recentVals = recentDates.map((d) => mData.get(d)!);
    const recentRange = recentVals.length > 0
      ? Math.max(...recentVals) - Math.min(...recentVals)
      : 0;
    const recentClose = recentVals.length > 0 ? recentVals[recentVals.length - 1] : 0;

    candlestickInsights.push({
      type: "candlestick",
      id: `cs:${m.metric_id}`,
      metricId: m.metric_id,
      metricName: m.metric_name || m.metric_id,
      metricType: m.type,
      recentRange: Math.round(recentRange * 100) / 100,
      recentClose: Math.round(recentClose * 100) / 100,
      volatility: Math.round(cv * 1000) / 1000,
      involvesPrivate: privateMetricIds.has(m.metric_id),
      higherIsBetter: higherIsBetterMap.get(m.metric_id) ?? true,
    });
  }

  // Sort by volatility desc
  candlestickInsights.sort((a, b) => b.volatility - a.volatility);

  const response: InsightsResponse = {
    checkboxNumeric: checkboxNumericInsights.slice(0, 20),
    checkboxCheckbox: checkboxCheckboxInsights.slice(0, 10),
    numericNumeric: numericNumericInsights.slice(0, 15),
    timeLagged: timeLaggedInsights.slice(0, 15),
    dayOfWeek: dayOfWeekInsights.slice(0, 10),
    trends: trendInsights.slice(0, 10),
    histograms: histogramInsights.slice(0, 10),
    cumulative: cumulativeInsights.slice(0, 8),
    yearOverYear: yearOverYearInsights.slice(0, 8),
    streakTimelines: streakTimelineInsights.slice(0, 8),
    candlesticks: candlestickInsights.slice(0, 8),
    totalDays,
    dateRange,
  };

  return NextResponse.json(response);
}
