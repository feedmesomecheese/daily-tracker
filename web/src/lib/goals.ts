/**
 * Goal calculation utilities for Daily Tracker.
 * Handles period calculations and goal progress for all metric types.
 */

import { addDays, getLocalDateString } from "./dateUtils";

// ============== Types ==============

export type GoalFrequency = "daily" | "weekly" | "monthly";

export type GoalType = "numeric" | "numeric_threshold" | "checkbox" | "hhmm_target" | "hhmm_consistency";

export type GoalStatus = "on_track" | "at_risk" | "met" | "missed" | "not_started";

// Base goal structure (matches the Zod schema in metrics API)
export type BaseGoal = {
  id: string;
  name: string;
  frequency: GoalFrequency;
  enabled: boolean;
  start_date?: string | null;
  end_date?: string | null;
  alerts?: {
    approaching_pct?: number;
    missed?: boolean;
    achieved?: boolean;
  };
  created_at?: string;
};

export type NumericGoal = BaseGoal & {
  type: "numeric";
  target: number;
  measure: "sum" | "average";
  direction: "gte" | "lte";
};

export type CheckboxGoal = BaseGoal & {
  type: "checkbox";
  target_count: number;
};

export type HHMMTargetGoal = BaseGoal & {
  type: "hhmm_target";
  target_time: number; // minutes from midnight
  direction: "before" | "after";
};

export type HHMMConsistencyGoal = BaseGoal & {
  type: "hhmm_consistency";
  max_std_dev: number; // minutes
};

// Numeric threshold goal: count days meeting a threshold (e.g., "score >= 7 on 5 days/week")
export type NumericThresholdGoal = BaseGoal & {
  type: "numeric_threshold";
  threshold: number;
  direction: "gte" | "lte"; // value must be >= or <= threshold
  target_count: number; // how many days must meet threshold
};

export type Goal = NumericGoal | NumericThresholdGoal | CheckboxGoal | HHMMTargetGoal | HHMMConsistencyGoal;

export type GoalProgress = {
  goal_id: string;
  name: string;
  type: GoalType;
  frequency: GoalFrequency;
  current: number;
  target: number;
  progress_pct: number;
  is_met: boolean;
  status: GoalStatus;
  period_start: string;
  period_end: string;
  days_elapsed: number;
  days_remaining: number;
  projected: number | null; // projected end-of-period value
  // For display purposes
  measure?: "sum" | "average";
  direction?: "gte" | "lte" | "before" | "after";
};

export type LogRow = {
  date: string;
  value: number | null;
};

// ============== Period Calculations ==============

/**
 * Get the start date of the period containing the reference date.
 * Week = Monday-Sunday (ISO week)
 */
export function getPeriodStart(frequency: GoalFrequency, referenceDate: string): string {
  if (frequency === "daily") {
    return referenceDate;
  }

  const [year, month, day] = referenceDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);

  if (frequency === "weekly") {
    // Monday of current week (ISO week)
    const dayOfWeek = d.getDay(); // 0 = Sunday, 1 = Monday, ...
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    d.setDate(d.getDate() - daysToMonday);
    return getLocalDateString(d);
  }

  if (frequency === "monthly") {
    // First of current month
    return `${year}-${String(month).padStart(2, "0")}-01`;
  }

  return referenceDate;
}

/**
 * Get the end date of the period starting at periodStart.
 */
export function getPeriodEnd(frequency: GoalFrequency, periodStart: string): string {
  if (frequency === "daily") {
    return periodStart;
  }

  if (frequency === "weekly") {
    return addDays(periodStart, 6); // Monday + 6 = Sunday
  }

  if (frequency === "monthly") {
    // Last day of month
    const [year, month] = periodStart.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate(); // Day 0 of next month = last day of this month
    return `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  return periodStart;
}

/**
 * Get the evaluation end date for goal progress.
 * Uses yesterday unless today has been logged.
 */
export function getEvaluationEndDate(
  referenceDate: string,
  todayLogged: boolean,
  today: string = getLocalDateString()
): string {
  if (referenceDate === today) {
    // If viewing today, include today only if logged
    return todayLogged ? today : addDays(today, -1);
  }
  // For past dates, use the reference date
  return referenceDate;
}

/**
 * Count days between two dates (inclusive).
 */
export function daysBetween(start: string, end: string): number {
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  const diffMs = endDate.getTime() - startDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

// ============== Goal Progress Calculations ==============

/**
 * Calculate circular standard deviation for HHMM values.
 * Handles wrap-around at midnight.
 */
export function calculateCircularStdDev(values: number[]): number {
  if (values.length < 2) return 0;

  const minutesInDay = 1440;
  let sinSum = 0;
  let cosSum = 0;

  for (const mins of values) {
    const angle = (mins / minutesInDay) * 2 * Math.PI;
    sinSum += Math.sin(angle);
    cosSum += Math.cos(angle);
  }

  const n = values.length;
  const meanSin = sinSum / n;
  const meanCos = cosSum / n;
  const R = Math.sqrt(meanSin * meanSin + meanCos * meanCos);

  // Circular variance: 1 - R, convert to std dev in minutes
  const circularVariance = 1 - R;
  // Approximate conversion to minutes (this is an approximation)
  const stdDevRadians = Math.sqrt(-2 * Math.log(R));
  const stdDevMinutes = (stdDevRadians / (2 * Math.PI)) * minutesInDay;

  return Math.round(stdDevMinutes);
}

/**
 * Calculate progress for a numeric goal (number/time metrics).
 */
function calculateNumericGoalProgress(
  goal: NumericGoal,
  logs: LogRow[],
  periodStart: string,
  evaluationEnd: string
): { current: number; target: number; is_met: boolean } {
  const periodLogs = logs.filter(
    (l) => l.date >= periodStart && l.date <= evaluationEnd && l.value != null
  );
  const values = periodLogs.map((l) => l.value!);

  let current: number;
  if (goal.measure === "sum") {
    current = values.reduce((a, b) => a + b, 0);
  } else {
    // average
    current = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  const is_met =
    goal.direction === "gte" ? current >= goal.target : current <= goal.target;

  return { current, target: goal.target, is_met };
}

/**
 * Calculate progress for a checkbox goal.
 */
function calculateCheckboxGoalProgress(
  goal: CheckboxGoal,
  logs: LogRow[],
  periodStart: string,
  evaluationEnd: string
): { current: number; target: number; is_met: boolean } {
  const periodLogs = logs.filter(
    (l) => l.date >= periodStart && l.date <= evaluationEnd
  );
  // Count truthy values (checked)
  const current = periodLogs.filter((l) => l.value != null && l.value >= 0.5).length;
  const is_met = current >= goal.target_count;

  return { current, target: goal.target_count, is_met };
}

/**
 * Calculate progress for an HHMM target goal.
 */
function calculateHHMMTargetGoalProgress(
  goal: HHMMTargetGoal,
  logs: LogRow[],
  periodStart: string,
  evaluationEnd: string
): { current: number; target: number; is_met: boolean } {
  const periodLogs = logs.filter(
    (l) => l.date >= periodStart && l.date <= evaluationEnd && l.value != null
  );

  // Count days where target was met
  const metDays = periodLogs.filter((l) => {
    const value = l.value!;
    return goal.direction === "before"
      ? value <= goal.target_time
      : value >= goal.target_time;
  }).length;

  // Target is all logged days in period
  const target = periodLogs.length;
  const is_met = target > 0 && metDays >= target;

  return { current: metDays, target, is_met };
}

/**
 * Calculate progress for an HHMM consistency goal.
 */
function calculateHHMMConsistencyGoalProgress(
  goal: HHMMConsistencyGoal,
  logs: LogRow[],
  periodStart: string,
  evaluationEnd: string
): { current: number; target: number; is_met: boolean } {
  const periodLogs = logs.filter(
    (l) => l.date >= periodStart && l.date <= evaluationEnd && l.value != null
  );
  const values = periodLogs.map((l) => l.value!);

  const stdDev = calculateCircularStdDev(values);
  const is_met = stdDev <= goal.max_std_dev;

  // For consistency, current = std dev, target = max allowed
  // Lower is better, so progress = target - current (capped)
  return { current: stdDev, target: goal.max_std_dev, is_met };
}

/**
 * Calculate progress for a numeric threshold goal.
 * Counts days where value meets the threshold (e.g., "score >= 7 on 5 days/week").
 */
function calculateNumericThresholdGoalProgress(
  goal: NumericThresholdGoal,
  logs: LogRow[],
  periodStart: string,
  evaluationEnd: string
): { current: number; target: number; is_met: boolean } {
  const periodLogs = logs.filter(
    (l) => l.date >= periodStart && l.date <= evaluationEnd && l.value != null
  );

  // Count days meeting the threshold
  const metCount = periodLogs.filter((l) => {
    const value = l.value!;
    return goal.direction === "gte" ? value >= goal.threshold : value <= goal.threshold;
  }).length;

  const is_met = metCount >= goal.target_count;

  return { current: metCount, target: goal.target_count, is_met };
}

/**
 * Calculate full goal progress for a single goal.
 */
export function calculateGoalProgress(
  goal: Goal,
  logs: LogRow[],
  referenceDate: string,
  todayLogged: boolean
): GoalProgress {
  const today = getLocalDateString();

  // Check if goal is within its active period
  if (goal.start_date && referenceDate < goal.start_date) {
    return createNotStartedProgress(goal, referenceDate);
  }
  if (goal.end_date && referenceDate > goal.end_date) {
    // Goal period has ended
    return createExpiredProgress(goal, logs, goal.end_date);
  }

  const evaluationEnd = getEvaluationEndDate(referenceDate, todayLogged, today);
  const periodStart = getPeriodStart(goal.frequency, evaluationEnd);
  const periodEnd = getPeriodEnd(goal.frequency, periodStart);

  // Calculate based on goal type
  let result: { current: number; target: number; is_met: boolean };

  switch (goal.type) {
    case "numeric":
      result = calculateNumericGoalProgress(goal, logs, periodStart, evaluationEnd);
      break;
    case "numeric_threshold":
      result = calculateNumericThresholdGoalProgress(goal, logs, periodStart, evaluationEnd);
      break;
    case "checkbox":
      result = calculateCheckboxGoalProgress(goal, logs, periodStart, evaluationEnd);
      break;
    case "hhmm_target":
      result = calculateHHMMTargetGoalProgress(goal, logs, periodStart, evaluationEnd);
      break;
    case "hhmm_consistency":
      result = calculateHHMMConsistencyGoalProgress(goal, logs, periodStart, evaluationEnd);
      break;
  }

  const { current, target, is_met } = result;

  // Calculate period metrics
  const daysElapsed = Math.max(1, daysBetween(periodStart, evaluationEnd));
  const totalDays = daysBetween(periodStart, periodEnd);
  const daysRemaining = Math.max(0, daysBetween(evaluationEnd, periodEnd) - 1);

  // Calculate progress percentage
  let progress_pct: number;
  // Track if this is a "lower is better" goal for status calculation
  const isLowerBetter = goal.type === "hhmm_consistency" ||
    (goal.type === "numeric" && (goal as NumericGoal).direction === "lte");

  if (isLowerBetter) {
    // For "lower is better" goals (lte, consistency):
    // - If at or under target: 100% (met)
    // - If over target: show how much over (e.g., 4/3 = 133%)
    if (current <= target) {
      progress_pct = 100;
    } else {
      // Show current/target to indicate exceeding (133% means 33% over)
      progress_pct = target > 0 ? (current / target) * 100 : 100;
    }
  } else {
    // For normal goals, higher is better
    progress_pct = target > 0 ? (current / target) * 100 : 0;
  }

  // Calculate projected end-of-period value (for sum/count goals)
  let projected: number | null = null;
  if (goal.type === "numeric" && (goal as NumericGoal).measure === "sum" && daysElapsed > 0) {
    projected = (current / daysElapsed) * totalDays;
  } else if ((goal.type === "checkbox" || goal.type === "numeric_threshold") && daysElapsed > 0) {
    projected = (current / daysElapsed) * totalDays;
  }

  // Determine status
  let status: GoalStatus;
  if (periodEnd < today && !is_met) {
    // Period has ended and goal not met
    status = "missed";
  } else if (is_met) {
    status = "met";
  } else if (isLowerBetter && current > target) {
    // For lte/consistency goals: already exceeded target = missed
    // (can't recover for daily goals, unlikely to recover for weekly/monthly)
    status = "missed";
  } else if (projected != null) {
    // For gte goals: check if projected to miss
    if (!isLowerBetter && projected < target) {
      status = "at_risk";
    } else if (isLowerBetter && projected > target) {
      status = "at_risk";
    } else {
      status = "on_track";
    }
  } else {
    status = "on_track";
  }

  return {
    goal_id: goal.id,
    name: goal.name,
    type: goal.type,
    frequency: goal.frequency,
    current,
    target,
    progress_pct: Math.round(progress_pct * 10) / 10, // 1 decimal
    is_met,
    status,
    period_start: periodStart,
    period_end: periodEnd,
    days_elapsed: daysElapsed,
    days_remaining: daysRemaining,
    projected: projected != null ? Math.round(projected * 10) / 10 : null,
    measure: goal.type === "numeric" ? (goal as NumericGoal).measure : undefined,
    direction:
      goal.type === "numeric"
        ? (goal as NumericGoal).direction
        : goal.type === "hhmm_target"
        ? (goal as HHMMTargetGoal).direction
        : undefined,
  };
}

/**
 * Create a "not started" progress object for goals that haven't begun yet.
 */
function createNotStartedProgress(goal: Goal, referenceDate: string): GoalProgress {
  const periodStart = goal.start_date || referenceDate;
  const periodEnd = getPeriodEnd(goal.frequency, periodStart);

  return {
    goal_id: goal.id,
    name: goal.name,
    type: goal.type,
    frequency: goal.frequency,
    current: 0,
    target: getTargetValue(goal),
    progress_pct: 0,
    is_met: false,
    status: "not_started",
    period_start: periodStart,
    period_end: periodEnd,
    days_elapsed: 0,
    days_remaining: daysBetween(referenceDate, periodEnd),
    projected: null,
  };
}

/**
 * Create progress for an expired goal (after end_date).
 */
function createExpiredProgress(goal: Goal, logs: LogRow[], endDate: string): GoalProgress {
  // Calculate final progress as of end date
  const periodStart = getPeriodStart(goal.frequency, endDate);
  const periodEnd = endDate;

  let result: { current: number; target: number; is_met: boolean };

  switch (goal.type) {
    case "numeric":
      result = calculateNumericGoalProgress(goal as NumericGoal, logs, periodStart, periodEnd);
      break;
    case "numeric_threshold":
      result = calculateNumericThresholdGoalProgress(goal as NumericThresholdGoal, logs, periodStart, periodEnd);
      break;
    case "checkbox":
      result = calculateCheckboxGoalProgress(goal as CheckboxGoal, logs, periodStart, periodEnd);
      break;
    case "hhmm_target":
      result = calculateHHMMTargetGoalProgress(goal as HHMMTargetGoal, logs, periodStart, periodEnd);
      break;
    case "hhmm_consistency":
      result = calculateHHMMConsistencyGoalProgress(goal as HHMMConsistencyGoal, logs, periodStart, periodEnd);
      break;
  }

  return {
    goal_id: goal.id,
    name: goal.name,
    type: goal.type,
    frequency: goal.frequency,
    current: result.current,
    target: result.target,
    progress_pct: result.target > 0 ? (result.current / result.target) * 100 : 0,
    is_met: result.is_met,
    status: result.is_met ? "met" : "missed",
    period_start: periodStart,
    period_end: periodEnd,
    days_elapsed: daysBetween(periodStart, periodEnd),
    days_remaining: 0,
    projected: null,
  };
}

/**
 * Get the target value for a goal (for display).
 */
function getTargetValue(goal: Goal): number {
  switch (goal.type) {
    case "numeric":
      return goal.target;
    case "numeric_threshold":
      return goal.target_count;
    case "checkbox":
      return goal.target_count;
    case "hhmm_target":
      return goal.target_time;
    case "hhmm_consistency":
      return goal.max_std_dev;
  }
}

/**
 * Calculate progress for all enabled goals of a metric.
 */
export function calculateAllGoalProgress(
  goals: Goal[],
  logs: LogRow[],
  referenceDate: string,
  todayLogged: boolean
): GoalProgress[] {
  return goals
    .filter((g) => g.enabled)
    .map((goal) => calculateGoalProgress(goal, logs, referenceDate, todayLogged));
}
