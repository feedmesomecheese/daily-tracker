"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type GoalStatus = "on_track" | "at_risk" | "met" | "missed" | "not_started";
type GoalType = "numeric" | "numeric_threshold" | "checkbox" | "hhmm_target" | "hhmm_consistency";
type GoalFrequency = "daily" | "weekly" | "monthly";

type GoalProgressData = {
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
  projected: number | null;
  measure?: "sum" | "average";
  direction?: "gte" | "lte" | "before" | "after";
  target_value?: number; // Original target for display (e.g., target_time for hhmm)
};

type GoalProgressCardProps = {
  goal: GoalProgressData;
  metricType: "checkbox" | "number" | "time" | "hhmm";
  className?: string;
};

const STATUS_STYLES: Record<GoalStatus, { bg: string; text: string; border: string }> = {
  met: {
    bg: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-700 dark:text-green-400",
    border: "border-green-300 dark:border-green-700",
  },
  on_track: {
    bg: "bg-green-50 dark:bg-green-900/20",
    text: "text-green-600 dark:text-green-400",
    border: "border-green-200 dark:border-green-800",
  },
  at_risk: {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-700",
  },
  missed: {
    bg: "bg-red-50 dark:bg-red-900/20",
    text: "text-red-600 dark:text-red-400",
    border: "border-red-200 dark:border-red-800",
  },
  not_started: {
    bg: "bg-gray-50 dark:bg-gray-800/50",
    text: "text-gray-500 dark:text-gray-400",
    border: "border-gray-200 dark:border-gray-700",
  },
};

const STATUS_LABELS: Record<GoalStatus, string> = {
  met: "Met",
  on_track: "On Track",
  at_risk: "At Risk",
  missed: "Missed",
  not_started: "Not Started",
};

const FREQUENCY_LABELS: Record<GoalFrequency, string> = {
  daily: "Today",
  weekly: "This Week",
  monthly: "This Month",
};

function formatNumber(n: number, type: GoalType): string {
  if (type === "hhmm_target" || type === "hhmm_consistency") {
    // Format as HH:MM for time-based goals
    const hours = Math.floor(n / 60);
    const mins = Math.round(n % 60);
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }
  if (Number.isInteger(n) && Math.abs(n) < 10000) {
    return n.toString();
  }
  if (n >= 1000000) {
    return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (n >= 1000) {
    return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return n.toFixed(1);
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getProgressColor(status: GoalStatus): string {
  switch (status) {
    case "met":
      return "bg-green-500";
    case "on_track":
      return "bg-green-400";
    case "at_risk":
      return "bg-amber-500";
    case "missed":
      return "bg-red-500";
    case "not_started":
      return "bg-gray-400";
  }
}

export function GoalProgressCard({ goal, metricType, className }: GoalProgressCardProps) {
  const styles = STATUS_STYLES[goal.status];
  const cappedProgress = Math.min(100, Math.max(0, goal.progress_pct));

  // Build description based on goal type
  let goalDescription = "";
  if (goal.type === "numeric") {
    const measureLabel = goal.measure === "sum" ? "Total" : "Average";
    const directionLabel = goal.direction === "gte" ? "at least" : "at most";
    goalDescription = `${measureLabel} ${directionLabel} ${formatNumber(goal.target, goal.type)}`;
  } else if (goal.type === "numeric_threshold") {
    const directionLabel = goal.direction === "gte" ? "≥" : "≤";
    goalDescription = `${directionLabel} threshold on ${goal.target} days`;
  } else if (goal.type === "checkbox") {
    goalDescription = `Check off ${goal.target} time${goal.target !== 1 ? "s" : ""}`;
  } else if (goal.type === "hhmm_target") {
    const directionLabel = goal.direction === "before" ? "before" : "after";
    // Use target_value (actual target time) instead of target (day count)
    const targetTime = goal.target_value ?? goal.target;
    goalDescription = `Log time ${directionLabel} ${formatNumber(targetTime, goal.type)}`;
  } else if (goal.type === "hhmm_consistency") {
    goalDescription = `Stay within ${goal.target} min standard deviation`;
  }

  return (
    <Card className={cn("border", styles.border, className)}>
      <CardContent className="p-4 space-y-3">
        {/* Header: Goal name and status */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="font-medium text-sm">{goal.name}</h4>
            <p className="text-xs text-muted-foreground">{goalDescription}</p>
          </div>
          <div className={cn("px-2 py-0.5 rounded text-xs font-medium", styles.bg, styles.text)}>
            {STATUS_LABELS[goal.status]}
          </div>
        </div>

        {/* Period info */}
        <div className="text-xs text-muted-foreground">
          {FREQUENCY_LABELS[goal.frequency]}: {formatDate(goal.period_start)} – {formatDate(goal.period_end)}
          {goal.days_remaining > 0 && (
            <span className="ml-2">
              ({goal.days_remaining} day{goal.days_remaining !== 1 ? "s" : ""} left)
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {formatNumber(goal.current, goal.type)}
              <span className="text-muted-foreground font-normal">
                {" "}/ {formatNumber(goal.target, goal.type)}
              </span>
            </span>
            <span className={cn("font-medium", styles.text)}>
              {Math.round(goal.progress_pct)}%
            </span>
          </div>
          <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", getProgressColor(goal.status))}
              style={{ width: `${cappedProgress}%` }}
            />
          </div>
        </div>

        {/* Projected value (for sum/count goals) */}
        {goal.projected != null && goal.days_remaining > 0 && !goal.is_met && (
          <div className="text-xs text-muted-foreground pt-1 border-t">
            <span className="font-medium">Projected:</span>{" "}
            {formatNumber(goal.projected, goal.type)} by end of period
            {goal.projected < goal.target && (
              <span className="text-amber-600 dark:text-amber-400 ml-1">
                (need {formatNumber(goal.target - goal.current, goal.type)} more)
              </span>
            )}
            {goal.projected >= goal.target && (
              <span className="text-green-600 dark:text-green-400 ml-1">
                (on pace)
              </span>
            )}
          </div>
        )}

        {/* Met indicator with checkmark */}
        {goal.is_met && (
          <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 pt-1 border-t">
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Goal achieved!
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Historical stats types
type GoalPeriodResult = {
  period_start: string;
  period_end: string;
  status: "met" | "missed" | "in_progress";
  current: number;
  target: number;
};

type GoalHistoricalStats = {
  goal_id: string;
  periods_evaluated: number;
  periods_met: number;
  hit_rate: number;
  current_streak: number;
  best_streak: number;
  worst_streak: number;
  recent_periods: GoalPeriodResult[];
};

type GoalsSectionProps = {
  goals: GoalProgressData[];
  history?: GoalHistoricalStats[];
  metricType: "checkbox" | "number" | "time" | "hhmm";
  className?: string;
};

// Mini timeline showing recent period results
function RecentPeriodsTimeline({ periods, frequency }: { periods: GoalPeriodResult[]; frequency: GoalFrequency }) {
  // Take up to 8 most recent periods for display (show oldest to newest, left to right)
  const displayPeriods = periods.slice(0, 8).reverse();

  if (displayPeriods.length === 0) return null;

  const periodLabel = frequency === "daily" ? "days" : frequency === "weekly" ? "weeks" : "months";

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground mr-1">Last {displayPeriods.length} {periodLabel}:</span>
      {displayPeriods.map((period, idx) => (
        <div
          key={period.period_start}
          className={cn(
            "w-4 h-4 rounded-sm flex items-center justify-center",
            period.status === "met" && "bg-green-500",
            period.status === "missed" && "bg-red-400",
            period.status === "in_progress" && "bg-gray-300 dark:bg-gray-600 border border-dashed border-gray-400"
          )}
          title={`${formatDate(period.period_start)}: ${period.status === "in_progress" ? "In progress" : period.status}`}
        >
          {period.status === "met" && (
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {period.status === "missed" && (
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

// Historical stats section for a goal
function GoalHistorySection({ history, frequency }: { history: GoalHistoricalStats; frequency: GoalFrequency }) {
  const periodLabel = frequency === "daily" ? "days" : frequency === "weekly" ? "weeks" : "months";

  // Format streak with appropriate label
  const formatStreak = (streak: number): string => {
    if (streak === 0) return "—";
    const absStreak = Math.abs(streak);
    const unit = frequency === "daily" ? "d" : frequency === "weekly" ? "w" : "mo";
    return `${absStreak}${unit}`;
  };

  return (
    <div className="pt-2 mt-2 border-t space-y-2">
      {/* Recent periods timeline */}
      <RecentPeriodsTimeline periods={history.recent_periods} frequency={frequency} />

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          {/* Hit rate */}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Hit rate:</span>
            <span className={cn(
              "font-medium",
              history.hit_rate >= 80 && "text-green-600 dark:text-green-400",
              history.hit_rate >= 50 && history.hit_rate < 80 && "text-amber-600 dark:text-amber-400",
              history.hit_rate < 50 && "text-red-600 dark:text-red-400"
            )}>
              {history.hit_rate}%
            </span>
            <span className="text-muted-foreground">
              ({history.periods_met}/{history.periods_evaluated})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Current streak */}
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Streak:</span>
            <span className={cn(
              "font-medium",
              history.current_streak > 0 && "text-green-600 dark:text-green-400",
              history.current_streak < 0 && "text-red-600 dark:text-red-400",
              history.current_streak === 0 && "text-muted-foreground"
            )}>
              {history.current_streak > 0 && "+"}
              {formatStreak(history.current_streak)}
            </span>
          </div>

          {/* Best streak */}
          {history.best_streak > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Best:</span>
              <span className="font-medium text-green-600 dark:text-green-400">
                {formatStreak(history.best_streak)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function GoalsSection({ goals, history, metricType, className }: GoalsSectionProps) {
  if (!goals || goals.length === 0) {
    return null;
  }

  // Create a map of goal_id to history for easy lookup
  const historyMap = new Map<string, GoalHistoricalStats>();
  if (history) {
    for (const h of history) {
      historyMap.set(h.goal_id, h);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Goals
      </h3>
      <div className="space-y-2">
        {goals.map((goal) => (
          <GoalProgressCardWithHistory
            key={goal.goal_id}
            goal={goal}
            history={historyMap.get(goal.goal_id)}
            metricType={metricType}
          />
        ))}
      </div>
    </div>
  );
}

// Extended card that includes historical stats
function GoalProgressCardWithHistory({
  goal,
  history,
  metricType,
  className,
}: GoalProgressCardProps & { history?: GoalHistoricalStats }) {
  const styles = STATUS_STYLES[goal.status];
  const cappedProgress = Math.min(100, Math.max(0, goal.progress_pct));

  // Build description based on goal type
  let goalDescription = "";
  if (goal.type === "numeric") {
    const measureLabel = goal.measure === "sum" ? "Total" : "Average";
    const directionLabel = goal.direction === "gte" ? "at least" : "at most";
    goalDescription = `${measureLabel} ${directionLabel} ${formatNumber(goal.target, goal.type)}`;
  } else if (goal.type === "numeric_threshold") {
    const directionLabel = goal.direction === "gte" ? "≥" : "≤";
    goalDescription = `${directionLabel} threshold on ${goal.target} days`;
  } else if (goal.type === "checkbox") {
    goalDescription = `Check off ${goal.target} time${goal.target !== 1 ? "s" : ""}`;
  } else if (goal.type === "hhmm_target") {
    const directionLabel = goal.direction === "before" ? "before" : "after";
    // Use target_value (actual target time) instead of target (day count)
    const targetTime = goal.target_value ?? goal.target;
    goalDescription = `Log time ${directionLabel} ${formatNumber(targetTime, goal.type)}`;
  } else if (goal.type === "hhmm_consistency") {
    goalDescription = `Stay within ${goal.target} min standard deviation`;
  }

  return (
    <Card className={cn("border", styles.border, className)}>
      <CardContent className="p-4 space-y-3">
        {/* Header: Goal name and status */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="font-medium text-sm">{goal.name}</h4>
            <p className="text-xs text-muted-foreground">{goalDescription}</p>
          </div>
          <div className={cn("px-2 py-0.5 rounded text-xs font-medium", styles.bg, styles.text)}>
            {STATUS_LABELS[goal.status]}
          </div>
        </div>

        {/* Period info */}
        <div className="text-xs text-muted-foreground">
          {FREQUENCY_LABELS[goal.frequency]}: {formatDate(goal.period_start)} – {formatDate(goal.period_end)}
          {goal.days_remaining > 0 && (
            <span className="ml-2">
              ({goal.days_remaining} day{goal.days_remaining !== 1 ? "s" : ""} left)
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {formatNumber(goal.current, goal.type)}
              <span className="text-muted-foreground font-normal">
                {" "}/ {formatNumber(goal.target, goal.type)}
              </span>
            </span>
            <span className={cn("font-medium", styles.text)}>
              {Math.round(goal.progress_pct)}%
            </span>
          </div>
          <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", getProgressColor(goal.status))}
              style={{ width: `${cappedProgress}%` }}
            />
          </div>
        </div>

        {/* Projected value (for sum/count goals) */}
        {goal.projected != null && goal.days_remaining > 0 && !goal.is_met && (
          <div className="text-xs text-muted-foreground pt-1 border-t">
            <span className="font-medium">Projected:</span>{" "}
            {formatNumber(goal.projected, goal.type)} by end of period
            {goal.projected < goal.target && (
              <span className="text-amber-600 dark:text-amber-400 ml-1">
                (need {formatNumber(goal.target - goal.current, goal.type)} more)
              </span>
            )}
            {goal.projected >= goal.target && (
              <span className="text-green-600 dark:text-green-400 ml-1">
                (on pace)
              </span>
            )}
          </div>
        )}

        {/* Met indicator with checkmark */}
        {goal.is_met && (
          <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 pt-1 border-t">
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Goal achieved!
          </div>
        )}

        {/* Historical stats section */}
        {history && history.periods_evaluated > 0 && (
          <GoalHistorySection history={history} frequency={goal.frequency} />
        )}
      </CardContent>
    </Card>
  );
}
