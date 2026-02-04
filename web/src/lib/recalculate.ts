// web/src/lib/recalculate.ts
import { SupabaseClient } from "@supabase/supabase-js";
import { evaluateCalculatedMetricsV2, MetricDef } from "./calc";
import { addDays, getLocalDateString } from "./dateUtils";

type LogRow = {
  date: string;
  metric_id: string;
  value: number | null;
};

type ConfigRow = {
  metric_id: string;
  type: "checkbox" | "number" | "score" | "count" | "time" | "hhmm" | "text";
  is_calculated: boolean;
  calc_expr: string | null;
};

/**
 * Get the maximum prev() lookback days from all calc_expr formulas
 */
function getMaxPrevDays(configs: ConfigRow[]): number {
  let maxN = 1;
  const re = /prev\(\s*[a-zA-Z0-9_]+\s*(?:,\s*(\d+)\s*)?\)/g;

  for (const c of configs) {
    if (!c.is_calculated || !c.calc_expr) continue;
    let match: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((match = re.exec(c.calc_expr)) !== null) {
      const n = match[1] ? Number(match[1]) : 1;
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }
  }

  return Math.max(1, Math.min(365, Math.floor(maxN)));
}

/**
 * Check if any calculated metrics use prev() - meaning they depend on previous days
 */
function hasAnyPrevDependency(configs: ConfigRow[]): boolean {
  return configs.some(
    (c) => c.is_calculated && c.calc_expr && c.calc_expr.includes("prev(")
  );
}

/**
 * Build numeric context from log rows for a specific date
 */
function buildContextFromRows(
  configs: ConfigRow[],
  rows: LogRow[],
  targetDate: string
): Record<string, number | null> {
  const ctx: Record<string, number | null> = {};
  const dateRows = rows.filter((r) => r.date === targetDate);
  const rowMap = new Map(dateRows.map((r) => [r.metric_id, r.value]));

  for (const c of configs) {
    const v = rowMap.get(c.metric_id);
    if (v == null) {
      ctx[c.metric_id] = null;
    } else if (c.type === "checkbox") {
      ctx[c.metric_id] = v >= 0.5 ? 1 : 0;
    } else {
      ctx[c.metric_id] = Number.isFinite(v) ? v : null;
    }
  }

  return ctx;
}

/**
 * Build prevByN context for a target date from log rows
 */
function buildPrevByN(
  configs: ConfigRow[],
  rows: LogRow[],
  targetDate: string,
  maxN: number
): Record<number, Record<string, number | null>> {
  const prevByN: Record<number, Record<string, number | null>> = {};

  for (let n = 1; n <= maxN; n++) {
    const prevDate = addDays(targetDate, -n);
    prevByN[n] = buildContextFromRows(configs, rows, prevDate);
  }

  return prevByN;
}

export type ProgressCallback = (progress: {
  current: number;
  total: number;
  date: string;
  percent: number;
}) => void;

/**
 * Recalculate all calculated metrics from a given date forward to today.
 * This should be called after saving a day's data.
 *
 * @param supabase - Supabase client with appropriate permissions
 * @param ownerId - The user's owner_id
 * @param fromDate - The date that was just saved (recalc starts from fromDate + 1)
 * @param toDate - Optional end date (defaults to today)
 * @param onProgress - Optional callback for progress updates
 * @returns Object with success status and any errors
 */
export async function recalculateFromDate(
  supabase: SupabaseClient,
  ownerId: string,
  fromDate: string,
  toDate?: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; daysProcessed: number; errors: string[] }> {
  const errors: string[] = [];
  const today = toDate || getLocalDateString();

  // Don't recalculate future dates
  if (fromDate >= today) {
    return { success: true, daysProcessed: 0, errors: [] };
  }

  // Load metric configs
  const { data: configData, error: configError } = await supabase
    .from("config")
    .select("metric_id, type, is_calculated, calc_expr")
    .eq("owner_id", ownerId)
    .eq("active", true);

  if (configError) {
    return { success: false, daysProcessed: 0, errors: [configError.message] };
  }

  const configs = (configData || []) as ConfigRow[];
  const calculatedConfigs = configs.filter((c) => c.is_calculated && c.calc_expr);

  // If no calculated metrics exist, nothing to do
  if (calculatedConfigs.length === 0) {
    return { success: true, daysProcessed: 0, errors: [] };
  }

  const maxN = hasAnyPrevDependency(configs) ? getMaxPrevDays(configs) : 0;

  // Calculate date range for log data we need to fetch
  // We need from (fromDate - maxN) to today for prev() lookups
  const dataStartDate = addDays(fromDate, -maxN);
  const startDate = addDays(fromDate, 1); // Start recalculating from day after saved date

  // Load all log data in the range (paginated to avoid Supabase row limits)
  const logs: LogRow[] = [];
  const PAGE_SIZE = 1000;
  let logOffset = 0;
  let hasMoreLogs = true;

  while (hasMoreLogs) {
    const { data: logData, error: logError } = await supabase
      .from("log")
      .select("date, metric_id, value")
      .eq("owner_id", ownerId)
      .gte("date", dataStartDate)
      .lte("date", today)
      .order("date", { ascending: true })
      .range(logOffset, logOffset + PAGE_SIZE - 1);

    if (logError) {
      return { success: false, daysProcessed: 0, errors: [logError.message] };
    }

    const rows = (logData || []) as LogRow[];
    logs.push(...rows);
    hasMoreLogs = rows.length === PAGE_SIZE;
    logOffset += PAGE_SIZE;
    if (logOffset > 500000) break;
  }

  // Get all unique dates that have data and need recalculation
  const datesToProcess: string[] = [];
  let currentDate = startDate;
  while (currentDate <= today) {
    datesToProcess.push(currentDate);
    currentDate = addDays(currentDate, 1);
  }

  // Convert configs to MetricDef format for the calc engine
  const metricDefs: MetricDef[] = configs.map((c) => ({
    metric_id: c.metric_id,
    type: c.type,
    is_calculated: c.is_calculated,
    calc_expr: c.calc_expr,
  }));

  let daysProcessed = 0;
  const BATCH_SIZE = 10;
  let pendingUpserts: { owner_id: string; date: string; metric_id: string; value: number | null }[] = [];
  let pendingDeletes: { date: string; metricIds: string[] }[] = [];

  // Flush pending DB writes
  const flushWrites = async () => {
    if (pendingUpserts.length > 0) {
      const { error: upsertError } = await supabase
        .from("log")
        .upsert(pendingUpserts, { onConflict: "owner_id,date,metric_id" });
      if (upsertError) {
        errors.push(`batch upsert: ${upsertError.message}`);
      }
      pendingUpserts = [];
    }
    for (const del of pendingDeletes) {
      if (del.metricIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("log")
          .delete()
          .eq("owner_id", ownerId)
          .eq("date", del.date)
          .in("metric_id", del.metricIds);
        if (deleteError) {
          errors.push(`${del.date} delete: ${deleteError.message}`);
        }
      }
    }
    pendingDeletes = [];
  };

  // Process each date
  for (const date of datesToProcess) {
    // Build context for this date (non-calculated values only)
    const ctxToday = buildContextFromRows(configs, logs, date);

    // Build prevByN for this date
    const prevByN = maxN > 0 ? buildPrevByN(configs, logs, date, maxN) : {};

    // Run calculation engine
    const { values, errors: calcErrors } = evaluateCalculatedMetricsV2(
      metricDefs,
      ctxToday,
      prevByN
    );

    // Collect any calc errors
    for (const [metricId, err] of Object.entries(calcErrors)) {
      if (err) {
        errors.push(`${date}/${metricId}: ${err}`);
      }
    }

    const dateDeletes: string[] = [];

    for (const c of calculatedConfigs) {
      const newValue = values[c.metric_id];

      if (newValue != null) {
        pendingUpserts.push({
          owner_id: ownerId,
          date,
          metric_id: c.metric_id,
          value: newValue,
        });
        // Update local logs array immediately for subsequent days' prev() lookups
        const idx = logs.findIndex((l) => l.date === date && l.metric_id === c.metric_id);
        if (idx >= 0) {
          logs[idx].value = newValue;
        } else {
          logs.push({ date, metric_id: c.metric_id, value: newValue });
        }
      } else {
        dateDeletes.push(c.metric_id);
      }
    }

    if (dateDeletes.length > 0) {
      pendingDeletes.push({ date, metricIds: dateDeletes });
    }

    daysProcessed++;

    // Flush writes and report progress every BATCH_SIZE dates
    if (daysProcessed % BATCH_SIZE === 0 || daysProcessed === datesToProcess.length) {
      await flushWrites();

      if (onProgress) {
        onProgress({
          current: daysProcessed,
          total: datesToProcess.length,
          date,
          percent: Math.round((daysProcessed / datesToProcess.length) * 100),
        });
      }
    }
  }

  // Final flush
  await flushWrites();

  return {
    success: errors.length === 0,
    daysProcessed,
    errors,
  };
}

/**
 * Backfill all calculated metrics from the beginning of time to today.
 * Use sparingly - this can be expensive for large datasets.
 */
export async function backfillAllCalculations(
  supabase: SupabaseClient,
  ownerId: string,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; daysProcessed: number; errors: string[] }> {
  // Find the earliest log date
  const { data: earliest, error: earliestError } = await supabase
    .from("log")
    .select("date")
    .eq("owner_id", ownerId)
    .order("date", { ascending: true })
    .limit(1)
    .single();

  if (earliestError && earliestError.code !== "PGRST116") {
    return { success: false, daysProcessed: 0, errors: [earliestError.message] };
  }

  if (!earliest) {
    return { success: true, daysProcessed: 0, errors: [] };
  }

  // Start from one day before the earliest to ensure we process from the beginning
  const startDate = addDays(earliest.date, -1);

  return recalculateFromDate(supabase, ownerId, startDate, undefined, onProgress);
}
