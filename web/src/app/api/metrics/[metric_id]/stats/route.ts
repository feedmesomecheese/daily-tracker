import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { getLocalDateString, addDays } from "@/lib/dateUtils";
import { evaluateCalculatedMetricsV2, MetricDef } from "@/lib/calc";
import { calculateAllGoalProgress, Goal, GoalProgress } from "@/lib/goals";

type MetricConfig = {
  metric_id: string;
  metric_name: string;
  type: "checkbox" | "number" | "score" | "count" | "time" | "hhmm" | "text";
  start_date: string | null;
  is_calculated: boolean;
  calc_expr: string | null;
  analytics_config: {
    avoid?: boolean; // deprecated
    direction?: "increase" | "decrease" | "neutral";
    higher_is_better?: boolean;
    show_streak?: boolean;
  } | null;
  goals_config: {
    goals?: Goal[];
  } | null;
};

type LogRow = {
  date: string;
  value: number | null;
};

type StreakInfo = {
  value: number;
  startDate: string;
  endDate: string;
};

type ValueWithDate = {
  value: number;
  date: string;
};

type StatsResponse = {
  metric: {
    id: string;
    name: string;
    type: string;
    startDate: string | null;
    trackingSince: string | null;
    isAvoid: boolean; // deprecated, use direction
    direction: "increase" | "decrease" | "neutral";
    isCalculated: boolean;
    showStreak: boolean; // Whether to display streak section
  };
  streaks: {
    current: number;
    best: StreakInfo | null;
    worstDrySpell: StreakInfo | null;
  };
  frequency: {
    totalDaysLogged: number;
    totalDaysPossible: number;
    percentLogged: number;
    avgPerWeek: number;
    avgPerMonth: number;
    avgDaysBetween: number;
    rolling30DayAvgBetween: number | null;
  };
  // Number metric specific stats
  numberStats?: {
    lifetimeAvg: number;
    high: ValueWithDate | null;
    low: ValueWithDate | null;
    periodAverages: {
      days7: number | null;
      days30: number | null;
      days90: number | null;
      days180: number | null;
    };
    trend: "up" | "down" | "stable" | null; // 30-day vs 90-day comparison
    // Time totals (only for time metrics, values in minutes)
    timeTotals?: {
      thisWeek: number;
      thisMonth: number;
      thisYear: number;
      lifetime: number;
    };
    // HHMM-specific stats (point-in-time like wake/sleep time)
    hhmmStats?: {
      avgTime: number; // minutes from midnight
      stdDev: number; // standard deviation in minutes
      earliest: ValueWithDate | null;
      latest: ValueWithDate | null;
    };
  };
  comparisons: {
    ytd: { count: number; daysInPeriod: number; avg?: number };
    prevYtd: { count: number; daysInPeriod: number; avg?: number };
    thisMonth: { count: number; daysInPeriod: number; avg?: number };
    sameMonthLastYear: { count: number; daysInPeriod: number; avg?: number };
  };
  dayOfWeekBreakdown: Record<string, number>;
  dayOfWeekAverages?: Record<string, number | null>; // For number metrics
  movingAverages: { date: string; raw: number | null; ma7: number | null; ma30: number | null; ma90: number | null; ma180: number | null }[];
  // Goals data
  goals?: {
    active: GoalProgress[];
  };
};

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase: null, user: null };
  }
  return { supabase, user };
}

// Helper: get day of week name from YYYY-MM-DD
function getDayOfWeek(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
}

// Helper: get number of days between two YYYY-MM-DD strings
function daysBetween(startDate: string, endDate: string): number {
  const [y1, m1, d1] = startDate.split("-").map(Number);
  const [y2, m2, d2] = endDate.split("-").map(Number);
  const date1 = new Date(y1, m1 - 1, d1);
  const date2 = new Date(y2, m2 - 1, d2);
  return Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
}

// Helper: check if a day has a logged value (non-null)
function hasValue(value: number | null): boolean {
  return value !== null;
}

// Helper: check if value is "truthy" for checkbox metrics (for chart MA calculations)
function isTruthy(value: number | null): boolean {
  return value != null && value >= 0.5;
}

// Calculate streaks for any metric type
// Uses same logic as indicators API for consistency
function calculateStreaks(
  logs: LogRow[],
  firstLogDate: string,
  today: string,
  isAvoidMetric: boolean = false,
  metricType: string = "checkbox",
  isCalculated: boolean = false
): { current: number; best: StreakInfo | null; worstDrySpell: StreakInfo | null } {
  if (logs.length === 0) {
    return {
      current: 0,
      best: null,
      worstDrySpell: null,
    };
  }

  // Build a set of "active" dates
  // For checkbox: only count CHECKED values (value >= 0.5) as "done"
  // For number/time: count any non-null value as "logged"
  const loggedDates = new Set<string>();
  const allLoggedDates = new Set<string>(); // All dates with any log entry

  for (const log of logs) {
    allLoggedDates.add(log.date);
    if (metricType === "checkbox") {
      // For checkbox, only checked (truthy) values count
      if (isTruthy(log.value)) {
        loggedDates.add(log.date);
      }
    } else if (metricType === "count") {
      // For count, non-zero values count (like checkbox behavior)
      const num = Number(log.value);
      if (!isNaN(num) && num !== 0) {
        loggedDates.add(log.date);
      }
    } else {
      // For number/score/time/hhmm, any non-null value counts
      if (hasValue(log.value)) {
        loggedDates.add(log.date);
      }
    }
  }

  // Sanity check: firstLogDate should not be after today
  if (firstLogDate > today) {
    return {
      current: 0,
      best: null,
      worstDrySpell: null,
    };
  }

  // For checkbox/count metrics, we need to determine the first ACTIVE date for streak boundaries
  // (first date where value was truthy/non-zero, not just first log entry)
  let effectiveFirstDate = firstLogDate;
  if ((metricType === "checkbox" || metricType === "count") && loggedDates.size > 0) {
    // Get earliest date from the set
    effectiveFirstDate = Array.from(loggedDates).sort()[0];
  }

  // For calculated metrics, we can only consider dates where we have data
  // Use the last logged date instead of today for current streak calculation
  let effectiveToday = today;
  if (isCalculated && allLoggedDates.size > 0) {
    const sortedDates = Array.from(allLoggedDates).sort();
    effectiveToday = sortedDates[sortedDates.length - 1];
    // But if effectiveToday is today or after, use today
    if (effectiveToday > today) {
      effectiveToday = today;
    }
  }

  // Calculate current streak by walking backwards from effectiveToday
  const currentStreak = calculateCurrentStreak(loggedDates, effectiveToday, effectiveFirstDate);

  // Find best streak and worst dry spell by scanning all data
  // For calculated metrics, only scan the range where we have data
  const scanEndDate = isCalculated ? effectiveToday : today;
  const { bestStreak, worstDrySpell } = findBestAndWorstStreaks(
    loggedDates,
    effectiveFirstDate,
    scanEndDate,
    isAvoidMetric
  );

  // Final validation
  const validatedBest = bestStreak && bestStreak.value > 0 && Number.isFinite(bestStreak.value) ? bestStreak : null;
  const validatedWorst = worstDrySpell && worstDrySpell.value > 0 && Number.isFinite(worstDrySpell.value) ? worstDrySpell : null;

  return { current: currentStreak, best: validatedBest, worstDrySpell: validatedWorst };
}

// Calculate current streak value (walking backwards from today)
function calculateCurrentStreak(
  loggedDates: Set<string>,
  today: string,
  earliestDate: string
): number {
  if (today < earliestDate) {
    return 0;
  }

  const todayLogged = loggedDates.has(today);
  let count = 0;
  let checkDate = today;

  if (todayLogged) {
    // Count consecutive logged days
    while (checkDate >= earliestDate && loggedDates.has(checkDate)) {
      count++;
      checkDate = addDays(checkDate, -1);
    }
    return count; // Positive
  } else {
    // Count consecutive not-logged days
    while (checkDate >= earliestDate && !loggedDates.has(checkDate)) {
      count++;
      checkDate = addDays(checkDate, -1);
    }
    return -count; // Negative
  }
}

// Find best streak and worst dry spell by walking through all data
function findBestAndWorstStreaks(
  loggedDates: Set<string>,
  startDate: string,
  endDate: string,
  isAvoidMetric: boolean
): { bestStreak: StreakInfo | null; worstDrySpell: StreakInfo | null } {
  let bestStreak: StreakInfo | null = null;
  let worstDrySpell: StreakInfo | null = null;

  let streakStart: string | null = null;
  let drySpellStart: string | null = null;
  let runningStreak = 0;
  let runningDrySpell = 0;

  let curDate = startDate;
  while (curDate <= endDate) {
    if (loggedDates.has(curDate)) {
      // Logged day
      if (runningDrySpell > 0) {
        // End dry spell - for avoid metrics, this could be "best"
        const drySpellInfo: StreakInfo = {
          value: runningDrySpell,
          startDate: drySpellStart!,
          endDate: addDays(curDate, -1),
        };

        if (isAvoidMetric) {
          // For avoid metrics: longer dry spell = better (you avoided it longer)
          if (!bestStreak || runningDrySpell > bestStreak.value) {
            bestStreak = drySpellInfo;
          }
        } else {
          // For normal metrics: dry spell is bad
          if (!worstDrySpell || runningDrySpell > worstDrySpell.value) {
            worstDrySpell = drySpellInfo;
          }
        }
        runningDrySpell = 0;
        drySpellStart = null;
      }

      if (runningStreak === 0) {
        streakStart = curDate;
      }
      runningStreak++;

      // For avoid metrics: consecutive logging = worst (you kept doing it)
      // For normal metrics: consecutive logging = best
      const streakInfo: StreakInfo = {
        value: runningStreak,
        startDate: streakStart!,
        endDate: curDate,
      };

      if (isAvoidMetric) {
        if (!worstDrySpell || runningStreak > worstDrySpell.value) {
          worstDrySpell = streakInfo;
        }
      } else {
        if (!bestStreak || runningStreak > bestStreak.value) {
          bestStreak = streakInfo;
        }
      }
    } else {
      // Not logged day
      if (runningStreak > 0) {
        runningStreak = 0;
        streakStart = null;
      }

      if (runningDrySpell === 0) {
        drySpellStart = curDate;
      }
      runningDrySpell++;

      // Check if current dry spell is notable
      const drySpellInfo: StreakInfo = {
        value: runningDrySpell,
        startDate: drySpellStart!,
        endDate: curDate,
      };

      if (isAvoidMetric) {
        if (!bestStreak || runningDrySpell > bestStreak.value) {
          bestStreak = drySpellInfo;
        }
      } else {
        if (!worstDrySpell || runningDrySpell > worstDrySpell.value) {
          worstDrySpell = drySpellInfo;
        }
      }
    }

    curDate = addDays(curDate, 1);
  }

  // Ensure values are valid positive numbers
  if (bestStreak && (bestStreak.value <= 0 || !Number.isFinite(bestStreak.value))) {
    bestStreak = null;
  }
  if (worstDrySpell && (worstDrySpell.value <= 0 || !Number.isFinite(worstDrySpell.value))) {
    worstDrySpell = null;
  }

  return { bestStreak, worstDrySpell };
}

// Calculate moving averages for a metric
function calculateMovingAverages(
  logs: LogRow[],
  startDate: string,
  today: string,
  metricType: string
): { date: string; raw: number | null; ma7: number | null; ma30: number | null; ma90: number | null; ma180: number | null }[] {
  // For checkbox, value is 1 (true) or 0 (false/missing)
  // Create a map of date -> value (use null to indicate "logged but null value")
  const valueMap = new Map<string, number | null>();
  for (const log of logs) {
    if (metricType === "checkbox") {
      valueMap.set(log.date, isTruthy(log.value) ? 1 : 0);
    } else {
      // Preserve null values - they indicate "logged but no value" vs "not in map" = "not logged"
      valueMap.set(log.date, log.value);
    }
  }

  const results: { date: string; raw: number | null; ma7: number | null; ma30: number | null; ma90: number | null; ma180: number | null }[] = [];

  // Calculate from start date to today, but only emit points weekly for ranges > 365 days
  // to keep response size reasonable while showing full history
  const totalDays = daysBetween(startDate, today);
  const sampleInterval = totalDays > 730 ? 7 : totalDays > 365 ? 3 : 1;

  let curDate = startDate;
  let dayIndex = 0;
  while (curDate <= today) {
    // Always include first day, last 30 days, and sampled points
    const isLastMonth = daysBetween(curDate, today) <= 30;
    const shouldInclude = dayIndex === 0 || isLastMonth || (dayIndex % sampleInterval === 0);

    if (shouldInclude) {
      const raw = valueMap.get(curDate) ?? null;
      const ma7 = calculateMA(valueMap, curDate, 7, metricType);
      const ma30 = calculateMA(valueMap, curDate, 30, metricType);
      const ma90 = calculateMA(valueMap, curDate, 90, metricType);
      const ma180 = calculateMA(valueMap, curDate, 180, metricType);

      results.push({ date: curDate, raw, ma7, ma30, ma90, ma180 });
    }

    curDate = addDays(curDate, 1);
    dayIndex++;
  }

  return results;
}

function calculateMA(
  valueMap: Map<string, number | null>,
  endDate: string,
  period: number,
  metricType: string
): number | null {
  let sum = 0;
  let count = 0;

  for (let i = 0; i < period; i++) {
    const date = addDays(endDate, -i);
    const hasEntry = valueMap.has(date);
    const value = valueMap.get(date);

    if (metricType === "checkbox") {
      // For checkbox, count logged true days vs total days
      sum += value ?? 0;
      count++;
    } else {
      // For numeric types, only count days with actual values (not null)
      if (hasEntry && value != null && Number.isFinite(value)) {
        sum += value;
        count++;
      }
    }
  }

  if (count === 0) return null;
  return Math.round((sum / count) * 1000) / 1000; // Round to 3 decimal places
}

// GET /api/metrics/[metric_id]/stats
export async function GET(
  req: Request,
  { params }: { params: Promise<{ metric_id: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { metric_id } = await params;
  if (!metric_id) {
    return NextResponse.json({ error: "metric_id is required" }, { status: 400 });
  }

  // Get metric config
  const { data: config, error: configError } = await supabase
    .from("config")
    .select("metric_id, metric_name, type, start_date, analytics_config, goals_config, is_calculated, calc_expr")
    .eq("owner_id", user.id)
    .eq("metric_id", metric_id)
    .single();

  if (configError || !config) {
    return NextResponse.json({ error: "Metric not found" }, { status: 404 });
  }

  const metricConfig = config as MetricConfig;

  // Only support non-text metrics for now
  if (metricConfig.type === "text") {
    return NextResponse.json(
      { error: "Stats not available for text metrics" },
      { status: 400 }
    );
  }

  let logRows: LogRow[] = [];

  if (metricConfig.is_calculated && metricConfig.calc_expr) {
    // For calculated metrics, we need to evaluate the expression for each date
    // First, get all metric configs
    const { data: allConfigs, error: allConfigError } = await supabase
      .from("config")
      .select("metric_id, metric_name, type, start_date, is_calculated, calc_expr")
      .eq("owner_id", user.id)
      .eq("active", true);

    if (allConfigError) {
      return NextResponse.json(
        { error: `Failed to load configs: ${allConfigError.message}` },
        { status: 500 }
      );
    }

    // Build MetricDef array for calc engine
    const metricDefs: MetricDef[] = (allConfigs ?? []).map((c: { metric_id: string; type: string; is_calculated: boolean; calc_expr: string | null }) => ({
      metric_id: c.metric_id,
      type: c.type as MetricDef["type"],
      is_calculated: c.is_calculated ?? false,
      calc_expr: c.calc_expr,
    }));

    // Get all logs for all metrics (needed for calc evaluation)
    // Supabase has a default/max limit of 1000 rows, so we need to paginate
    const PAGE_SIZE = 1000;
    let allLogs: { date: string; metric_id: string; value: number | null }[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: logs, error: allLogError } = await supabase
        .from("log")
        .select("date, metric_id, value")
        .eq("owner_id", user.id)
        .order("date", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (allLogError) {
        return NextResponse.json(
          { error: `Failed to load logs: ${allLogError.message}` },
          { status: 500 }
        );
      }

      const pageData = logs ?? [];
      allLogs = allLogs.concat(pageData);

      if (pageData.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
      }
    }

    // Group logs by date
    const logsByDate = new Map<string, Record<string, number | null>>();
    for (const log of allLogs ?? []) {
      if (!logsByDate.has(log.date)) {
        logsByDate.set(log.date, {});
      }
      logsByDate.get(log.date)![log.metric_id] = log.value;
    }

    // Get all unique dates and sort them
    const allDates = Array.from(logsByDate.keys()).sort();

    if (allDates.length > 0) {
      // For checkbox calculated metrics, we need to track truthy values
      let truthyCount = 0;
      let totalEvaluated = 0;

      // For each date, evaluate the calculated metric
      for (const date of allDates) {
        const dayContext = logsByDate.get(date) || {};

        // Build prevByN contexts (for prev() function)
        // We'll build contexts for prev(1) through prev(7) for simplicity
        const prevByN: Record<number, Record<string, number | null>> = {};
        const dateIdx = allDates.indexOf(date);
        for (let n = 1; n <= 7; n++) {
          const prevIdx = dateIdx - n;
          if (prevIdx >= 0) {
            prevByN[n] = logsByDate.get(allDates[prevIdx]) || {};
          }
        }

        const result = evaluateCalculatedMetricsV2(metricDefs, dayContext, prevByN);
        const value = result.values[metric_id];

        // Only add to logRows if we got a value (including 0 for checkbox)
        if (value !== null && value !== undefined) {
          logRows.push({ date, value });
          totalEvaluated++;
          if (metricConfig.type === "checkbox" && value >= 0.5) {
            truthyCount++;
          }
        }
      }

      // Debug log for calculated metrics
      console.log(`[Stats API] Calculated metric ${metric_id}: evaluated ${totalEvaluated} dates, ${metricConfig.type === "checkbox" ? `truthy=${truthyCount}` : ""}, logRows=${logRows.length}`);
    }
  } else {
    // Non-calculated metric: get logs directly
    // Supabase has a default/max limit of 1000 rows, so we need to paginate
    const PAGE_SIZE = 1000;
    let allLogs: LogRow[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: logs, error: logError } = await supabase
        .from("log")
        .select("date, value")
        .eq("owner_id", user.id)
        .eq("metric_id", metric_id)
        .order("date", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (logError) {
        return NextResponse.json(
          { error: `Failed to load logs: ${logError.message}` },
          { status: 500 }
        );
      }

      const pageData = (logs ?? []) as LogRow[];
      allLogs = allLogs.concat(pageData);

      if (pageData.length < PAGE_SIZE) {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
      }
    }

    logRows = allLogs;
  }
  const today = getLocalDateString();
  const currentYear = new Date().getFullYear();

  // Determine tracking start date - use first log date for accurate stats
  const firstLogDate = logRows.length > 0 ? logRows[0].date : null;
  // For frequency/percentage calculations, use first log date (not config start_date)
  const trackingStartDate = firstLogDate || today;

  // Determine direction with backward compatibility (avoid=true maps to decrease)
  const direction: "increase" | "decrease" | "neutral" =
    metricConfig.analytics_config?.direction ??
    (metricConfig.analytics_config?.avoid ? "decrease" : "increase");

  // For streak calculations, "decrease" means negative streaks are good (isAvoidMetric)
  const isAvoidMetric = direction === "decrease";

  // Debug log for direction detection
  console.log(`[Stats API] Metric ${metric_id}: analytics_config=${JSON.stringify(metricConfig.analytics_config)}, direction=${direction}, isAvoid=${isAvoidMetric}`);

  // Debug: show date range info
  const lastLogDate = logRows.length > 0 ? logRows[logRows.length - 1].date : null;
  console.log(`[Stats API] Metric ${metric_id}: today=${today}, firstLog=${trackingStartDate}, lastLog=${lastLogDate}, totalLogs=${logRows.length}`);

  // Calculate streaks - pass metric type and isCalculated for proper handling
  const isCalculated = metricConfig.is_calculated ?? false;
  const streaks = calculateStreaks(logRows, trackingStartDate, today, isAvoidMetric, metricConfig.type, isCalculated);

  // Debug: show streak result
  console.log(`[Stats API] Metric ${metric_id}: currentStreak=${streaks.current}, best=${streaks.best?.value ?? 'N/A'}, worst=${streaks.worstDrySpell?.value ?? 'N/A'}`);

  // Calculate frequency stats
  // For checkbox: count CHECKED days (truthy values)
  // For count: count days with non-zero values (like checkbox)
  // For number/score/time/hhmm: count any logged days (non-null values)
  const totalDaysPossible = daysBetween(trackingStartDate, today) + 1;
  let loggedDays: LogRow[];
  if (metricConfig.type === "checkbox") {
    loggedDays = logRows.filter((l) => isTruthy(l.value));
  } else if (metricConfig.type === "count") {
    loggedDays = logRows.filter((l) => {
      const num = Number(l.value);
      return !isNaN(num) && num !== 0;
    });
  } else {
    loggedDays = logRows.filter((l) => hasValue(l.value));
  }
  const totalDaysLogged = loggedDays.length;
  const percentLogged = totalDaysPossible > 0 ? Math.round((totalDaysLogged / totalDaysPossible) * 1000) / 10 : 0;

  // Average per week/month
  const weeksTracking = totalDaysPossible / 7;
  const monthsTracking = totalDaysPossible / 30.44;
  const avgPerWeek = weeksTracking > 0 ? Math.round((totalDaysLogged / weeksTracking) * 100) / 100 : 0;
  const avgPerMonth = monthsTracking > 0 ? Math.round((totalDaysLogged / monthsTracking) * 100) / 100 : 0;

  // Average days between events
  let avgDaysBetween = 0;
  let rolling30DayAvgBetween: number | null = null;

  if (loggedDays.length > 1) {
    const gaps: number[] = [];
    for (let i = 1; i < loggedDays.length; i++) {
      gaps.push(daysBetween(loggedDays[i - 1].date, loggedDays[i].date));
    }
    avgDaysBetween = Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 100) / 100;

    // Rolling 30-day average (using last 30 days of gaps)
    const last30DayDate = addDays(today, -30);
    const recentLogs = loggedDays.filter((l) => l.date >= last30DayDate);
    if (recentLogs.length > 1) {
      const recentGaps: number[] = [];
      for (let i = 1; i < recentLogs.length; i++) {
        recentGaps.push(daysBetween(recentLogs[i - 1].date, recentLogs[i].date));
      }
      rolling30DayAvgBetween = Math.round((recentGaps.reduce((a, b) => a + b, 0) / recentGaps.length) * 100) / 100;
    }
  }

  // Day of week breakdown - count ALL logs with hasValue (not just truthy for checkbox)
  const dayOfWeekBreakdown: Record<string, number> = {
    Mon: 0,
    Tue: 0,
    Wed: 0,
    Thu: 0,
    Fri: 0,
    Sat: 0,
    Sun: 0,
  };
  // Use loggedDays which is filtered by hasValue
  for (const log of loggedDays) {
    const dow = getDayOfWeek(log.date);
    if (dow in dayOfWeekBreakdown) {
      dayOfWeekBreakdown[dow]++;
    }
  }

  // Debug: log if breakdown is all zeros
  const totalBreakdown = Object.values(dayOfWeekBreakdown).reduce((a, b) => a + b, 0);
  if (totalBreakdown === 0 && loggedDays.length > 0) {
    console.warn(`Day of week breakdown is empty but has ${loggedDays.length} logged days`);
  }

  // YTD comparisons
  const ytdStart = `${currentYear}-01-01`;
  const ytdLogs = loggedDays.filter((l) => l.date >= ytdStart && l.date <= today);
  const ytdDays = daysBetween(ytdStart, today) + 1;

  const prevYtdStart = `${currentYear - 1}-01-01`;
  const prevYtdEnd = `${currentYear - 1}-${today.slice(5)}`; // Same month-day last year
  const prevYtdLogs = loggedDays.filter((l) => l.date >= prevYtdStart && l.date <= prevYtdEnd);
  const prevYtdDays = daysBetween(prevYtdStart, prevYtdEnd) + 1;

  // This month vs same month last year
  const thisMonthStart = today.slice(0, 8) + "01";
  const thisMonthLogs = loggedDays.filter((l) => l.date >= thisMonthStart && l.date <= today);
  const thisMonthDays = daysBetween(thisMonthStart, today) + 1;

  const lastYearMonthStart = `${currentYear - 1}-${today.slice(5, 7)}-01`;
  const lastYearMonthEnd = `${currentYear - 1}-${today.slice(5)}`;
  const sameMonthLastYearLogs = loggedDays.filter(
    (l) => l.date >= lastYearMonthStart && l.date <= lastYearMonthEnd
  );
  const sameMonthLastYearDays = daysBetween(lastYearMonthStart, lastYearMonthEnd) + 1;

  // Moving averages
  const movingAverages = calculateMovingAverages(logRows, trackingStartDate, today, metricConfig.type);

  // Determine if streaks should be shown
  // For checkbox: always show (unless explicitly disabled)
  // For number/time: only show if show_streak is true in analytics_config
  const showStreak = metricConfig.type === "checkbox"
    ? metricConfig.analytics_config?.show_streak !== false
    : metricConfig.analytics_config?.show_streak === true;

  // Number-specific stats
  let numberStats: StatsResponse["numberStats"] = undefined;
  let dayOfWeekAverages: Record<string, number | null> | undefined = undefined;

  if (["number", "score", "count", "time", "hhmm"].includes(metricConfig.type)) {
    // Get all valid numeric values
    const validValues = loggedDays.filter(l => l.value !== null).map(l => ({ value: l.value!, date: l.date }));

    if (validValues.length > 0) {
      // Lifetime average
      const sum = validValues.reduce((acc, v) => acc + v.value, 0);
      const lifetimeAvg = Math.round((sum / validValues.length) * 10) / 10;

      // High and low (most recent date if multiple)
      let high: ValueWithDate | null = null;
      let low: ValueWithDate | null = null;

      for (const v of validValues) {
        if (!high || v.value > high.value || (v.value === high.value && v.date > high.date)) {
          high = { value: v.value, date: v.date };
        }
        if (!low || v.value < low.value || (v.value === low.value && v.date > low.date)) {
          low = { value: v.value, date: v.date };
        }
      }

      // Period averages (excluding today if not logged)
      const calculatePeriodAvg = (days: number): number | null => {
        const startDate = addDays(today, -(days - 1));
        // Include today only if it has been logged
        const todayLogged = validValues.some(v => v.date === today);
        const endDate = todayLogged ? today : addDays(today, -1);

        const periodValues = validValues.filter(v => v.date >= startDate && v.date <= endDate);
        if (periodValues.length === 0) return null;

        const periodSum = periodValues.reduce((acc, v) => acc + v.value, 0);
        return Math.round((periodSum / periodValues.length) * 10) / 10;
      };

      const days7 = calculatePeriodAvg(7);
      const days30 = calculatePeriodAvg(30);
      const days90 = calculatePeriodAvg(90);
      const days180 = calculatePeriodAvg(180);

      // Trend: compare 30-day to 90-day average
      let trend: "up" | "down" | "stable" | null = null;
      if (days30 !== null && days90 !== null) {
        const diff = days30 - days90;
        const threshold = days90 * 0.05; // 5% threshold
        if (diff > threshold) trend = "up";
        else if (diff < -threshold) trend = "down";
        else trend = "stable";
      }

      // Calculate time totals for time metrics only (not hhmm which is a point-in-time)
      let timeTotals: { thisWeek: number; thisMonth: number; thisYear: number; lifetime: number } | undefined;
      if (metricConfig.type === "time") {
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-indexed

        // Get start of current week (Monday)
        const dayOfWeek = now.getDay();
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - daysFromMonday);
        const weekStartStr = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;

        // Get start of current month
        const monthStartStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;

        // Get start of current year
        const yearStartStr = `${currentYear}-01-01`;

        let thisWeek = 0;
        let thisMonth = 0;
        let thisYear = 0;
        let lifetime = 0;

        for (const v of validValues) {
          lifetime += v.value;
          if (v.date >= yearStartStr) thisYear += v.value;
          if (v.date >= monthStartStr) thisMonth += v.value;
          if (v.date >= weekStartStr) thisWeek += v.value;
        }

        timeTotals = { thisWeek, thisMonth, thisYear, lifetime };
      }

      // HHMM-specific stats (point-in-time metrics like wake/sleep time)
      let hhmmStats: { avgTime: number; stdDev: number; earliest: ValueWithDate | null; latest: ValueWithDate | null } | undefined;
      if (metricConfig.type === "hhmm" && validValues.length > 0) {
        // For time-of-day metrics, we need to handle wraparound (e.g., 23:00 and 01:00 are close)
        // Use circular mean for averaging times
        const values = validValues.map((v) => v.value);

        // Calculate circular mean (treating time as angle on 24-hour clock)
        const minutesInDay = 1440;
        let sinSum = 0;
        let cosSum = 0;
        for (const mins of values) {
          const angle = (mins / minutesInDay) * 2 * Math.PI;
          sinSum += Math.sin(angle);
          cosSum += Math.cos(angle);
        }
        const avgAngle = Math.atan2(sinSum / values.length, cosSum / values.length);
        let avgTime = (avgAngle / (2 * Math.PI)) * minutesInDay;
        if (avgTime < 0) avgTime += minutesInDay;
        avgTime = Math.round(avgTime);

        // Calculate circular standard deviation
        const R = Math.sqrt(sinSum * sinSum + cosSum * cosSum) / values.length;
        const circularVariance = 1 - R;
        // Convert to approximate minutes (this is an approximation)
        const stdDev = Math.round(Math.sqrt(-2 * Math.log(R)) * (minutesInDay / (2 * Math.PI)));

        // Find earliest and latest (simple min/max works for single-day context)
        let earliest: ValueWithDate | null = null;
        let latest: ValueWithDate | null = null;
        for (const v of validValues) {
          if (!earliest || v.value < earliest.value) {
            earliest = { value: v.value, date: v.date };
          }
          if (!latest || v.value > latest.value) {
            latest = { value: v.value, date: v.date };
          }
        }

        hhmmStats = { avgTime, stdDev: Number.isFinite(stdDev) ? stdDev : 0, earliest, latest };
      }

      numberStats = {
        lifetimeAvg,
        high,
        low,
        periodAverages: { days7, days30, days90, days180 },
        trend,
        timeTotals,
        hhmmStats,
      };
    }

    // Day of week averages (instead of counts)
    const dowSums: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    const dowCounts: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };

    for (const log of loggedDays) {
      if (log.value !== null) {
        const dow = getDayOfWeek(log.date);
        if (dow in dowSums) {
          dowSums[dow] += log.value;
          dowCounts[dow]++;
        }
      }
    }

    dayOfWeekAverages = {
      Mon: dowCounts.Mon > 0 ? Math.round((dowSums.Mon / dowCounts.Mon) * 10) / 10 : null,
      Tue: dowCounts.Tue > 0 ? Math.round((dowSums.Tue / dowCounts.Tue) * 10) / 10 : null,
      Wed: dowCounts.Wed > 0 ? Math.round((dowSums.Wed / dowCounts.Wed) * 10) / 10 : null,
      Thu: dowCounts.Thu > 0 ? Math.round((dowSums.Thu / dowCounts.Thu) * 10) / 10 : null,
      Fri: dowCounts.Fri > 0 ? Math.round((dowSums.Fri / dowCounts.Fri) * 10) / 10 : null,
      Sat: dowCounts.Sat > 0 ? Math.round((dowSums.Sat / dowCounts.Sat) * 10) / 10 : null,
      Sun: dowCounts.Sun > 0 ? Math.round((dowSums.Sun / dowCounts.Sun) * 10) / 10 : null,
    };
  }

  // Calculate averages for comparison periods (number metrics)
  const calcAvg = (logs: LogRow[]): number | undefined => {
    if (!["number", "score", "count", "time", "hhmm"].includes(metricConfig.type)) {
      return undefined;
    }
    const validLogs = logs.filter(l => l.value !== null);
    if (validLogs.length === 0) return undefined;
    const sum = validLogs.reduce((acc, l) => acc + l.value!, 0);
    return Math.round((sum / validLogs.length) * 10) / 10;
  };

  // Calculate goal progress
  let goalsData: { active: GoalProgress[] } | undefined;
  if (metricConfig.goals_config?.goals && metricConfig.goals_config.goals.length > 0) {
    const todayLogged = logRows.some(l => l.date === today && l.value !== null);
    const goalProgressList = calculateAllGoalProgress(
      metricConfig.goals_config.goals,
      logRows,
      today,
      todayLogged
    );
    if (goalProgressList.length > 0) {
      goalsData = { active: goalProgressList };
    }
  }

  const response: StatsResponse = {
    metric: {
      id: metricConfig.metric_id,
      name: metricConfig.metric_name,
      type: metricConfig.type,
      startDate: metricConfig.start_date,
      trackingSince: firstLogDate,
      isAvoid: isAvoidMetric, // deprecated, use direction
      direction,
      isCalculated: metricConfig.is_calculated ?? false,
      showStreak,
    },
    streaks,
    frequency: {
      totalDaysLogged,
      totalDaysPossible,
      percentLogged,
      avgPerWeek,
      avgPerMonth,
      avgDaysBetween,
      rolling30DayAvgBetween,
    },
    numberStats,
    comparisons: {
      ytd: { count: ytdLogs.length, daysInPeriod: ytdDays, avg: calcAvg(ytdLogs) },
      prevYtd: { count: prevYtdLogs.length, daysInPeriod: prevYtdDays, avg: calcAvg(prevYtdLogs) },
      thisMonth: { count: thisMonthLogs.length, daysInPeriod: thisMonthDays, avg: calcAvg(thisMonthLogs) },
      sameMonthLastYear: { count: sameMonthLastYearLogs.length, daysInPeriod: sameMonthLastYearDays, avg: calcAvg(sameMonthLastYearLogs) },
    },
    dayOfWeekBreakdown,
    dayOfWeekAverages,
    movingAverages,
    goals: goalsData,
  };

  return NextResponse.json(response);
}
