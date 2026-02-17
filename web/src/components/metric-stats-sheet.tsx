"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { GoalsSection } from "@/components/goal-progress-card";
import { ChartTooltip } from "@/components/chart-tooltip";

type GoalProgressData = {
  goal_id: string;
  name: string;
  type: "numeric" | "numeric_threshold" | "checkbox" | "hhmm_target" | "hhmm_consistency";
  frequency: "daily" | "weekly" | "monthly";
  current: number;
  target: number;
  progress_pct: number;
  is_met: boolean;
  status: "on_track" | "at_risk" | "met" | "missed" | "not_started";
  period_start: string;
  period_end: string;
  days_elapsed: number;
  days_remaining: number;
  projected: number | null;
  measure?: "sum" | "average";
  direction?: "gte" | "lte" | "before" | "after";
  target_value?: number; // Original target for display (e.g., target_time for hhmm)
};

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
    isAvoid: boolean; // deprecated, use direction
    direction: "increase" | "decrease" | "neutral";
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
    timeTotals?: {
      thisWeek: number;
      thisMonth: number;
      thisYear: number;
      lifetime: number;
    };
    hhmmStats?: {
      avgTime: number;
      stdDev: number;
      earliest: ValueWithDate | null;
      latest: ValueWithDate | null;
    };
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
  goals?: {
    active: GoalProgressData[];
    history: GoalHistoricalStats[];
  };
};

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

  // Regular number - round to 2 decimals
  return String(Math.round(value * 100) / 100);
}

// Format minutes from midnight to 12-hour time (e.g., "7:30 AM")
function formatTimeOfDay(minutes: number): string {
  const hrs24 = Math.floor(minutes / 60) % 24;
  const mins = Math.round(minutes % 60);
  const hrs12 = hrs24 === 0 ? 12 : hrs24 > 12 ? hrs24 - 12 : hrs24;
  const ampm = hrs24 < 12 ? "AM" : "PM";
  return `${hrs12}:${String(mins).padStart(2, "0")} ${ampm}`;
}

// Format consistency (standard deviation) as a readable string
function formatConsistency(stdDevMinutes: number): string {
  if (stdDevMinutes < 15) return "Very consistent";
  if (stdDevMinutes < 30) return "Consistent";
  if (stdDevMinutes < 60) return "Moderate";
  if (stdDevMinutes < 120) return "Variable";
  return "Highly variable";
}

// Format time duration in minutes to a human-readable format (e.g., "12h 30m" or "3d 5h")
function formatTimeDuration(minutes: number): string {
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  if (days < 7) {
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }

  // For longer durations, show days and hours
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
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

  // Track which goal target lines are visible
  const [visibleGoalTargets, setVisibleGoalTargets] = useState<Record<string, boolean>>({});

  // Date range for MA chart
  const [chartRange, setChartRange] = useState<"30d" | "90d" | "1y" | "all">("all");

  // Compare to previous year
  const [compareLastYear, setCompareLastYear] = useState(false);

  // Compare with other metrics
  const [availableMetrics, setAvailableMetrics] = useState<{ id: string; name: string; type: string; group: string | null }[]>([]);
  const [compareMetricIds, setCompareMetricIds] = useState<string[]>([]);
  const [compareMetricsData, setCompareMetricsData] = useState<Record<string, StatsResponse>>({});
  const [normalizeComparison, setNormalizeComparison] = useState(true);
  const [showCompareDropdown, setShowCompareDropdown] = useState(false);

  // Mobile detection
  const isMobile = useMediaQuery("(max-width: 639px)");

  // Swipe-down-to-close — only active when scrolled to the very top
  const touchStartY = useRef<number | null>(null);
  const touchDeltaY = useRef(0);
  const swipeActive = useRef(false);
  const sheetContentRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchDeltaY.current = 0;
    // Only allow swipe-to-close when the sheet is scrolled to the top
    const el = sheetContentRef.current;
    swipeActive.current = el ? el.scrollTop <= 0 : false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null || !swipeActive.current) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    touchDeltaY.current = delta;

    // Only show visual feedback for downward pull (delta > 0)
    if (delta > 0 && sheetContentRef.current) {
      // Prevent the sheet from scrolling while we're pulling down
      e.preventDefault();
      sheetContentRef.current.style.transform = `translateY(${delta}px)`;
    } else {
      // User started scrolling up — cancel the swipe gesture
      swipeActive.current = false;
      if (sheetContentRef.current) {
        sheetContentRef.current.style.transform = "";
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (sheetContentRef.current) {
      sheetContentRef.current.style.transform = "";
    }

    if (swipeActive.current && touchDeltaY.current > 100) {
      onOpenChange(false);
    }

    touchStartY.current = null;
    touchDeltaY.current = 0;
    swipeActive.current = false;
  }, [onOpenChange]);

  // Reset chart settings when sheet closes
  useEffect(() => {
    if (!open) {
      // Reset comparison selections
      setCompareMetricIds([]);
      setCompareMetricsData({});
      setCompareLastYear(false);
      setShowCompareDropdown(false);
      // Reset chart range and visible lines to defaults
      setChartRange("all");
      setVisibleLines({ ma7: true, ma30: true, ma90: true, ma180: true });
      setVisibleGoalTargets({});
      // Keep normalizeComparison at its default (true)
    }
  }, [open]);

  // Fetch available metrics list when sheet opens
  useEffect(() => {
    if (!open) return;

    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/config", { headers });
        if (res.ok) {
          const data = await res.json();
          // Filter to only show numeric-like metrics that can be charted
          const chartableTypes = ["number", "score", "time", "hhmm", "checkbox", "count"];
          const metrics = (data || [])
            .filter((m: { type: string; active: boolean }) =>
              m.active && chartableTypes.includes(m.type)
            )
            .map((m: { metric_id: string; metric_name: string; type: string; group?: string | null }) => ({
              id: m.metric_id,
              name: m.metric_name,
              type: m.type,
              group: m.group ?? null,
            }));
          setAvailableMetrics(metrics);
        }
      } catch (e) {
        console.error("Failed to load metrics for comparison:", e);
      }
    })();
  }, [open]);

  // Fetch stats for comparison metrics
  useEffect(() => {
    if (compareMetricIds.length === 0) {
      setCompareMetricsData({});
      return;
    }

    (async () => {
      const headers = await getAuthHeaders();
      const newData: Record<string, StatsResponse> = {};

      for (const id of compareMetricIds) {
        // Skip if already loaded
        if (compareMetricsData[id]) {
          newData[id] = compareMetricsData[id];
          continue;
        }

        try {
          const res = await fetch(`/api/metrics/${encodeURIComponent(id)}/stats`, { headers });
          if (res.ok) {
            const data = await res.json();
            newData[id] = data;
          }
        } catch (e) {
          console.error(`Failed to load stats for ${id}:`, e);
        }
      }

      setCompareMetricsData(newData);
    })();
  }, [compareMetricIds]);

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

  // Prepare chart data - filter by date range and sample for performance
  const chartData = useMemo(() => {
    if (!stats?.movingAverages) return [];

    let ma = stats.movingAverages;

    // Filter by date range
    if (chartRange !== "all" && ma.length > 0) {
      const lastDate = ma[ma.length - 1].date;
      const [year, month, day] = lastDate.split("-").map(Number);
      const endDate = new Date(year, month - 1, day);

      let daysBack = 30;
      if (chartRange === "90d") daysBack = 90;
      else if (chartRange === "1y") daysBack = 365;

      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - daysBack);
      const startStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;

      ma = ma.filter((d) => d.date >= startStr);
    }

    // If more than 365 points, sample weekly
    if (ma.length > 365) {
      return ma.filter((_, i) => i % 7 === 0 || i === ma.length - 1);
    }
    return ma;
  }, [stats?.movingAverages, chartRange]);

  // Generate year-over-year comparison data
  // Shifts last year's data to align with this year's dates
  const chartDataWithComparison = useMemo(() => {
    if (!compareLastYear || !stats?.movingAverages) return chartData;

    // Build a map of "MM-DD" -> last year's values
    const lastYearMap = new Map<string, { ma7: number | null; ma30: number | null }>();
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;

    for (const d of stats.movingAverages) {
      const year = parseInt(d.date.slice(0, 4), 10);
      if (year === lastYear) {
        const monthDay = d.date.slice(5); // "MM-DD"
        lastYearMap.set(monthDay, { ma7: d.ma7, ma30: d.ma30 });
      }
    }

    // Add last year's data to chart data points
    return chartData.map((d) => {
      const monthDay = d.date.slice(5);
      const lastYearData = lastYearMap.get(monthDay);
      return {
        ...d,
        ma7_ly: lastYearData?.ma7 ?? null,
        ma30_ly: lastYearData?.ma30 ?? null,
      };
    });
  }, [chartData, compareLastYear, stats?.movingAverages]);

  // Merge comparison metrics data into chart
  // Creates a union of all dates from primary and comparison metrics
  const chartDataWithMetricComparison = useMemo(() => {
    if (compareMetricIds.length === 0 || Object.keys(compareMetricsData).length === 0) {
      return chartDataWithComparison;
    }

    // Build maps of date -> ma7 for each comparison metric
    const comparisonMaps: Record<string, Map<string, number | null>> = {};

    for (const [id, data] of Object.entries(compareMetricsData)) {
      const map = new Map<string, number | null>();
      for (const d of data.movingAverages || []) {
        map.set(d.date, d.ma7);
      }
      comparisonMaps[id] = map;
    }

    // Create a union of all dates from primary and comparison metrics
    const allDates = new Set<string>();
    for (const d of chartDataWithComparison) {
      allDates.add(d.date);
    }
    for (const id of compareMetricIds) {
      const map = comparisonMaps[id];
      if (map) {
        for (const date of Array.from(map.keys())) {
          allDates.add(date);
        }
      }
    }

    // Sort dates and filter by current chart range
    const sortedDates = Array.from(allDates).sort();

    // Get date range from primary chart data
    const primaryDates = chartDataWithComparison.map(d => d.date);
    const minDate = primaryDates.length > 0 ? primaryDates[0] : sortedDates[0];
    const maxDate = primaryDates.length > 0 ? primaryDates[primaryDates.length - 1] : sortedDates[sortedDates.length - 1];

    // Filter to chart range
    const filteredDates = sortedDates.filter(d => d >= minDate && d <= maxDate);

    // Build a map of primary metric data for quick lookup
    const primaryDataMap = new Map<string, typeof chartDataWithComparison[0]>();
    for (const d of chartDataWithComparison) {
      primaryDataMap.set(d.date, d);
    }

    // Calculate normalization ranges if enabled
    let primaryMin = Infinity, primaryMax = -Infinity;
    const comparisonRanges: Record<string, { min: number; max: number }> = {};

    if (normalizeComparison) {
      // Find primary metric range from current chart data
      for (const d of chartDataWithComparison) {
        if (d.ma7 != null) {
          primaryMin = Math.min(primaryMin, d.ma7);
          primaryMax = Math.max(primaryMax, d.ma7);
        }
      }

      // Find ranges for each comparison metric - only using dates in the filtered range
      for (const id of compareMetricIds) {
        let min = Infinity, max = -Infinity;
        const map = comparisonMaps[id];
        if (map) {
          for (const date of filteredDates) {
            const v = map.get(date);
            if (v != null) {
              min = Math.min(min, v);
              max = Math.max(max, v);
            }
          }
        }
        comparisonRanges[id] = { min, max };
      }
    }

    // Build merged data with all dates
    return filteredDates.map((date) => {
      // Start with primary data if it exists for this date, otherwise create empty entry
      const primaryData = primaryDataMap.get(date);
      const base = primaryData || {
        date,
        raw: null,
        ma7: null,
        ma30: null,
        ma90: null,
        ma180: null,
      };

      const extras: Record<string, number | null> = {};
      for (const id of compareMetricIds) {
        const map = comparisonMaps[id];
        if (map) {
          let value = map.get(date) ?? null;

          // Normalize if enabled and ranges are valid
          if (normalizeComparison && value != null) {
            const range = comparisonRanges[id];
            const primaryRange = primaryMax - primaryMin;
            const compRange = range.max - range.min;
            if (primaryRange > 0 && compRange > 0) {
              // Scale to primary range
              value = ((value - range.min) / compRange) * primaryRange + primaryMin;
            }
          }

          extras[`compare_${id}`] = value;
        }
      }
      return { ...base, ...extras };
    });
  }, [chartDataWithComparison, compareMetricIds, compareMetricsData, normalizeComparison]);

  // Get comparison metric info for legend
  const comparisonMetricInfo = useMemo(() => {
    return compareMetricIds
      .map((id) => {
        const metric = availableMetrics.find((m) => m.id === id);
        return metric ? { id, name: metric.name, type: metric.type, group: metric.group } : null;
      })
      .filter((m): m is { id: string; name: string; type: string; group: string | null } => m !== null);
  }, [compareMetricIds, availableMetrics]);

  // Group available metrics by their group for the dropdown with separators
  const groupedAvailableMetrics = useMemo(() => {
    const filtered = availableMetrics.filter((m) => m.id !== metricId);

    // Group by the group field
    const groups = new Map<string, typeof filtered>();
    for (const m of filtered) {
      const groupName = m.group || "(ungrouped)";
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(m);
    }

    return groups;
  }, [availableMetrics, metricId]);

  // Colors for comparison metrics
  const comparisonColors = ["#f43f5e", "#14b8a6", "#a855f7"];

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

  // Extract goal targets for chart reference lines
  // Shows goals that have meaningful target values to display on the chart
  const goalTargets = useMemo(() => {
    if (!stats?.goals?.active) return [];

    // Skip checkbox metrics (they use 0-1 scale which doesn't match goal counts)
    if (stats.metric.type === "checkbox") return [];

    const targets: { id: string; name: string; target: number; direction?: string; color: string }[] = [];

    for (const g of stats.goals.active) {
      let targetValue: number | null = null;
      let label = g.name;

      if (g.type === "numeric") {
        // Numeric goals: show the target value (use target_value if available)
        targetValue = g.target_value ?? g.target;
      } else if (g.type === "numeric_threshold") {
        // Threshold goals: show the threshold line (e.g., "score >= 7")
        // target_value contains the threshold
        if (g.target_value != null) {
          targetValue = g.target_value;
          label = `${g.name} (threshold)`;
        }
      } else if (g.type === "hhmm_target" && (stats.metric.type === "hhmm" || stats.metric.type === "time")) {
        // HHMM target goals: show the target time (use target_value which is target_time)
        targetValue = g.target_value ?? g.target;
        label = `${g.name} (target)`;
      }

      if (targetValue !== null) {
        targets.push({
          id: g.goal_id,
          name: label,
          target: targetValue,
          direction: g.direction,
          color: ["#ec4899", "#06b6d4", "#f97316", "#84cc16"][targets.length % 4],
        });
      }
    }

    return targets;
  }, [stats?.goals?.active, stats?.metric.type]);

  // Initialize goal target visibility when goals change
  useEffect(() => {
    if (goalTargets.length > 0) {
      setVisibleGoalTargets((prev) => {
        const next = { ...prev };
        for (const g of goalTargets) {
          if (!(g.id in next)) {
            next[g.id] = true; // Default to visible
          }
        }
        return next;
      });
    }
  }, [goalTargets]);

  // Toggle goal target visibility
  const handleGoalTargetClick = (goalId: string) => {
    setVisibleGoalTargets((prev) => ({
      ...prev,
      [goalId]: !prev[goalId],
    }));
  };

  // Determine if checkbox or count metric (for chart/stats formatting)
  // Use the type from stats response if available (more reliable than prop)
  const effectiveType = stats?.metric?.type ?? metricType;
  const isCheckbox = effectiveType === "checkbox";
  const isCount = effectiveType === "count";
  const showFrequencyStats = isCheckbox || isCount;

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

    // Include current year data
    for (const d of chartData) {
      for (const key of ["ma7", "ma30", "ma90", "ma180"] as const) {
        const v = d[key];
        if (v != null) {
          min = Math.min(min, v);
          max = Math.max(max, v);
        }
      }
    }

    // Include last year data if comparing
    if (compareLastYear) {
      for (const d of chartDataWithComparison) {
        const dTyped = d as { ma7_ly?: number | null; ma30_ly?: number | null };
        if (dTyped.ma7_ly != null) {
          min = Math.min(min, dTyped.ma7_ly);
          max = Math.max(max, dTyped.ma7_ly);
        }
        if (dTyped.ma30_ly != null) {
          min = Math.min(min, dTyped.ma30_ly);
          max = Math.max(max, dTyped.ma30_ly);
        }
      }
    }

    // Include visible goal targets in min/max calculation
    for (const goal of goalTargets) {
      if (visibleGoalTargets[goal.id]) {
        min = Math.min(min, goal.target);
        max = Math.max(max, goal.target);
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
  }, [chartData, chartDataWithComparison, isCheckbox, metricType, goalTargets, visibleGoalTargets, compareLastYear]);

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
        ref={sheetContentRef}
        side={isMobile ? "bottom" : "right"}
        className={
          isMobile
            ? "h-full overflow-y-auto overflow-x-hidden"
            : "w-full sm:max-w-[50vw] overflow-y-auto"
        }
        onTouchStart={isMobile ? handleTouchStart : undefined}
        onTouchMove={isMobile ? handleTouchMove : undefined}
        onTouchEnd={isMobile ? handleTouchEnd : undefined}
      >
        {/* Drag handle — pull down to close when scrolled to the top */}
        {isMobile && (
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        )}
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
                        stats.metric.direction === "decrease"
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
                        stats.metric.direction === "decrease"
                          ? (stats.streaks.current < 0
                              ? "days avoided"
                              : "days slipped")
                          : (stats.streaks.current > 0
                              ? "days in a row"
                              : "days missed")
                      }
                    />
                    <StatItem
                      label={stats.metric.direction === "decrease" ? "Longest Avoided" : "Best Ever"}
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
                      label={stats.metric.direction === "decrease" ? "Worst Slip" : "Worst Dry Spell"}
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

            {/* Goals Section - show if there are any goals */}
            {stats.goals && stats.goals.active && stats.goals.active.length > 0 && (
              <GoalsSection
                goals={stats.goals.active}
                history={stats.goals.history}
                metricType={metricType as "checkbox" | "number" | "time" | "hhmm"}
              />
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

            {/* Time Totals Section - only for time metrics */}
            {stats.numberStats?.timeTotals && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Time Spent</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <StatItem
                      label="This Week"
                      value={formatTimeDuration(stats.numberStats.timeTotals.thisWeek)}
                    />
                    <StatItem
                      label="This Month"
                      value={formatTimeDuration(stats.numberStats.timeTotals.thisMonth)}
                    />
                    <StatItem
                      label="This Year"
                      value={formatTimeDuration(stats.numberStats.timeTotals.thisYear)}
                    />
                    <StatItem
                      label="Lifetime"
                      value={formatTimeDuration(stats.numberStats.timeTotals.lifetime)}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* HHMM Stats Section - for point-in-time metrics like wake/sleep */}
            {stats.numberStats?.hhmmStats && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Time Patterns</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    <StatItem
                      label="Average Time"
                      value={formatTimeOfDay(stats.numberStats.hhmmStats.avgTime)}
                    />
                    <StatItem
                      label="Consistency"
                      value={formatConsistency(stats.numberStats.hhmmStats.stdDev)}
                      subtext={`±${Math.round(stats.numberStats.hhmmStats.stdDev)} min`}
                    />
                    <StatItem
                      label="Earliest"
                      value={stats.numberStats.hhmmStats.earliest ? formatTimeOfDay(stats.numberStats.hhmmStats.earliest.value) : "N/A"}
                      subtext={stats.numberStats.hhmmStats.earliest ? formatDate(stats.numberStats.hhmmStats.earliest.date) : undefined}
                    />
                    <StatItem
                      label="Latest"
                      value={stats.numberStats.hhmmStats.latest ? formatTimeOfDay(stats.numberStats.hhmmStats.latest.value) : "N/A"}
                      subtext={stats.numberStats.hhmmStats.latest ? formatDate(stats.numberStats.hhmmStats.latest.date) : undefined}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Moving Averages Chart */}
            {chartData.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm font-medium">
                      Moving Averages
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      {/* Compare with other metrics dropdown */}
                      <div className="relative">
                        <Button
                          variant={compareMetricIds.length > 0 ? "default" : "outline"}
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => setShowCompareDropdown(!showCompareDropdown)}
                        >
                          Compare {compareMetricIds.length > 0 && `(${compareMetricIds.length})`}
                        </Button>
                        {showCompareDropdown && (
                          <div className={`absolute ${isMobile ? "left-0 right-0" : "right-0"} top-7 z-50 bg-popover border rounded-md shadow-lg p-2 min-w-[200px] max-w-[90vw] max-h-[300px] overflow-y-auto`}>
                            <div className="text-xs font-medium text-muted-foreground mb-2">
                              Select metrics to compare:
                            </div>
                            {Array.from(groupedAvailableMetrics.entries()).map(([groupName, metrics], groupIndex) => (
                              <div key={groupName}>
                                {/* Group separator/header */}
                                {groupIndex > 0 && (
                                  <div className="border-t my-1.5" />
                                )}
                                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1 py-1">
                                  {groupName === "(ungrouped)" ? "Other" : groupName}
                                </div>
                                {/* Metrics in this group */}
                                {metrics.map((m) => (
                                  <label
                                    key={m.id}
                                    className="flex items-center gap-2 py-1 px-1 hover:bg-accent rounded cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={compareMetricIds.includes(m.id)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          if (compareMetricIds.length < 3) {
                                            setCompareMetricIds([...compareMetricIds, m.id]);
                                          }
                                        } else {
                                          setCompareMetricIds(compareMetricIds.filter((id) => id !== m.id));
                                        }
                                      }}
                                      className="h-3 w-3"
                                    />
                                    <span className="text-xs truncate">{m.name}</span>
                                    <span className="text-xs text-muted-foreground">({m.type})</span>
                                  </label>
                                ))}
                              </div>
                            ))}
                            {compareMetricIds.length > 0 && (
                              <div className="border-t mt-2 pt-2">
                                <label className="flex items-center gap-2 py-1 px-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={normalizeComparison}
                                    onChange={(e) => setNormalizeComparison(e.target.checked)}
                                    className="h-3 w-3"
                                  />
                                  <span className="text-xs">Normalize scales</span>
                                </label>
                              </div>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full h-6 text-xs mt-2"
                              onClick={() => setShowCompareDropdown(false)}
                            >
                              Done
                            </Button>
                          </div>
                        )}
                      </div>
                      <Button
                        variant={compareLastYear ? "default" : "outline"}
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setCompareLastYear(!compareLastYear)}
                      >
                        vs Last Year
                      </Button>
                      <div className="flex gap-1">
                        {(["30d", "90d", "1y", "all"] as const).map((range) => (
                          <Button
                            key={range}
                            variant={chartRange === range ? "default" : "ghost"}
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => setChartRange(range)}
                          >
                            {range === "all" ? "All" : range.toUpperCase()}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <div style={{ width: "100%", height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartDataWithMetricComparison}
                        margin={{ top: 20, right: 5, left: -10, bottom: 5 }}
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

                        {/* Goal target reference lines */}
                        {goalTargets.map((goal) =>
                          visibleGoalTargets[goal.id] && (
                            <ReferenceLine
                              key={`goal-${goal.id}`}
                              y={goal.target}
                              stroke={goal.color}
                              strokeDasharray="6 4"
                              strokeWidth={2}
                              label={{
                                value: `${goal.name}: ${yAxisConfig.tickFormatter(goal.target)}`,
                                position: "insideTopRight",
                                fontSize: 10,
                                fill: goal.color,
                              }}
                            />
                          )
                        )}

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
                          content={<ChartTooltip formatter={(e) => {
                            const label = e.name === "ma7" ? "7-day" : e.name === "ma30" ? "30-day" : e.name === "ma90" ? "90-day" : e.name === "ma180" ? "180-day" : e.name;
                            return `${label}: ${yAxisConfig.tooltipFormatter(Number(e.value))}`;
                          }} />}
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
                              <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
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
                                    {compareLastYear && (
                                      <span
                                        className="inline-block w-3 h-0.5 ml-0.5 opacity-40"
                                        style={{
                                          backgroundColor: item.color,
                                          backgroundImage: "repeating-linear-gradient(90deg, transparent, transparent 2px, currentColor 2px, currentColor 4px)",
                                        }}
                                      />
                                    )}
                                  </button>
                                ))}
                                {/* Goal target toggles - shown as dashed lines to match chart */}
                                {goalTargets.map((goal) => (
                                  <button
                                    key={goal.id}
                                    type="button"
                                    onClick={() => handleGoalTargetClick(goal.id)}
                                    className="flex items-center gap-1 hover:opacity-80"
                                    style={{
                                      opacity: visibleGoalTargets[goal.id] ? 1 : 0.4,
                                      textDecoration: visibleGoalTargets[goal.id] ? "none" : "line-through",
                                    }}
                                  >
                                    <svg width="12" height="4" className="inline-block">
                                      <line
                                        x1="0"
                                        y1="2"
                                        x2="12"
                                        y2="2"
                                        stroke={goal.color}
                                        strokeWidth="2"
                                        strokeDasharray="3 2"
                                      />
                                    </svg>
                                    {goal.name}
                                  </button>
                                ))}
                                {/* Comparison metric legend items */}
                                {comparisonMetricInfo.map((metric, idx) => (
                                  <button
                                    key={`legend-compare-${metric.id}`}
                                    type="button"
                                    onClick={() => {
                                      // Remove this metric from comparison
                                      setCompareMetricIds(compareMetricIds.filter(id => id !== metric.id));
                                    }}
                                    className="flex items-center gap-1 hover:opacity-80"
                                    title="Click to remove"
                                  >
                                    <span
                                      className="inline-block w-3 h-0.5"
                                      style={{ backgroundColor: comparisonColors[idx % comparisonColors.length] }}
                                    />
                                    {metric.name}
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

                        {/* Last year comparison lines */}
                        {compareLastYear && (
                          <>
                            <Line
                              type="monotone"
                              dataKey="ma7_ly"
                              name="7-day (LY)"
                              stroke="#3b82f6"
                              strokeOpacity={0.4}
                              strokeDasharray="4 4"
                              dot={false}
                              strokeWidth={2}
                              connectNulls
                              hide={!visibleLines.ma7}
                            />
                            <Line
                              type="monotone"
                              dataKey="ma30_ly"
                              name="30-day (LY)"
                              stroke="#10b981"
                              strokeOpacity={0.4}
                              strokeDasharray="4 4"
                              dot={false}
                              strokeWidth={2}
                              connectNulls
                              hide={!visibleLines.ma30}
                            />
                          </>
                        )}

                        {/* Comparison metric lines */}
                        {comparisonMetricInfo.map((metric, idx) => (
                          <Line
                            key={`compare-${metric.id}`}
                            type="monotone"
                            dataKey={`compare_${metric.id}`}
                            name={metric.name}
                            stroke={comparisonColors[idx % comparisonColors.length]}
                            dot={false}
                            strokeWidth={2}
                            connectNulls
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Statistics - different for checkbox/count vs number metrics */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {showFrequencyStats ? "Frequency Statistics" : "Logging Statistics"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {showFrequencyStats ? (
                  // Checkbox/Count: show frequency stats
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
                  {showFrequencyStats ? "Day of Week Pattern" : "Average by Day of Week"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DayOfWeekBar
                  breakdown={stats.dayOfWeekBreakdown}
                  maxValue={maxDayOfWeek}
                  averages={stats.dayOfWeekAverages}
                  isAverage={!showFrequencyStats}
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
                    {showFrequencyStats ? (
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
                    {showFrequencyStats ? (
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
