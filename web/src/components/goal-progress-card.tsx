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
    goalDescription = `Log time ${directionLabel} ${formatNumber(goal.target, goal.type)}`;
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

type GoalsSectionProps = {
  goals: GoalProgressData[];
  metricType: "checkbox" | "number" | "time" | "hhmm";
  className?: string;
};

export function GoalsSection({ goals, metricType, className }: GoalsSectionProps) {
  if (!goals || goals.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Goals
      </h3>
      <div className="space-y-2">
        {goals.map((goal) => (
          <GoalProgressCard
            key={goal.goal_id}
            goal={goal}
            metricType={metricType}
          />
        ))}
      </div>
    </div>
  );
}
