"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

type StreakInfo = {
  value: number;
  startDate: string;
  endDate: string;
};

type ValueWithDate = {
  value: number;
  date: string;
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
    showStreak: boolean;
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
  numberStats?: {
    lifetimeAvg: number;
    high: ValueWithDate | null;
    low: ValueWithDate | null;
    periodAverages: {
      days7: number | null;
      days30: number | null;
      days90: number | null;
      days180: number | null;
    };
    trend: "up" | "down" | "stable" | null;
  };
  comparisons: {
    ytd: { count: number; daysInPeriod: number; avg?: number };
    prevYtd: { count: number; daysInPeriod: number; avg?: number };
    thisMonth: { count: number; daysInPeriod: number; avg?: number };
    sameMonthLastYear: { count: number; daysInPeriod: number; avg?: number };
  };
  dayOfWeekBreakdown: Record<string, number>;
  dayOfWeekAverages?: Record<string, number | null>;
  movingAverages: {
    date: string;
    raw: number | null;
    ma7: number | null;
    ma30: number | null;
    ma90: number | null;
    ma180: number | null;
  }[];
};

type MetricStatsSheetProps = {
  metricId: string | null;
  metricName: string | null;
  metricType: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}

function formatDateRange(start: string, end: string): string {
  return `${formatDate(start)} - ${formatDate(end)}`;
}

// Format a numeric value based on metric type (handles time/hhmm as HH:MM)
function formatMetricValue(value: number | null | undefined, metricType: string | null): string {
  if (value == null) return "N/A";

  if (metricType === "time" || metricType === "hhmm") {
    // Value is in minutes, format as H:MM or HH:MM
    const totalMins = Math.round(value);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `${hrs}:${String(mins).padStart(2, "0")}`;
  }

  // Regular number - round to 1 decimal
  return String(Math.round(value * 10) / 10);
}

function formatDuration(days: number): string {
  // Ensure we have a valid positive number
  if (!Number.isFinite(days)) return "N/A";
  const absDays = Math.abs(Math.round(days));

  if (absDays < 30) {
    return `${absDays} day${absDays === 1 ? "" : "s"}`;
  }

  const years = Math.floor(absDays / 365);
  const remainingAfterYears = absDays % 365;
  const months = Math.floor(remainingAfterYears / 30);
  const remainingDays = remainingAfterYears % 30;

  const parts: string[] = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}m`);
  if (remainingDays > 0 || parts.length === 0) parts.push(`${remainingDays}d`);

  return parts.join(" ");
}

// Stat item component
function StatItem({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      {subtext && (
        <span className="text-xs text-muted-foreground">{subtext}</span>
      )}
    </div>
  );
}

// Heatmap color interpolation - from cool (low) to warm (high)
function getHeatmapColor(ratio: number): string {
  // ratio is 0-1 representing position between min and max
  // Color scale: blue (low) -> green (mid) -> orange (high)
  if (ratio <= 0.5) {
    // Blue to green (0 to 0.5)
    const t = ratio * 2; // 0 to 1
    const r = Math.round(59 + t * (34 - 59));
    const g = Math.round(130 + t * (197 - 130));
    const b = Math.round(246 + t * (94 - 246));
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    // Green to orange (0.5 to 1)
    const t = (ratio - 0.5) * 2; // 0 to 1
    const r = Math.round(34 + t * (249 - 34));
    const g = Math.round(197 + t * (115 - 197));
    const b = Math.round(94 + t * (22 - 94));
    return `rgb(${r}, ${g}, ${b})`;
  }
}

// Day of week bar component - supports both counts and averages with heatmap coloring
function DayOfWeekBar({
  breakdown,
  maxValue,
  averages,
  isAverage = false,
  metricType = null,
}: {
  breakdown: Record<string, number>;
  maxValue: number;
  averages?: Record<string, number | null>;
  isAverage?: boolean;
  metricType?: string | null;
}) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Use averages if provided for number metrics
  const displayData = isAverage && averages ? averages : breakdown;

  // Get all valid values for min-max scaling
  const values = days.map(day => {
    const v = displayData[day];
    return v !== null && v !== undefined ? v : null;
  }).filter((v): v is number => v !== null);

  const minVal = values.length > 0 ? Math.min(...values) : 0;
  const maxVal = values.length > 0 ? Math.max(...values) : 0;
  const range = maxVal - minVal;

  // Format value based on metric type
  const formatValue = (v: number) => {
    if (isAverage && (metricType === "time" || metricType === "hhmm")) {
      const totalMins = Math.round(v);
      const hrs = Math.floor(totalMins / 60);
      const mins = totalMins % 60;
      return `${hrs}:${String(mins).padStart(2, "0")}`;
    }
    return isAverage ? v.toFixed(1) : String(v);
  };

  return (
    <div className="flex gap-1 items-end" style={{ height: 80 }}>
      {days.map((day) => {
        const value = displayData[day];
        const displayValue = value !== null && value !== undefined ? value : 0;
        const hasValue = value !== null && value !== undefined && displayValue > 0;

        // Calculate height using min-max scaling for better differentiation
        // Use a minimum of 20% height difference between min and max
        let barHeight = 4; // minimum height
        if (hasValue && maxVal > 0) {
          if (range > 0) {
            // Min-max scaling: lowest value gets 30% height, highest gets 100%
            const normalizedRatio = (displayValue - minVal) / range;
            barHeight = Math.max((0.3 + normalizedRatio * 0.7) * 48, 4);
          } else {
            // All values are the same
            barHeight = 48;
          }
        }

        // Calculate heatmap color based on position in range
        const colorRatio = range > 0 ? (displayValue - minVal) / range : 0.5;
        const barColor = hasValue ? getHeatmapColor(colorRatio) : "rgb(100, 100, 100)";

        return (
          <div key={day} className="flex-1 flex flex-col items-center justify-end gap-0.5" style={{ height: 80 }}>
            {/* Data label above bar */}
            <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
              {value !== null && displayValue > 0 ? formatValue(displayValue) : ""}
            </span>
            <div
              className="w-full rounded-t transition-all"
              style={{ height: barHeight, backgroundColor: barColor }}
              title={`${day}: ${formatValue(displayValue)}`}
            />
            <span className="text-[10px] text-muted-foreground">{day}</span>
          </div>
        );
      })}
    </div>
  );
}

// Full-width sparkline component with MA line and daily value points
function FullWidthSparkline({
  maValues,
  dailyValues,
  height = 60
}: {
  maValues: number[];
  dailyValues?: (number | null)[];
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);

  // Update width on mount and resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setWidth(containerRef.current.offsetWidth);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  if (maValues.length < 2) return null;

  // Calculate min/max across both datasets
  const allValues = [
    ...maValues,
    ...(dailyValues?.filter((v): v is number => v !== null) ?? [])
  ];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const padding = 8;
  const chartHeight = height - padding * 2;

  // Create MA line path
  const maPoints = maValues.map((v, i) => {
    const x = (i / (maValues.length - 1)) * width;
    const y = padding + chartHeight - ((v - min) / range) * chartHeight;
    return `${x},${y}`;
  });
  const maPathD = `M ${maPoints.join(" L ")}`;

  // Determine trend color for MA line
  const startAvg = maValues.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, maValues.length);
  const endAvg = maValues.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, maValues.length);
  const strokeColor = endAvg > startAvg ? "#22c55e" : endAvg < startAvg ? "#ef4444" : "#6b7280";

  // Calculate daily value points
  const dailyPoints = dailyValues?.map((v, i) => {
    if (v === null) return null;
    const x = (i / (dailyValues.length - 1)) * width;
    const y = padding + chartHeight - ((v - min) / range) * chartHeight;
    return { x, y, value: v };
  }).filter((p): p is { x: number; y: number; value: number } => p !== null) ?? [];

  return (
    <div ref={containerRef} className="w-full">
      <svg width="100%" height={height} className="overflow-visible">
        {/* Daily value points - rendered first so MA line is on top */}
        {dailyPoints.map((point, i) => (
          <circle
            key={i}
            cx={point.x}
            cy={point.y}
            r={2.5}
            fill="#94a3b8"
            opacity={0.6}
          />
        ))}

        {/* MA line */}
        <path
          d={maPathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* End dot on MA line */}
        <circle
          cx={width}
          cy={padding + chartHeight - ((maValues[maValues.length - 1] - min) / range) * chartHeight}
          r={4}
          fill={strokeColor}
        />
      </svg>
    </div>
  );
}

export function MetricStatsSheet({
  metricId,
  metricName,
  metricType,
  open,
  onOpenChange,
}: MetricStatsSheetProps) {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track which MA lines are visible (for legend toggle)
  const [visibleLines, setVisibleLines] = useState<Record<string, boolean>>({
    ma7: true,
    ma30: true,
    ma90: true,
    ma180: true,
  });

  // Fetch stats when sheet opens
  useEffect(() => {
    if (!open || !metricId) {
      setStats(null);
      setError(null);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/metrics/${encodeURIComponent(metricId)}/stats`, {
          headers,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to load stats (${res.status})`);
        }

        const data = await res.json();
        setStats(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, metricId]);

  // Prepare chart data - sample every N days for performance if needed
  const chartData = useMemo(() => {
    if (!stats?.movingAverages) return [];

    const ma = stats.movingAverages;
    // If more than 365 points, sample weekly
    if (ma.length > 365) {
      return ma.filter((_, i) => i % 7 === 0 || i === ma.length - 1);
    }
    return ma;
  }, [stats?.movingAverages]);

  // Calculate year markers for the chart - find index positions for Jan 1 of each year
  const yearMarkers = useMemo(() => {
    if (!chartData.length) return [];

    const years = new Set<number>();
    for (const d of chartData) {
      const year = parseInt(d.date.slice(0, 4), 10);
      years.add(year);
    }

    // Return closest date to Jan 1 of each year (except the first year's start)
    const markers: { date: string; year: number; index: number }[] = [];
    const sortedYears = Array.from(years).sort();

    for (let i = 1; i < sortedYears.length; i++) {
      const year = sortedYears[i];
      const jan1 = `${year}-01-01`;

      // Find the index of the closest date in chartData to Jan 1
      let closestIdx = -1;
      let closestDiff = Infinity;

      for (let j = 0; j < chartData.length; j++) {
        const d = chartData[j].date;
        // Only look at dates within a week of Jan 1
        if (d >= `${year - 1}-12-25` && d <= `${year}-01-07`) {
          const diff = Math.abs(
            new Date(d).getTime() - new Date(jan1).getTime()
          );
          if (diff < closestDiff) {
            closestDiff = diff;
            closestIdx = j;
          }
        }
      }

      if (closestIdx >= 0) {
        markers.push({ date: chartData[closestIdx].date, year, index: closestIdx });
      }
    }

    return markers;
  }, [chartData]);

  // Toggle line visibility from legend click
  const handleLegendClick = (dataKey: string) => {
    setVisibleLines((prev) => ({
      ...prev,
      [dataKey]: !prev[dataKey],
    }));
  };

  // Find max value for day of week breakdown
  const maxDayOfWeek = useMemo(() => {
    if (!stats?.dayOfWeekBreakdown) return 0;
    return Math.max(...Object.values(stats.dayOfWeekBreakdown));
  }, [stats?.dayOfWeekBreakdown]);

  // Calculate YoY change
  const yoyChange = useMemo(() => {
    if (!stats) return null;
    const ytd = stats.comparisons.ytd.count;
    const prevYtd = stats.comparisons.prevYtd.count;
    if (prevYtd === 0) return null;
    const pct = ((ytd - prevYtd) / prevYtd) * 100;
    return Math.round(pct);
  }, [stats]);

  // Determine if checkbox metric (for chart formatting)
  const isCheckbox = metricType === "checkbox";

  // Calculate Y-axis domain for non-checkbox metrics
  const yAxisConfig = useMemo(() => {
    if (isCheckbox) {
      return {
        domain: [0, 1] as [number, number],
        tickFormatter: (v: number) => `${Math.round(v * 100)}%`,
        tooltipFormatter: (value: number) => `${Math.round(value * 100)}%`,
      };
    }

    // For number/time metrics, find min/max from data
    if (!chartData.length) {
      return {
        domain: ["auto", "auto"] as ["auto", "auto"],
        tickFormatter: (v: number) => String(Math.round(v * 10) / 10),
        tooltipFormatter: (value: number) => String(Math.round(value * 100) / 100),
      };
    }

    let min = Infinity;
    let max = -Infinity;

    for (const d of chartData) {
      for (const key of ["ma7", "ma30", "ma90", "ma180"] as const) {
        const v = d[key];
        if (v != null) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    }

    // Add 10% padding
    const range = max - min || 1;
    const paddedMin = Math.max(0, min - range * 0.1);
    const paddedMax = max + range * 0.1;

    // Format based on time type
    const isTimeType = metricType === "time" || metricType === "hhmm";

    return {
      domain: [paddedMin, paddedMax] as [number, number],
      tickFormatter: isTimeType
        ? (v: number) => {
            const hrs = Math.floor(v / 60);
            const mins = Math.round(v % 60);
            return `${hrs}:${String(mins).padStart(2, "0")}`;
          }
        : (v: number) => String(Math.round(v * 10) / 10),
      tooltipFormatter: isTimeType
        ? (value: number) => {
            const hrs = Math.floor(value / 60);
            const mins = Math.round(value % 60);
            return `${hrs}h ${mins}m`;
          }
        : (value: number) => String(Math.round(value * 100) / 100),
    };
  }, [chartData, isCheckbox, metricType]);

  // Get recent values for sparkline (last 30 days of ma7 and raw daily values)
  const sparklineData = useMemo(() => {
    if (!chartData.length) return { maValues: [], dailyValues: [] };
    const recent = chartData.slice(-30);
    const maValues = recent
      .map((d) => d.ma7)
      .filter((v): v is number => v !== null);
    // Use raw values for daily points
    const dailyValues = recent.map((d) => d.raw);
    return { maValues, dailyValues };
  }, [chartData]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[50vw] overflow-y-auto"
      >
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            {metricName || metricId}
            {metricType && (
              <Badge variant="secondary" className="text-xs">
                {metricType}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {stats?.metric.trackingSince
              ? `Tracking since ${formatDate(stats.metric.trackingSince)}`
              : "Loading..."}
          </SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <span className="text-muted-foreground">Loading stats...</span>
          </div>
        )}

        {error && (
          <div className="py-6">
            <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
              {error}
            </div>
          </div>
        )}

        {stats && !loading && (
          <div className="space-y-6 py-6">
            {/* Streaks Section - only show if showStreak is true */}
            {stats.metric.showStreak && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Streaks</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <StatItem
                      label="Current"
                      value={
                        stats.metric.isAvoid
                          ? (stats.streaks.current < 0
                              ? `+${Math.abs(stats.streaks.current)}`
                              : stats.streaks.current > 0
                              ? `-${stats.streaks.current}`
                              : "0")
                          : (stats.streaks.current > 0
                              ? `+${stats.streaks.current}`
                              : stats.streaks.current)
                      }
                      subtext={
                        stats.metric.isAvoid
                          ? (stats.streaks.current < 0
                              ? "days avoided"
                              : "days slipped")
                          : (stats.streaks.current > 0
                              ? "days in a row"
                              : "days missed")
                      }
                    />
                    <StatItem
                      label={stats.metric.isAvoid ? "Longest Avoided" : "Best Ever"}
                      value={
                        stats.streaks.best
                          ? formatDuration(stats.streaks.best.value)
                          : "N/A"
                      }
                      subtext={
                        stats.streaks.best
                          ? formatDateRange(
                              stats.streaks.best.startDate,
                              stats.streaks.best.endDate
                            )
                          : undefined
                      }
                    />
                    <StatItem
                      label={stats.metric.isAvoid ? "Worst Slip" : "Worst Dry Spell"}
                      value={
                        stats.streaks.worstDrySpell
                          ? formatDuration(stats.streaks.worstDrySpell.value)
                          : "N/A"
                      }
                      subtext={
                        stats.streaks.worstDrySpell
                          ? formatDateRange(
                              stats.streaks.worstDrySpell.startDate,
                              stats.streaks.worstDrySpell.endDate
                            )
                          : undefined
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Number Stats Section - only for number/time metrics */}
            {stats.numberStats && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    Value Statistics
                    {stats.numberStats.trend && (
                      <Badge variant={stats.numberStats.trend === "up" ? "default" : stats.numberStats.trend === "down" ? "destructive" : "secondary"} className="text-xs">
                        {stats.numberStats.trend === "up" ? "↑ Trending Up" : stats.numberStats.trend === "down" ? "↓ Trending Down" : "→ Stable"}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Full-width sparkline showing recent trend */}
                  {sparklineData.maValues.length > 2 && (
                    <div className="mb-4 pb-4 border-b">
                      <div className="text-xs text-muted-foreground mb-2">Last 30 Days Trend</div>
                      <FullWidthSparkline
                        maValues={sparklineData.maValues}
                        dailyValues={sparklineData.dailyValues}
                        height={60}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    <StatItem
                      label="Lifetime Avg"
                      value={formatMetricValue(stats.numberStats.lifetimeAvg, metricType)}
                    />
                    <StatItem
                      label="7-Day Avg"
                      value={formatMetricValue(stats.numberStats.periodAverages.days7, metricType)}
                    />
                    <StatItem
                      label="30-Day Avg"
                      value={formatMetricValue(stats.numberStats.periodAverages.days30, metricType)}
                    />
                    <StatItem
                      label="90-Day Avg"
                      value={formatMetricValue(stats.numberStats.periodAverages.days90, metricType)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                    <StatItem
                      label="All-Time High"
                      value={formatMetricValue(stats.numberStats.high?.value, metricType)}
                      subtext={stats.numberStats.high ? formatDate(stats.numberStats.high.date) : undefined}
                    />
                    <StatItem
                      label="All-Time Low"
                      value={formatMetricValue(stats.numberStats.low?.value, metricType)}
                      subtext={stats.numberStats.low ? formatDate(stats.numberStats.low.date) : undefined}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Moving Averages Chart */}
            {chartData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Moving Averages
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div style={{ width: "100%", height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData}
                        margin={{ top: 20, right: 10, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />

                        {/* Year markers - rendered as reference lines */}
                        {yearMarkers.map((marker) => (
                          <ReferenceLine
                            key={`year-${marker.year}`}
                            x={marker.date}
                            stroke="#374151"
                            strokeWidth={2}
                            label={{
                              value: String(marker.year),
                              position: "insideTopRight",
                              fontSize: 11,
                              fill: "#374151",
                              fontWeight: "bold",
                            }}
                          />
                        ))}

                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(d) => {
                            // Show year for Jan dates, otherwise MM-DD
                            const month = d.slice(5, 7);
                            const day = d.slice(8, 10);
                            if (month === "01" && parseInt(day) <= 7) {
                              return d.slice(0, 4); // Show year
                            }
                            return `${month}-${day}`;
                          }}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fontSize: 10 }}
                          domain={yAxisConfig.domain}
                          tickFormatter={yAxisConfig.tickFormatter}
                        />
                        <Tooltip
                          labelFormatter={(d) => formatDate(d as string)}
                          formatter={(value: number) => [
                            yAxisConfig.tooltipFormatter(value),
                          ]}
                        />
                        {/* Custom legend with explicit order */}
                        <Legend
                          wrapperStyle={{ cursor: "pointer", paddingTop: 4 }}
                          content={({ payload }) => {
                            // Force specific order regardless of what Recharts provides
                            const orderedItems = [
                              { dataKey: "ma7", name: "7-day", color: "#3b82f6" },
                              { dataKey: "ma30", name: "30-day", color: "#10b981" },
                              { dataKey: "ma90", name: "90-day", color: "#f59e0b" },
                              { dataKey: "ma180", name: "180-day", color: "#8b5cf6" },
                            ];
                            return (
                              <div className="flex justify-center gap-4 text-xs">
                                {orderedItems.map((item) => (
                                  <button
                                    key={item.dataKey}
                                    type="button"
                                    onClick={() => handleLegendClick(item.dataKey)}
                                    className="flex items-center gap-1 hover:opacity-80"
                                    style={{
                                      opacity: visibleLines[item.dataKey] ? 1 : 0.4,
                                      textDecoration: visibleLines[item.dataKey] ? "none" : "line-through",
                                    }}
                                  >
                                    <span
                                      className="inline-block w-3 h-0.5"
                                      style={{ backgroundColor: item.color }}
                                    />
                                    {item.name}
                                  </button>
                                ))}
                              </div>
                            );
                          }}
                        />

                        {/* Lines in order: 7, 30, 90, 180 */}
                        <Line
                          type="monotone"
                          dataKey="ma7"
                          name="7-day"
                          stroke="#3b82f6"
                          dot={false}
                          strokeWidth={2}
                          connectNulls
                          hide={!visibleLines.ma7}
                        />
                        <Line
                          type="monotone"
                          dataKey="ma30"
                          name="30-day"
                          stroke="#10b981"
                          dot={false}
                          strokeWidth={2}
                          connectNulls
                          hide={!visibleLines.ma30}
                        />
                        <Line
                          type="monotone"
                          dataKey="ma90"
                          name="90-day"
                          stroke="#f59e0b"
                          dot={false}
                          strokeWidth={2}
                          connectNulls
                          hide={!visibleLines.ma90}
                        />
                        <Line
                          type="monotone"
                          dataKey="ma180"
                          name="180-day"
                          stroke="#8b5cf6"
                          dot={false}
                          strokeWidth={2}
                          connectNulls
                          hide={!visibleLines.ma180}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Statistics - different for checkbox vs number metrics */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {isCheckbox ? "Frequency Statistics" : "Logging Statistics"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isCheckbox ? (
                  // Checkbox: show frequency stats
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <StatItem
                      label="Total Days Logged"
                      value={stats.frequency.totalDaysLogged}
                      subtext={`${stats.frequency.percentLogged}% of ${stats.frequency.totalDaysPossible} days`}
                    />
                    <StatItem
                      label="Avg per Week"
                      value={stats.frequency.avgPerWeek}
                      subtext="times/week"
                    />
                    <StatItem
                      label="Avg per Month"
                      value={stats.frequency.avgPerMonth}
                      subtext="times/month"
                    />
                    <StatItem
                      label="Avg Days Between"
                      value={stats.frequency.avgDaysBetween}
                      subtext="days"
                    />
                    {stats.frequency.rolling30DayAvgBetween !== null && (
                      <StatItem
                        label="30-Day Rolling Avg"
                        value={stats.frequency.rolling30DayAvgBetween}
                        subtext="days between"
                      />
                    )}
                  </div>
                ) : (
                  // Number/time: show logging info
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <StatItem
                      label="Total Days Logged"
                      value={stats.frequency.totalDaysLogged}
                      subtext={`${stats.frequency.percentLogged}% of ${stats.frequency.totalDaysPossible} days`}
                    />
                    <StatItem
                      label="180-Day Avg"
                      value={formatMetricValue(stats.numberStats?.periodAverages.days180, metricType)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Day of Week Breakdown/Averages */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {isCheckbox ? "Day of Week Pattern" : "Average by Day of Week"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DayOfWeekBar
                  breakdown={stats.dayOfWeekBreakdown}
                  maxValue={maxDayOfWeek}
                  averages={stats.dayOfWeekAverages}
                  isAverage={!isCheckbox}
                  metricType={metricType}
                />
              </CardContent>
            </Card>

            {/* Comparisons */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Comparisons</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground font-medium">
                      Year to Date
                    </div>
                    {isCheckbox ? (
                      <>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-semibold tabular-nums">
                            {stats.comparisons.ytd.count}
                          </span>
                          {yoyChange !== null && (
                            <Badge
                              variant={yoyChange >= 0 ? "default" : "destructive"}
                              className="text-xs"
                            >
                              {yoyChange >= 0 ? "+" : ""}
                              {yoyChange}% YoY
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          vs {stats.comparisons.prevYtd.count} same period last year
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-semibold tabular-nums">
                            {formatMetricValue(stats.comparisons.ytd.avg, metricType)}
                          </span>
                          <span className="text-xs text-muted-foreground">avg</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          vs {formatMetricValue(stats.comparisons.prevYtd.avg, metricType)} avg same period last year
                        </div>
                      </>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground font-medium">
                      This Month
                    </div>
                    {isCheckbox ? (
                      <>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-semibold tabular-nums">
                            {stats.comparisons.thisMonth.count}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          vs {stats.comparisons.sameMonthLastYear.count} same month
                          last year
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-semibold tabular-nums">
                            {formatMetricValue(stats.comparisons.thisMonth.avg, metricType)}
                          </span>
                          <span className="text-xs text-muted-foreground">avg</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          vs {formatMetricValue(stats.comparisons.sameMonthLastYear.avg, metricType)} avg same month last year
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
