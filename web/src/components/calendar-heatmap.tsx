"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

export type HeatmapDataPoint = {
  date: string;
  value: number;
  goalMet?: boolean;
};

export type CalendarHeatmapProps = {
  data: HeatmapDataPoint[];
  metricType?: "number" | "checkbox" | "hhmm" | "time" | "score" | "count" | "text";
  direction?: "increase" | "decrease" | "neutral";
  year?: number;
  selectedDate?: string | null;
  onHover?: (cell: { date: string; value: number } | null) => void;
  onCellClick?: (date: string, value: number) => void;
};

function formatHHMM(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes)) return "";
  const minutes = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function formatDuration(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes)) return "";
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function CalendarHeatmap({
  data,
  metricType = "number",
  direction = "increase",
  year,
  selectedDate,
  onHover,
  onCellClick,
}: CalendarHeatmapProps) {
  const valueMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of data) m.set(d.date, d.value);
    return m;
  }, [data]);

  const goalMetMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const d of data) {
      if (d.goalMet !== undefined) m.set(d.date, d.goalMet);
    }
    return m;
  }, [data]);

  // Filter data by year if specified
  const filteredData = useMemo(() => {
    if (!year) return data;
    const yearStr = String(year);
    return data.filter(d => d.date.startsWith(yearStr));
  }, [data, year]);

  // Months in chronological order (Jan-Dec)
  const months = useMemo(() => {
    if (year) {
      // Always show all 12 months for the selected year
      const result: string[] = [];
      for (let m = 1; m <= 12; m++) {
        result.push(`${year}-${String(m).padStart(2, "0")}`);
      }
      return result; // Jan to Dec order
    }
    if (filteredData.length === 0) return [];

    const sorted = [...filteredData].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0].date;
    const last = sorted[sorted.length - 1].date;
    const result: string[] = [];
    const d = new Date(first.slice(0, 7) + "-01T00:00:00");
    const end = new Date(last.slice(0, 7) + "-01T00:00:00");
    while (d <= end) {
      result.push(d.toISOString().slice(0, 7));
      d.setMonth(d.getMonth() + 1);
    }
    return result.sort(); // Chronological order
  }, [filteredData, year]);

  const allValues = filteredData.map((d) => d.value);
  const minVal = allValues.length > 0 ? Math.min(...allValues) : 0;
  const maxVal = allValues.length > 0 ? Math.max(...allValues) : 1;
  const valRange = maxVal - minVal || 1;

  // Determine if higher is better based on direction
  const higherIsBetter = direction === "increase";
  const isNeutral = direction === "neutral";

  function getColor(value: number): string {
    // Checkbox type: green for checked (1), gray for unchecked (0)
    if (metricType === "checkbox") {
      if (value >= 0.5) {
        // Checked - green or red based on direction
        return higherIsBetter ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)";
      }
      return "var(--muted)";
    }

    // Neutral direction: use a blue gradient
    if (isNeutral) {
      const t = (value - minVal) / valRange;
      const intensity = Math.round(100 + t * 155);
      return `rgb(${255 - intensity}, ${255 - intensity}, ${intensity})`;
    }

    const t = (value - minVal) / valRange;
    if (higherIsBetter) {
      // Green gradient for higher is better (red low -> green high)
      if (t < 0.5) {
        const s = t * 2;
        const r = Math.round(220 - s * 40);
        const g = Math.round(60 + s * 160);
        const b = Math.round(60 + s * 10);
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        const s = (t - 0.5) * 2;
        const r = Math.round(180 - s * 140);
        const g = Math.round(220 - s * 25);
        const b = Math.round(70 + s * 30);
        return `rgb(${r}, ${g}, ${b})`;
      }
    } else {
      // Inverted - green for low, red for high
      if (t < 0.5) {
        const s = t * 2;
        const r = Math.round(40 + s * 140);
        const g = Math.round(195 - s * 25);
        const b = Math.round(100 - s * 30);
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        const s = (t - 0.5) * 2;
        const r = Math.round(180 + s * 40);
        const g = Math.round(170 - s * 110);
        const b = Math.round(70 - s * 10);
        return `rgb(${r}, ${g}, ${b})`;
      }
    }
  }

  const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

  if (months.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-8">
        No data available for the selected period.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {months.map((month) => {
        const [y, m] = month.split("-").map(Number);
        const firstDay = new Date(y, m - 1, 1);
        const daysInMonth = new Date(y, m, 0).getDate();
        const startDow = firstDay.getDay();
        const cells: (null | { day: number; date: string; value: number | undefined })[] = [];
        for (let i = 0; i < startDow; i++) cells.push(null);
        for (let day = 1; day <= daysInMonth; day++) {
          const ds = `${month}-${String(day).padStart(2, "0")}`;
          cells.push({ day, date: ds, value: valueMap.get(ds) });
        }

        return (
          <Card key={month} className="overflow-hidden">
            <CardContent className="px-2 pt-2 pb-1.5">
              <p className="text-[10px] font-medium mb-1 text-muted-foreground">
                {firstDay.toLocaleString("default", { month: "short" })} {y}
              </p>
              <div className="grid grid-cols-7 gap-px">
                {DAY_LABELS.map((d, i) => (
                  <div key={`${d}${i}`} className="text-[7px] text-muted-foreground/60 text-center">
                    {d}
                  </div>
                ))}
                {cells.map((cell, i) => {
                  if (!cell) return <div key={`e${i}`} />;
                  const hasValue = cell.value !== undefined;
                  const isGoalMet = goalMetMap.get(cell.date);
                  const isSelected = selectedDate === cell.date;

                  // For checkbox, only color if checked
                  const showColor = hasValue && (metricType !== "checkbox" || cell.value! >= 0.5);

                  return (
                    <div
                      key={cell.date}
                      className={`aspect-square rounded-[2px] flex items-center justify-center text-[7px] transition-all relative ${
                        hasValue ? "cursor-pointer hover:scale-125 hover:z-10" : "cursor-default"
                      } ${isSelected ? "scale-150 z-20 ring-2 ring-foreground shadow-lg" : ""}`}
                      style={{
                        backgroundColor: showColor ? getColor(cell.value!) : "var(--muted)",
                        opacity: hasValue ? 1 : 0.2,
                        color: showColor ? "rgba(0,0,0,0.5)" : undefined,
                      }}
                      onMouseEnter={() =>
                        hasValue && onHover?.({ date: cell.date, value: cell.value! })
                      }
                      onMouseLeave={() => onHover?.(null)}
                      onClick={() => hasValue && onCellClick?.(cell.date, cell.value!)}
                    >
                      {cell.day}
                      {isGoalMet && (
                        <span className="absolute -top-0.5 -right-0.5 text-[6px]" title="Goal met">
                          🏆
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// Helper to get legend colors
export function getHeatmapLegendColors(
  direction: "increase" | "decrease" | "neutral",
  minVal: number,
  maxVal: number
): { color: string; value: number }[] {
  const valRange = maxVal - minVal || 1;
  const higherIsBetter = direction === "increase";
  const isNeutral = direction === "neutral";

  return [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const value = minVal + t * valRange;
    let color: string;

    if (isNeutral) {
      const intensity = Math.round(100 + t * 155);
      color = `rgb(${255 - intensity}, ${255 - intensity}, ${intensity})`;
    } else if (higherIsBetter) {
      if (t < 0.5) {
        const s = t * 2;
        const r = Math.round(220 - s * 40);
        const g = Math.round(60 + s * 160);
        const b = Math.round(60 + s * 10);
        color = `rgb(${r}, ${g}, ${b})`;
      } else {
        const s = (t - 0.5) * 2;
        const r = Math.round(180 - s * 140);
        const g = Math.round(220 - s * 25);
        const b = Math.round(70 + s * 30);
        color = `rgb(${r}, ${g}, ${b})`;
      }
    } else {
      if (t < 0.5) {
        const s = t * 2;
        const r = Math.round(40 + s * 140);
        const g = Math.round(195 - s * 25);
        const b = Math.round(100 - s * 30);
        color = `rgb(${r}, ${g}, ${b})`;
      } else {
        const s = (t - 0.5) * 2;
        const r = Math.round(180 + s * 40);
        const g = Math.round(170 - s * 110);
        const b = Math.round(70 - s * 10);
        color = `rgb(${r}, ${g}, ${b})`;
      }
    }

    return { color, value };
  });
}

export { formatHHMM, formatDuration };
