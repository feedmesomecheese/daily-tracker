import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Format a number of days as a human-readable duration
 * - < 30 days: "15" (just the number)
 * - 30-364 days: "3m 15d"
 * - 365+ days: "2y 3m 15d"
 */
function formatStreakDuration(days: number): string {
  const absDays = Math.abs(days);

  if (absDays < 30) {
    return String(absDays);
  }

  const years = Math.floor(absDays / 365);
  const remainingAfterYears = absDays % 365;
  const months = Math.floor(remainingAfterYears / 30);
  const remainingDays = remainingAfterYears % 30;

  const parts: string[] = [];

  if (years > 0) {
    parts.push(`${years}y`);
  }
  if (months > 0) {
    parts.push(`${months}m`);
  }
  if (remainingDays > 0 || parts.length === 0) {
    parts.push(`${remainingDays}d`);
  }

  return parts.join(" ");
}

export type StreakDirection = "increase" | "decrease" | "neutral";

export interface StreakBadgeProps {
  // Streak value from API (yesterday's streak, what's in the DB)
  yesterdayStreak: number;
  // Whether today is logged in the DB
  loggedTodayInDb: boolean;
  // Current form state - is today's value filled?
  formHasValue: boolean;
  // Direction: increase=positive streaks good, decrease=negative streaks good, neutral=no flame
  direction?: StreakDirection;
  // Pre-log days to add to positive streak display (for lifetime streaks)
  seed?: number;
  className?: string;
}

export function StreakBadge({
  yesterdayStreak,
  loggedTodayInDb,
  formHasValue,
  direction = "increase",
  seed = 0,
  className,
}: StreakBadgeProps) {
  // For backward compat: treat decrease like old avoid=true
  const isDecrease = direction === "decrease";
  const isNeutral = direction === "neutral";
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

  // Determine if this streak is "good" based on direction
  // - increase: positive streak = good
  // - decrease: negative streak = good (avoiding bad thing)
  // - neutral: neither is highlighted
  const isGood = isNeutral ? false : (isDecrease ? displayStreak < 0 : displayStreak > 0);

  // Determine if this is "live" (matches what will be saved) or "muted" (preview)
  // For decrease metrics: empty form is the "good" live state when on a decrease streak
  const isLive = formHasValue === loggedTodayInDb || formHasValue || (isDecrease && !formHasValue && isGood);
  const isMuted = isDecrease
    ? (formHasValue && displayStreak < 0) // Decrease: muted when about to break a good streak
    : (!formHasValue && !loggedTodayInDb); // Increase/Neutral: muted when empty and not saved

  // Don't show anything for zero streak (shouldn't happen often)
  if (displayStreak === 0) {
    return null;
  }

  // Format the display
  const absStreak = Math.abs(displayStreak);
  const isPositive = displayStreak > 0;
  const formattedStreak = formatStreakDuration(displayStreak);

  // Show flame for good streaks (positive for increase, negative for decrease, never for neutral)
  const showFlame = isGood && !isMuted && !isNeutral;

  // Build tooltip with full day count for longer streaks
  const dayLabel = absStreak === 1 ? "day" : "days";
  let tooltipText: string;
  if (isPositive) {
    if (isDecrease) {
      tooltipText = `${absStreak} ${dayLabel} in a row (try to avoid!)`;
    } else {
      tooltipText = `${absStreak} ${dayLabel} streak${isMuted ? " - not logged today" : " - keep it going!"}`;
    }
  } else {
    if (isDecrease) {
      tooltipText = `${absStreak} ${dayLabel} avoided - great job!`;
    } else {
      tooltipText = `${absStreak} ${dayLabel} missed`;
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
        {isPositive ? "+" : "-"}
        {formattedStreak}
      </span>
    </span>
  );
}
