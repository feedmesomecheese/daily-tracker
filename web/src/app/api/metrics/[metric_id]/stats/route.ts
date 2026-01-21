import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { getLocalDateString, addDays } from "@/lib/dateUtils";
import { evaluateCalculatedMetricsV2, MetricDef } from "@/lib/calc";

type MetricConfig = {
  metric_id: string;
  metric_name: string;
  type: "checkbox" | "number" | "time" | "hhmm" | "text";
  start_date: string | null;
  is_calculated: boolean;
  calc_expr: string | null;
  analytics_config: {
    avoid?: boolean;
    higher_is_better?: boolean;
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

type StatsResponse = {
  metric: {
    id: string;
    name: string;
    type: string;
    startDate: string | null;
    trackingSince: string | null;
    isAvoid: boolean;
    isCalculated: boolean;
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
  comparisons: {
    ytd: { count: number; daysInPeriod: number };
    prevYtd: { count: number; daysInPeriod: number };
    thisMonth: { count: number; daysInPeriod: number };
    sameMonthLastYear: { count: number; daysInPeriod: number };
  };
  dayOfWeekBreakdown: Record<string, number>;
  movingAverages: { date: string; ma7: number | null; ma30: number | null; ma90: number | null; ma180: number | null }[];
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
    } else {
      // For number/time, any non-null value counts
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

  // For checkbox metrics, we need to determine the first ACTIVE date for streak boundaries
  // (first date where value was truthy, not just first log entry)
  let effectiveFirstDate = firstLogDate;
  if (metricType === "checkbox" && loggedDates.size > 0) {
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
): { date: string; ma7: number | null; ma30: number | null; ma90: number | null; ma180: number | null }[] {
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

  const results: { date: string; ma7: number | null; ma30: number | null; ma90: number | null; ma180: number | null }[] = [];

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
      const ma7 = calculateMA(valueMap, curDate, 7, metricType);
      const ma30 = calculateMA(valueMap, curDate, 30, metricType);
      const ma90 = calculateMA(valueMap, curDate, 90, metricType);
      const ma180 = calculateMA(valueMap, curDate, 180, metricType);

      results.push({ date: curDate, ma7, ma30, ma90, ma180 });
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
    .select("metric_id, metric_name, type, start_date, analytics_config, is_calculated, calc_expr")
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
    const metricDefs: MetricDef[] = (allConfigs ?? []).map((c) => ({
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

  // Check if this is an "avoid" metric
  const isAvoidMetric = metricConfig.analytics_config?.avoid === true;

  // Debug log for avoid metric detection
  console.log(`[Stats API] Metric ${metric_id}: analytics_config=${JSON.stringify(metricConfig.analytics_config)}, isAvoid=${isAvoidMetric}`);

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
  // For number/time: count any logged days (non-null values)
  const totalDaysPossible = daysBetween(trackingStartDate, today) + 1;
  const loggedDays = metricConfig.type === "checkbox"
    ? logRows.filter((l) => isTruthy(l.value))
    : logRows.filter((l) => hasValue(l.value));
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

  const response: StatsResponse = {
    metric: {
      id: metricConfig.metric_id,
      name: metricConfig.metric_name,
      type: metricConfig.type,
      startDate: metricConfig.start_date,
      trackingSince: firstLogDate,
      isAvoid: isAvoidMetric,
      isCalculated: metricConfig.is_calculated ?? false,
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
    comparisons: {
      ytd: { count: ytdLogs.length, daysInPeriod: ytdDays },
      prevYtd: { count: prevYtdLogs.length, daysInPeriod: prevYtdDays },
      thisMonth: { count: thisMonthLogs.length, daysInPeriod: thisMonthDays },
      sameMonthLastYear: { count: sameMonthLastYearLogs.length, daysInPeriod: sameMonthLastYearDays },
    },
    dayOfWeekBreakdown,
    movingAverages,
  };

  return NextResponse.json(response);
}
