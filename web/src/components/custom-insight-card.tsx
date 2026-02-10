"use client";

import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Card, CardContent } from "@/components/ui/card";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { CustomInsightConfig } from "@/types/insights";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DetailData = Record<string, any>;

function formatValue(val: number, metricType?: string): string {
  if (metricType === "time" || metricType === "hhmm") {
    const totalMins = Math.round(val);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `${hrs}:${String(mins).padStart(2, "0")}`;
  }
  return String(Math.round(val * 100) / 100);
}

export function CustomInsightCard({
  config,
  showPrivate,
  onEdit,
  onDelete,
  onClick,
}: {
  config: CustomInsightConfig;
  showPrivate: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClick: () => void;
}) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const headers = await getAuthHeaders();
        const params = new URLSearchParams({
          type: config.chartType,
          metrics: config.metricId,
        });
        if (config.options?.period) {
          params.set("period", config.options.period);
        }
        if (showPrivate) params.set("showPrivate", "true");

        const res = await fetch(`/api/insights/detail?${params}`, { headers });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load");
        if (!cancelled) setData(json);
      } catch {
        // Silently fail for card preview
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [config.metricId, config.chartType, config.options?.period, showPrivate]);

  const displayLabel = config.label || config.metricName;
  const chartTypeLabels: Record<string, string> = {
    trend: "Trend",
    histogram: "Distribution",
    cumulative: "Cumulative",
    day_of_week: "Weekly Pattern",
    candlestick: "Candlestick",
    streak_timeline: "Streaks",
    year_over_year: "Year-over-Year",
    checkbox_numeric: "Habit Impact",
    checkbox_checkbox: "Habit Pair",
    numeric_numeric: "Correlation",
    time_lagged: "Next-Day Effect",
  };
  const chartTypeLabel = chartTypeLabels[config.chartType] || config.chartType;

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{displayLabel}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{chartTypeLabel}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors text-xs px-1"
              title="Edit"
            >
              edit
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors text-sm leading-none px-1"
              title="Delete"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Mini chart */}
        <div className="mt-3" style={{ height: 120 }}>
          {loading ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              Loading...
            </div>
          ) : data ? (
            <MiniChart config={config} data={data} />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              No data
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniChart({ config, data }: { config: CustomInsightConfig; data: DetailData }) {
  switch (config.chartType) {
    case "trend":
      return <MiniTrendChart data={data} />;
    case "histogram":
      return <MiniHistogramChart data={data} />;
    case "cumulative":
      return <MiniCumulativeChart data={data} />;
    case "day_of_week":
      return <MiniDayOfWeekChart data={data} />;
    case "candlestick":
      return <MiniCandlestickChart data={data} />;
    case "streak_timeline":
      return <MiniStreakChart data={data} />;
    case "year_over_year":
      return <MiniYoYChart data={data} />;
    default:
      return <div className="text-xs text-muted-foreground text-center">Preview not available</div>;
  }
}

function MiniTrendChart({ data }: { data: DetailData }) {
  const points = data.points as { date: string; value: number }[] | undefined;
  if (!points || points.length === 0) return null;

  // Sample down to ~60 points for performance
  const step = Math.max(1, Math.floor(points.length / 60));
  const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={sampled} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line type="monotone" dataKey="value" stroke="#3b82f6" dot={false} strokeWidth={1.5} isAnimationActive={false} />
        <ReferenceLine y={data.overallAvg} stroke="#888" strokeDasharray="3 3" />
      </LineChart>
    </ResponsiveContainer>
  );
}

function MiniHistogramChart({ data }: { data: DetailData }) {
  const bins = data.bins as { label: string; count: number }[] | undefined;
  if (!bins || bins.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={bins} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Bar dataKey="count" fill="#3b82f6" fillOpacity={0.7} radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function MiniCumulativeChart({ data }: { data: DetailData }) {
  const points = data.points as { date: string; cumulativeTotal: number }[] | undefined;
  if (!points || points.length === 0) return null;

  const step = Math.max(1, Math.floor(points.length / 60));
  const sampled = points.filter((_, i) => i % step === 0 || i === points.length - 1);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={sampled} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Area type="monotone" dataKey="cumulativeTotal" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function MiniDayOfWeekChart({ data }: { data: DetailData }) {
  const dayAverages = data.dayAverages as { day: string; avg: number }[] | undefined;
  if (!dayAverages) return null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={dayAverages} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <XAxis dataKey="day" tick={{ fontSize: 8 }} tickFormatter={(d) => d.slice(0, 2)} />
        <Bar dataKey="avg" fill="#3b82f6" fillOpacity={0.7} radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function MiniCandlestickChart({ data }: { data: DetailData }) {
  const candles = data.candles as { period: string; open: number; close: number; high: number; low: number }[] | undefined;
  if (!candles || candles.length === 0) return null;

  // Simple bar chart showing close values with color
  const chartData = candles.slice(-12).map((c) => ({
    period: c.period,
    value: c.close,
    color: c.close >= c.open ? "#22c55e" : "#ef4444",
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Bar dataKey="value" isAnimationActive={false} radius={[2, 2, 0, 0]}>
          {chartData.map((entry, i) => (
            <rect key={i} fill={entry.color} fillOpacity={0.7} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function MiniStreakChart({ data }: { data: DetailData }) {
  const stats = data.stats as { currentStreak: number; longestStreak: number; averageStreak: number; activeRate: number } | undefined;
  if (!stats) return null;

  return (
    <div className="h-full flex flex-col items-center justify-center gap-1">
      <div className="flex gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold font-mono">{stats.currentStreak}</p>
          <p className="text-[10px] text-muted-foreground">Current</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold font-mono">{stats.longestStreak}</p>
          <p className="text-[10px] text-muted-foreground">Longest</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold font-mono">{stats.activeRate}%</p>
          <p className="text-[10px] text-muted-foreground">Active</p>
        </div>
      </div>
    </div>
  );
}

function MiniYoYChart({ data }: { data: DetailData }) {
  const years = data.years as { year: number; color: string; avg: number }[] | undefined;
  if (!years || years.length === 0) return null;

  const metricType = data.metricType as string | undefined;

  return (
    <div className="h-full flex flex-col items-center justify-center gap-1">
      {years.map((y) => (
        <div key={y.year} className="flex items-center gap-2 text-sm">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: y.color }} />
          <span className="font-medium">{y.year}</span>
          <span className="font-mono text-muted-foreground">{formatValue(y.avg, metricType)}</span>
        </div>
      ))}
    </div>
  );
}
