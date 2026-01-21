"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { cn } from "@/lib/utils";

// Simple sparkline component
function Sparkline({ values, width = 120, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // Create SVG path
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2; // 2px padding
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(" L ")}`;

  // Determine trend color
  const startAvg = values.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(3, values.length);
  const endAvg = values.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, values.length);
  const strokeColor = endAvg > startAvg ? "#22c55e" : endAvg < startAvg ? "#ef4444" : "#6b7280";

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      <circle
        cx={width}
        cy={height - ((values[values.length - 1] - min) / range) * (height - 4) - 2}
        r={2}
        fill={strokeColor}
      />
    </svg>
  );
}

type QuickStats = {
  // Common
  metricType: string;
  percent_logged: number;
  isAvoid: boolean;
  isCalculated: boolean;
  showStreak: boolean;

  // Checkbox specific
  current_streak: number;
  best_streak: number;
  ytd_count: number;
  avg_per_week: number;

  // Number specific
  lifetimeAvg?: number;
  ma7?: number | null;
  ma180?: number | null;
  trend?: "up" | "down" | "stable" | null;
  recentValues?: { date: string; value: number }[];
};

type MetricHoverTooltipProps = {
  metricId: string;
  metricName: string;
  metricType: string;
  onClick: () => void;
  children?: React.ReactNode;
  className?: string;
  // Delay in ms before showing tooltip (default 300ms)
  hoverDelay?: number;
};

export function MetricHoverTooltip({
  metricId,
  metricName,
  metricType,
  onClick,
  children,
  className,
  hoverDelay = 300,
}: MetricHoverTooltipProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fetchedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [positionAbove, setPositionAbove] = useState(false);

  // Fetch quick stats from the full stats endpoint
  const fetchQuickStats = useCallback(async () => {
    if (fetchedRef.current || metricType === "text") return;

    setLoading(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/metrics/${encodeURIComponent(metricId)}/stats`, {
        headers,
      });

      if (!res.ok) {
        throw new Error("Failed to load stats");
      }

      const data = await res.json();

      // Extract recent values for sparkline from moving averages (last 14 days of ma7)
      const recentMA = data.movingAverages?.slice(-14) ?? [];
      const recentValues = recentMA
        .filter((d: { ma7: number | null }) => d.ma7 !== null)
        .map((d: { date: string; ma7: number }) => ({ date: d.date, value: d.ma7 }));

      // Get current MA values from the most recent entry
      const latestMA = data.movingAverages?.slice(-1)?.[0];

      setStats({
        metricType: data.metric?.type ?? "checkbox",
        percent_logged: data.frequency?.percentLogged ?? 0,
        isAvoid: data.metric?.isAvoid ?? false,
        isCalculated: data.metric?.isCalculated ?? false,
        showStreak: data.metric?.showStreak ?? true,

        // Checkbox
        current_streak: data.streaks?.current ?? 0,
        best_streak: data.streaks?.best?.value ?? 0,
        ytd_count: data.comparisons?.ytd?.count ?? 0,
        avg_per_week: data.frequency?.avgPerWeek ?? 0,

        // Number
        lifetimeAvg: data.numberStats?.lifetimeAvg,
        ma7: latestMA?.ma7 ?? data.numberStats?.periodAverages?.days7,
        ma180: latestMA?.ma180 ?? data.numberStats?.periodAverages?.days180,
        trend: data.numberStats?.trend,
        recentValues,
      });
      fetchedRef.current = true;
    } catch (e) {
      setError("Could not load stats");
    } finally {
      setLoading(false);
    }
  }, [metricId, metricType]);

  // Handle mouse enter with delay
  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);

    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // Set timeout to show tooltip after delay
    hoverTimeoutRef.current = setTimeout(() => {
      // Check if we should position above (if near bottom of screen)
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        // If less than 250px below, position above
        setPositionAbove(spaceBelow < 250);
      }
      setShowTooltip(true);
      fetchQuickStats();
    }, hoverDelay);
  }, [hoverDelay, fetchQuickStats]);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);

    // Clear the timeout if user leaves before delay
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }

    // Hide tooltip
    setShowTooltip(false);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Don't show tooltip for text metrics
  if (metricType === "text") {
    return (
      <span className={className}>
        {children || metricName}
      </span>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "hover:text-primary hover:underline underline-offset-2 transition-colors text-left",
          className
        )}
      >
        {children || metricName}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className={cn(
            "absolute z-50 left-0",
            positionAbove ? "bottom-full mb-1" : "top-full mt-1",
            "bg-popover text-popover-foreground",
            "border rounded-md shadow-md",
            "p-3 min-w-[200px]",
            "animate-in fade-in-0 zoom-in-95 duration-100"
          )}
        >
          {loading && (
            <div className="text-xs text-muted-foreground">Loading...</div>
          )}

          {error && (
            <div className="text-xs text-destructive">{error}</div>
          )}

          {stats && !loading && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground border-b pb-1 mb-2">
                Quick Stats
              </div>

              {stats.metricType === "checkbox" ? (
                // Checkbox metric stats
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {stats.showStreak && (
                    <>
                      <div className="text-muted-foreground">Current streak</div>
                      <div className="font-medium tabular-nums text-right">
                        {stats.isAvoid
                          ? (stats.current_streak < 0
                              ? `+${Math.abs(stats.current_streak)}`
                              : stats.current_streak > 0
                              ? `-${stats.current_streak}`
                              : "0")
                          : (stats.current_streak > 0
                              ? `+${stats.current_streak}`
                              : stats.current_streak)}
                      </div>

                      <div className="text-muted-foreground">{stats.isAvoid ? "Longest avoided" : "Best streak"}</div>
                      <div className="font-medium tabular-nums text-right">
                        {stats.best_streak > 0 ? stats.best_streak : "N/A"}
                      </div>
                    </>
                  )}

                  <div className="text-muted-foreground">Logged</div>
                  <div className="font-medium tabular-nums text-right">
                    {stats.percent_logged}%
                  </div>

                  <div className="text-muted-foreground">YTD count</div>
                  <div className="font-medium tabular-nums text-right">
                    {stats.ytd_count}
                  </div>

                  <div className="text-muted-foreground">Avg/week</div>
                  <div className="font-medium tabular-nums text-right">
                    {stats.avg_per_week}
                  </div>
                </div>
              ) : (
                // Number/time metric stats
                <div className="space-y-2">
                  {/* Sparkline */}
                  {stats.recentValues && stats.recentValues.length > 2 && (
                    <div className="mb-2">
                      <Sparkline values={stats.recentValues.map(v => v.value)} />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div className="text-muted-foreground">7-day avg</div>
                    <div className="font-medium tabular-nums text-right flex items-center justify-end gap-1">
                      {stats.ma7 != null ? stats.ma7.toFixed(1) : "N/A"}
                      {stats.trend && (
                        <span className={cn(
                          "text-[10px]",
                          stats.trend === "up" ? "text-green-500" : stats.trend === "down" ? "text-red-500" : "text-muted-foreground"
                        )}>
                          {stats.trend === "up" ? "↑" : stats.trend === "down" ? "↓" : "→"}
                        </span>
                      )}
                    </div>

                    <div className="text-muted-foreground">180-day avg</div>
                    <div className="font-medium tabular-nums text-right">
                      {stats.ma180 != null ? stats.ma180.toFixed(1) : "N/A"}
                    </div>

                    <div className="text-muted-foreground">Lifetime avg</div>
                    <div className="font-medium tabular-nums text-right">
                      {stats.lifetimeAvg != null ? stats.lifetimeAvg.toFixed(1) : "N/A"}
                    </div>

                    <div className="text-muted-foreground">Logged</div>
                    <div className="font-medium tabular-nums text-right">
                      {stats.percent_logged}%
                    </div>
                  </div>
                </div>
              )}

              <div className="text-[10px] text-muted-foreground pt-1 border-t mt-2">
                Click for full details
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
