import * as React from "react";
import { cn } from "@/lib/utils";

export interface StreakBadgeProps {
  // Streak value from API (yesterday's streak, what's in the DB)
  yesterdayStreak: number;
  // Whether today is logged in the DB
  loggedTodayInDb: boolean;
  // Current form state - is today's value filled?
  formHasValue: boolean;
  // If true, negative streaks are good (you want to avoid this thing)
  avoid?: boolean;
  // Pre-log days to add to positive streak display (for lifetime streaks)
  seed?: number;
  className?: string;
}

export function StreakBadge({
  yesterdayStreak,
  loggedTodayInDb,
  formHasValue,
  avoid = false,
  seed = 0,
  className,
}: StreakBadgeProps) {
  // Calculate what the streak would be based on current form state
  const baseStreak = React.useMemo(() => {
    if (formHasValue) {
      // Form has value - positive streak continues or starts
      if (yesterdayStreak >= 0) {
        return yesterdayStreak + 1;
      } else {
        // Breaking negative streak, start fresh at +1
        return 1;
      }
    } else {
      // Form empty - negative streak continues or starts
      if (yesterdayStreak > 0) {
        // Breaking positive streak
        return -1;
      } else if (yesterdayStreak < 0) {
        return yesterdayStreak - 1;
      } else {
        return -1;
      }
    }
  }, [yesterdayStreak, formHasValue]);

  // Add seed to positive streaks only
  const displayStreak = baseStreak > 0 ? baseStreak + seed : baseStreak;

  // Determine if this is "live" (matches what will be saved) or "muted" (preview)
  const isLive = formHasValue === loggedTodayInDb || formHasValue;
  const isMuted = !formHasValue && !loggedTodayInDb;

  // Determine if this streak is "good" based on avoid flag
  // - Normal: positive streak = good
  // - Avoid: negative streak = good (avoiding bad thing)
  const isGood = avoid ? displayStreak < 0 : displayStreak > 0;

  // Don't show anything for zero streak (shouldn't happen often)
  if (displayStreak === 0) {
    return null;
  }

  // Format the display
  const absStreak = Math.abs(displayStreak);
  const isPositive = displayStreak > 0;
  const showFlame = isGood && !isMuted;

  // Build tooltip
  let tooltipText: string;
  if (isPositive) {
    if (avoid) {
      tooltipText = `${absStreak} day${absStreak === 1 ? "" : "s"} in a row (try to avoid!)`;
    } else {
      tooltipText = `${absStreak} day streak${isMuted ? " - not logged today" : " - keep it going!"}`;
    }
  } else {
    if (avoid) {
      tooltipText = `${absStreak} day${absStreak === 1 ? "" : "s"} avoided - great job!`;
    } else {
      tooltipText = `${absStreak} day${absStreak === 1 ? "" : "s"} missed`;
    }
  }

  // Color logic
  let colorClass: string;
  if (isMuted) {
    colorClass = "text-gray-400";
  } else if (isGood) {
    colorClass = "text-orange-500"; // Fire color for good streaks
  } else {
    // Bad streak
    if (absStreak >= 7) {
      colorClass = "text-red-500";
    } else if (absStreak >= 3) {
      colorClass = "text-amber-500";
    } else {
      colorClass = "text-gray-500";
    }
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium transition-all duration-300",
        colorClass,
        // Add subtle animation class when live
        !isMuted && "animate-in fade-in-50",
        className
      )}
      title={tooltipText}
    >
      {showFlame && <span className="text-sm">🔥</span>}
      <span>
        {isPositive ? "+" : ""}
        {displayStreak}
      </span>
    </span>
  );
}
