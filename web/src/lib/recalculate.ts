// web/src/lib/recalculate.ts
import { SupabaseClient } from "@supabase/supabase-js";
import { evaluateCalculatedMetricsV2, MetricDef } from "./calc";

type LogRow = {
  date: string;
  metric_id: string;
  value: number | null;
};

type ConfigRow = {
  metric_id: string;
  type: "checkbox" | "number" | "time" | "hhmm" | "text";
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
    const dt = new Date(targetDate + "T00:00:00");
    dt.setDate(dt.getDate() - n);
    const prevDate = dt.toISOString().slice(0, 10);
    prevByN[n] = buildContextFromRows(configs, rows, prevDate);
  }

  return prevByN;
}

/**
 * Add days to a date string
 */
function addDays(dateStr: string, days: number): string {
  const dt = new Date(dateStr + "T00:00:00");
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * Get today's date in YYYY-MM-DD format
 */
function getTodayISO(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

/**
 * Recalculate all calculated metrics from a given date forward to today.
 * This should be called after saving a day's data.
 *
 * @param supabase - Supabase client with appropriate permissions
 * @param ownerId - The user's owner_id
 * @param fromDate - The date that was just saved (recalc starts from fromDate + 1)
 * @param toDate - Optional end date (defaults to today)
 * @returns Object with success status and any errors
 */
export async function recalculateFromDate(
  supabase: SupabaseClient,
  ownerId: string,
  fromDate: string,
  toDate?: string
): Promise<{ success: boolean; daysProcessed: number; errors: string[] }> {
  const errors: string[] = [];
  const today = toDate || getTodayISO();

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

  // If no calculated metrics use prev(), nothing to recalculate
  if (!hasAnyPrevDependency(configs)) {
    return { success: true, daysProcessed: 0, errors: [] };
  }

  const maxN = getMaxPrevDays(configs);

  // Calculate date range for log data we need to fetch
  // We need from (fromDate - maxN) to today for prev() lookups
  const dataStartDate = addDays(fromDate, -maxN);
  const startDate = addDays(fromDate, 1); // Start recalculating from day after saved date

  // Load all log data in the range
  const { data: logData, error: logError } = await supabase
    .from("log")
    .select("date, metric_id, value")
    .eq("owner_id", ownerId)
    .gte("date", dataStartDate)
    .lte("date", today)
    .order("date", { ascending: true });

  if (logError) {
    return { success: false, daysProcessed: 0, errors: [logError.message] };
  }

  const logs = (logData || []) as LogRow[];

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

  // Process each date
  for (const date of datesToProcess) {
    // Build context for this date (non-calculated values only)
    const ctxToday = buildContextFromRows(configs, logs, date);

    // Build prevByN for this date
    const prevByN = buildPrevByN(configs, logs, date, maxN);

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

    // Prepare upserts for calculated values
    const upserts: { owner_id: string; date: string; metric_id: string; value: number | null }[] = [];
    const deletes: string[] = [];

    for (const c of calculatedConfigs) {
      const newValue = values[c.metric_id];

      if (newValue != null) {
        upserts.push({
          owner_id: ownerId,
          date,
          metric_id: c.metric_id,
          value: newValue,
        });
      } else {
        // If calculated value is null, we might want to delete the row
        deletes.push(c.metric_id);
      }
    }

    // Upsert calculated values
    if (upserts.length > 0) {
      const { error: upsertError } = await supabase
        .from("log")
        .upsert(upserts, { onConflict: "owner_id,date,metric_id" });

      if (upsertError) {
        errors.push(`${date} upsert: ${upsertError.message}`);
      }
    }

    // Delete null calculated values
    if (deletes.length > 0) {
      const { error: deleteError } = await supabase
        .from("log")
        .delete()
        .eq("owner_id", ownerId)
        .eq("date", date)
        .in("metric_id", deletes);

      if (deleteError) {
        errors.push(`${date} delete: ${deleteError.message}`);
      }
    }

    // Update our local logs array with the new calculated values for subsequent days
    for (const u of upserts) {
      // Remove old entry if exists
      const idx = logs.findIndex((l) => l.date === u.date && l.metric_id === u.metric_id);
      if (idx >= 0) {
        logs[idx].value = u.value;
      } else {
        logs.push({ date: u.date, metric_id: u.metric_id, value: u.value });
      }
    }

    daysProcessed++;
  }

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
  ownerId: string
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

  return recalculateFromDate(supabase, ownerId, startDate);
}
