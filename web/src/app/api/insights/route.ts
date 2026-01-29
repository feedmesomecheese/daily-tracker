import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type Metric = {
  metric_id: string;
  metric_name: string | null;
  type: string;
  private: boolean | null;
};

type LogRow = {
  metric_id: string;
  date: string;
  value: number | null;
};

type CorrelationInsight = {
  type: "checkbox_numeric";
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
};

type CheckboxCheckboxInsight = {
  type: "checkbox_checkbox";
  metricAId: string;
  metricAName: string;
  metricBId: string;
  metricBName: string;
  rateWhenATrue: number; // rate of B being true when A is true
  rateWhenAFalse: number; // rate of B being true when A is false
  percentDiff: number;
  daysATrue: number;
  daysAFalse: number;
};

type InsightsResponse = {
  checkboxNumeric: CorrelationInsight[];
  checkboxCheckbox: CheckboxCheckboxInsight[];
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

  // Get all active metrics
  const { data: metrics, error: configError } = await supabase
    .from("config")
    .select("metric_id, metric_name, type, private")
    .eq("owner_id", user.id)
    .eq("active", true);

  if (configError) {
    return NextResponse.json(
      { error: `Failed to load config: ${configError.message}` },
      { status: 500 }
    );
  }

  const allMetrics = ((metrics ?? []) as Metric[]).filter(
    (m) => showPrivate || !m.private
  );

  const checkboxMetrics = allMetrics.filter((m) => m.type === "checkbox");
  const numericMetrics = allMetrics.filter((m) =>
    ["number", "score", "time", "hhmm", "count"].includes(m.type)
  );

  const metricIds = allMetrics.map((m) => m.metric_id);

  if (metricIds.length === 0) {
    const empty: InsightsResponse = {
      checkboxNumeric: [],
      checkboxCheckbox: [],
      totalDays: 0,
      dateRange: null,
    };
    return NextResponse.json(empty);
  }

  // Load all logs
  const { data: logs, error: logError } = await supabase
    .from("log")
    .select("metric_id, date, value")
    .eq("owner_id", user.id)
    .in("metric_id", metricIds)
    .order("date", { ascending: true });

  if (logError) {
    return NextResponse.json(
      { error: `Failed to load logs: ${logError.message}` },
      { status: 500 }
    );
  }

  const logRows = (logs ?? []) as LogRow[];

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
        metricAId: metricA.metric_id,
        metricAName: metricA.metric_name || metricA.metric_id,
        metricBId: metricB.metric_id,
        metricBName: metricB.metric_name || metricB.metric_id,
        rateWhenATrue: Math.round(rateWhenATrue * 10) / 10,
        rateWhenAFalse: Math.round(rateWhenAFalse * 10) / 10,
        percentDiff: Math.round(percentDiff * 10) / 10,
        daysATrue,
        daysAFalse,
      });
    }
  }

  // Sort by absolute difference
  checkboxCheckboxInsights.sort(
    (a, b) => Math.abs(b.percentDiff) - Math.abs(a.percentDiff)
  );

  const response: InsightsResponse = {
    checkboxNumeric: checkboxNumericInsights.slice(0, 20), // Top 20
    checkboxCheckbox: checkboxCheckboxInsights.slice(0, 10), // Top 10
    totalDays,
    dateRange,
  };

  return NextResponse.json(response);
}
