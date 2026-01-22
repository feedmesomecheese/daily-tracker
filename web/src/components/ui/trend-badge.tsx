import * as React from "react";
import { cn } from "@/lib/utils";

export type TrendDirection = "up" | "down" | "flat";

export interface TrendBadgeProps {
  direction: TrendDirection;
  changePct: number;
  periodDays?: number;
  showPercentage?: boolean;
  higherIsBetter?: boolean; // true = up is good (green), false = down is good (green)
  className?: string;
}

const ARROWS: Record<TrendDirection, string> = {
  up: "\u2191", // ↑
  down: "\u2193", // ↓
  flat: "\u2192", // →
};

export function TrendBadge({
  direction,
  changePct,
  periodDays = 7,
  showPercentage = true,
  higherIsBetter = true, // default: higher values are better
  className,
}: TrendBadgeProps) {
  const arrow = ARROWS[direction];
  const pctDisplay = Math.abs(Math.round(changePct * 100));

  // Determine color based on direction and whether higher is better
  let colorClass: string;
  if (direction === "flat") {
    colorClass = "text-gray-500";
  } else if (direction === "up") {
    colorClass = higherIsBetter ? "text-green-600" : "text-red-600";
  } else {
    // direction === "down"
    colorClass = higherIsBetter ? "text-red-600" : "text-green-600";
  }

  // Build tooltip text - explain comparison of averages
  const tooltipText =
    direction === "flat"
      ? `Last ${periodDays} days avg ≈ previous ${periodDays} days avg`
      : `Last ${periodDays} days avg is ${pctDisplay}% ${direction === "up" ? "higher" : "lower"} than previous ${periodDays} days`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        colorClass,
        className
      )}
      title={tooltipText}
    >
      <span className="text-sm">{arrow}</span>
      {showPercentage && direction !== "flat" && pctDisplay > 0 && (
        <span>{pctDisplay}%</span>
      )}
    </span>
  );
}
