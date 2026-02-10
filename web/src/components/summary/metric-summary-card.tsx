"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type MetricSummary = {
  metric_id: string;
  metric_name: string;
  type: string;
  direction: "increase" | "decrease" | "neutral";
  total: number;
  average: number;
  count: number;
  min: number;
  max: number;
  vs_previous: { pct_change: number; change_direction: "up" | "down" | "flat"; prev_average: number } | null;
  records: { is_period_high: boolean; is_all_time_high: boolean; is_period_low: boolean; is_all_time_low: boolean };
};

export type MetricSummaryCardProps = {
  metric: MetricSummary;
  onClick?: () => void;
};

// Format hhmm/time values as h:mm
function formatTimeValue(value: number, type: string): string {
  if (type === "hhmm" || type === "time") {
    const minutes = Math.round(value);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${String(m).padStart(2, "0")}`;
  }
  if (type === "checkbox") {
    return value >= 0.5 ? "Yes" : "No";
  }
  return String(Math.round(value * 100) / 100);
}

// Format count average as "X times/day" or "every X days"
function formatCountAverage(avg: number): string {
  if (avg >= 1) {
    return `${Math.round(avg * 10) / 10}×/day`;
  } else if (avg > 0) {
    const daysBetween = Math.round(1 / avg * 10) / 10;
    return `every ${daysBetween}d`;
  }
  return "0";
}

export function MetricSummaryCard({ metric, onClick }: MetricSummaryCardProps) {
  // Determine if the change is "good" or "bad" based on direction
  const isGoodChange = (() => {
    if (!metric.vs_previous || metric.vs_previous.change_direction === "flat") return null;
    if (metric.direction === "neutral") return null;

    const isUp = metric.vs_previous.change_direction === "up";
    // For "increase" direction, up is good. For "decrease" direction, down is good.
    return metric.direction === "increase" ? isUp : !isUp;
  })();

  const changeColor =
    isGoodChange === true
      ? "text-green-600"
      : isGoodChange === false
      ? "text-red-600"
      : "text-muted-foreground";

  const changeIcon =
    metric.vs_previous?.change_direction === "up"
      ? "↑"
      : metric.vs_previous?.change_direction === "down"
      ? "↓"
      : "→";

  // Determine what stats to show based on type
  const showTotal = metric.type !== "hhmm" && metric.type !== "checkbox";
  const showAvg = metric.type !== "checkbox";
  const showMinMax = metric.type !== "checkbox";

  // Determine which record badges to show based on direction
  const showAllTimeHigh = metric.direction === "increase" && metric.records.is_all_time_high;
  const showAllTimeLow = metric.direction === "decrease" && metric.records.is_all_time_low;
  const showPeriodHigh = metric.direction === "increase" && metric.records.is_period_high && !metric.records.is_all_time_high;
  const showPeriodLow = metric.direction === "decrease" && metric.records.is_period_low && !metric.records.is_all_time_low;

  // Format average for display
  const formattedAverage = metric.type === "count"
    ? formatCountAverage(metric.average)
    : formatTimeValue(metric.average, metric.type);

  // Format previous average for comparison display
  const formattedPrevAverage = metric.type === "count" && metric.vs_previous
    ? formatCountAverage(metric.vs_previous.prev_average)
    : metric.vs_previous
    ? formatTimeValue(metric.vs_previous.prev_average, metric.type)
    : "";

  return (
    <Card
      className={cn(
        "transition-colors",
        onClick && "cursor-pointer hover:bg-muted/50"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm truncate">{metric.metric_name}</h3>
            <div className="flex items-center gap-2 mt-1">
              {showAllTimeHigh && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  🏆 All-time High
                </Badge>
              )}
              {showAllTimeLow && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-green-600">
                  📉 All-time Low
                </Badge>
              )}
              {showPeriodHigh && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Period High
                </Badge>
              )}
              {showPeriodLow && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  Period Low
                </Badge>
              )}
            </div>
          </div>

          {metric.vs_previous && (
            <div className={cn("text-right", changeColor)}>
              <span className="text-lg font-bold">{changeIcon}</span>
              <div className="text-xs font-mono">
                {metric.vs_previous.pct_change > 0 ? "+" : ""}
                {metric.vs_previous.pct_change}%
              </div>
              <div className="text-[10px] text-muted-foreground">
                vs {formattedPrevAverage}
              </div>
            </div>
          )}
        </div>

        <div className={cn("mt-3 grid gap-2 text-center", showTotal ? "grid-cols-3" : "grid-cols-2")}>
          {showAvg && (
            <div>
              <div className="text-lg font-mono font-semibold">
                {formattedAverage}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase">
                {metric.type === "count" ? "Freq" : "Avg"}
              </div>
            </div>
          )}
          {showTotal && (
            <div>
              <div className="text-lg font-mono font-semibold">
                {formatTimeValue(metric.total, metric.type)}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase">Total</div>
            </div>
          )}
          <div>
            <div className="text-lg font-mono font-semibold">{metric.count}</div>
            <div className="text-[10px] text-muted-foreground uppercase">Days</div>
          </div>
          {metric.type === "checkbox" && (
            <div>
              <div className="text-lg font-mono font-semibold">{metric.total}</div>
              <div className="text-[10px] text-muted-foreground uppercase">Checked</div>
            </div>
          )}
        </div>

        {showMinMax && (
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>Min: {formatTimeValue(metric.min, metric.type)}</span>
            <span>Max: {formatTimeValue(metric.max, metric.type)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
