"use client";

import { cn } from "@/lib/utils";

type GoalStatus = "on_track" | "at_risk" | "met" | "missed" | "not_started";

type GoalProgressBadgeProps = {
  status: GoalStatus;
  progressPct: number;
  current: number;
  target: number;
  name: string;
  frequency: "daily" | "weekly" | "monthly";
  className?: string;
};

const STATUS_COLORS: Record<GoalStatus, { ring: string; bg: string; text: string }> = {
  met: {
    ring: "stroke-green-500",
    bg: "bg-green-500",
    text: "text-green-600 dark:text-green-400",
  },
  on_track: {
    ring: "stroke-green-500",
    bg: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-600 dark:text-green-400",
  },
  at_risk: {
    ring: "stroke-amber-500",
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-600 dark:text-amber-400",
  },
  missed: {
    ring: "stroke-red-500",
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-600 dark:text-red-400",
  },
  not_started: {
    ring: "stroke-gray-300 dark:stroke-gray-600",
    bg: "bg-gray-100 dark:bg-gray-800",
    text: "text-gray-500 dark:text-gray-400",
  },
};

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
};

function formatNumber(n: number): string {
  if (n >= 1000000) {
    return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
  }
  if (n >= 1000) {
    return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  if (Number.isInteger(n)) {
    return n.toString();
  }
  return n.toFixed(1);
}

export function GoalProgressBadge({
  status,
  progressPct,
  current,
  target,
  name,
  frequency,
  className,
}: GoalProgressBadgeProps) {
  const colors = STATUS_COLORS[status];

  // For goals where progress > 100% (exceeded lte goals), show full ring
  const isExceeded = progressPct > 100;
  const cappedProgress = isExceeded ? 100 : Math.min(100, Math.max(0, progressPct));

  // SVG circle parameters
  const size = 20;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (cappedProgress / 100) * circumference;

  // Format percentage - show actual value even if > 100%
  const pctDisplay = Math.round(progressPct);
  const tooltipText = `${FREQUENCY_LABELS[frequency]}: ${formatNumber(current)} / ${formatNumber(target)} (${pctDisplay}%)`;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      title={`${name}\n${tooltipText}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-gray-700"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={colors.ring}
        />
      </svg>

      {/* Checkmark overlay when met */}
      {status === "met" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            width={10}
            height={10}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-green-600 dark:text-green-400"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}
    </div>
  );
}

type MultiGoalBadgeProps = {
  goals: Array<{
    goal_id: string;
    name: string;
    status: GoalStatus;
    progress_pct: number;
    current: number;
    target: number;
    frequency: "daily" | "weekly" | "monthly";
  }>;
  className?: string;
};

export function MultiGoalBadge({ goals, className }: MultiGoalBadgeProps) {
  if (goals.length === 0) return null;

  if (goals.length === 1) {
    const g = goals[0];
    return (
      <GoalProgressBadge
        status={g.status}
        progressPct={g.progress_pct}
        current={g.current}
        target={g.target}
        name={g.name}
        frequency={g.frequency}
        className={className}
      />
    );
  }

  // Multiple goals - show combined indicator
  // Prioritize: missed > at_risk > on_track > met > not_started
  const statusPriority: GoalStatus[] = ["missed", "at_risk", "on_track", "met", "not_started"];
  const sortedGoals = [...goals].sort(
    (a, b) => statusPriority.indexOf(a.status) - statusPriority.indexOf(b.status)
  );
  const primaryStatus = sortedGoals[0].status;
  const colors = STATUS_COLORS[primaryStatus];

  // Average progress
  const avgProgress = goals.reduce((sum, g) => sum + g.progress_pct, 0) / goals.length;

  // Count by status
  const metCount = goals.filter(g => g.status === "met").length;
  const totalCount = goals.length;

  const tooltipLines = goals.map(g =>
    `${g.name} (${g.frequency}): ${formatNumber(g.current)}/${formatNumber(g.target)} - ${g.status.replace("_", " ")}`
  );
  const tooltipText = tooltipLines.join("\n");

  const size = 20;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const cappedProgress = Math.min(100, Math.max(0, avgProgress));
  const strokeDashoffset = circumference - (cappedProgress / 100) * circumference;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      title={tooltipText}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-gray-700"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={colors.ring}
        />
      </svg>

      {/* Count badge */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-[8px] font-bold", colors.text)}>
          {metCount === totalCount ? (
            <svg
              width={10}
              height={10}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-green-600 dark:text-green-400"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            `${metCount}/${totalCount}`
          )}
        </span>
      </div>
    </div>
  );
}
