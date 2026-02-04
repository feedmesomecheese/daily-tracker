import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type Metric = {
  metric_id: string;
  metric_name: string | null;
  type: string;
  private: boolean | null;
  is_calculated: boolean | null;
  calc_expr: string | null;
  analytics_config: {
    higher_is_better?: boolean;
  } | null;
};

type LogRow = {
  metric_id: string;
  date: string;
  value: number | null;
};

type CorrelationInsight = {
  type: "checkbox_numeric";
  id: string; // unique key for dismissing
  checkboxMetricId: string;
  checkboxMetricName: string;
  numericMetricId: string;
  numericMetricName: string;
  avgWhenTrue: number;
  avgWhenFalse: number;
  percentDiff: number;
  daysTrue: number;
  daysFalse: number;
  direction: "higher" | "lower";
  involvesPrivate: boolean;
  numericHigherIsBetter: boolean;
};

type CheckboxCheckboxInsight = {
  type: "checkbox_checkbox";
  id: string; // unique key for dismissing
  metricAId: string;
  metricAName: string;
  metricBId: string;
  metricBName: string;
  rateWhenATrue: number; // rate of B being true when A is true
  rateWhenAFalse: number; // rate of B being true when A is false
  percentDiff: number;
  daysATrue: number;
  daysAFalse: number;
  involvesPrivate: boolean;
};

type NumericNumericInsight = {
  type: "numeric_numeric";
  id: string;
  metricAId: string;
  metricAName: string;
  metricBId: string;
  metricBName: string;
  correlation: number; // Pearson r
  direction: "positive" | "negative";
  daysOverlap: number;
  involvesPrivate: boolean;
  metricAHigherIsBetter: boolean;
  metricBHigherIsBetter: boolean;
};

type TimeLaggedInsight = {
  type: "time_lagged";
  id: string;
  triggerMetricId: string;
  triggerMetricName: string;
  outcomeMetricId: string;
  outcomeMetricName: string;
  avgNextDayWhenTrue: number;
  avgNextDayWhenFalse: number;
  percentDiff: number;
  direction: "higher" | "lower";
  daysTrue: number;
  daysFalse: number;
  involvesPrivate: boolean;
  outcomeHigherIsBetter: boolean;
};

type DayOfWeekInsight = {
  type: "day_of_week";
  id: string;
  metricId: string;
  metricName: string;
  metricType: string;
  bestDay: string;
  worstDay: string;
  bestAvg: number;
  worstAvg: number;
  overallAvg: number;
  dayAverages: { day: string; avg: number }[];
  involvesPrivate: boolean;
  higherIsBetter: boolean;
};

type TrendInsight = {
  type: "trend";
  id: string;
  metricId: string;
  metricName: string;
  metricType: string;
  recentAvg: number;
  priorAvg: number;
  percentChange: number;
  direction: "up" | "down";
  recentDays: number;
  priorDays: number;
  involvesPrivate: boolean;
  higherIsBetter: boolean;
};

type InsightsResponse = {
  checkboxNumeric: CorrelationInsight[];
  checkboxCheckbox: CheckboxCheckboxInsight[];
  numericNumeric: NumericNumericInsight[];
  timeLagged: TimeLaggedInsight[];
  dayOfWeek: DayOfWeekInsight[];
  trends: TrendInsight[];
  totalDays: number;
  dateRange: { first: string; last: string } | null;
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
  // This helps us filter out redundant correlations (e.g., "When A, calculated(A+B) is higher")
  const calculatedDependencies = new Map<string, Set<string>>();
  for (const m of allMetrics) {
    if (m.is_calculated && m.calc_expr) {
      const refs = new Set<string>();
      // Extract identifiers from the formula - metric IDs are used directly like: sleep_hours + mood
      // Identifier pattern: starts with letter/underscore, followed by letters/numbers/underscores
      const regex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
      let match;
      while ((match = regex.exec(m.calc_expr)) !== null) {
        const id = match[0];
        // Only add if it's an actual metric ID (not a function name like "prev", "diff", "avg", etc.)
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
      totalDays: 0,
      dateRange: null,
    };
    return NextResponse.json(empty);
  }

  // Load all logs (fetch all for this user, filter by metric in code)
  // Using range() to paginate and get all data
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
    // Filter to only metrics we care about
    const filtered = rows.filter((r) => metricIds.includes(r.metric_id));
    allLogs.push(...filtered);

    hasMore = rows.length === PAGE_SIZE;
    offset += PAGE_SIZE;

    // Safety limit to prevent infinite loops
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

      // Skip if the checkbox is a dependency of this calculated metric (redundant correlation)
      const deps = calculatedDependencies.get(num.metric_id);
      if (deps && deps.has(cb.metric_id)) continue;

      // Find overlapping dates where both have values
      const valuesWhenTrue: number[] = [];
      const valuesWhenFalse: number[] = [];

      for (const date of sortedDates) {
        const cbVal = cbData.get(date);
        const numVal = numData.get(date);

        // Only include if numeric metric has a value for this date
        if (numVal == null) continue;

        const isTrue = cbVal != null && cbVal !== 0;

        if (isTrue) {
          valuesWhenTrue.push(numVal);
        } else {
          valuesWhenFalse.push(numVal);
        }
      }

      // Check minimum data requirements
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

      // Calculate percent difference (relative to avgFalse as baseline)
      if (avgFalse === 0 && avgTrue === 0) continue;

      const percentDiff =
        avgFalse !== 0
          ? ((avgTrue - avgFalse) / Math.abs(avgFalse)) * 100
          : avgTrue > 0
          ? 100
          : -100;

      // Only include if difference is meaningful
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

  // Sort by absolute percent difference (strongest correlations first)
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

        // Only count if both metrics have data for this date
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

  // Sort by absolute difference
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

      // Skip if one is a calculated metric depending on the other
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

  // Build a set for quick next-day lookup
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
        // Get next day
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
  const MIN_DOW_DIFF = 10; // percent difference from overall avg

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

    // Need enough data for each day
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

    // Only include if best or worst day deviates meaningfully
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

  // Sort by spread between best and worst day
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

  const response: InsightsResponse = {
    checkboxNumeric: checkboxNumericInsights.slice(0, 20),
    checkboxCheckbox: checkboxCheckboxInsights.slice(0, 10),
    numericNumeric: numericNumericInsights.slice(0, 15),
    timeLagged: timeLaggedInsights.slice(0, 15),
    dayOfWeek: dayOfWeekInsights.slice(0, 10),
    trends: trendInsights.slice(0, 10),
    totalDays,
    dateRange,
  };

  return NextResponse.json(response);
}
