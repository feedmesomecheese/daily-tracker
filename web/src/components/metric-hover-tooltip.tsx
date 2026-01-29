"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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

// Format a numeric value based on metric type (handles time/hhmm as HH:MM)
function formatValue(value: number | null | undefined, metricType: string): string {
  if (value == null) return "N/A";

  if (metricType === "time" || metricType === "hhmm") {
    const totalMins = Math.round(value);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `${hrs}:${String(mins).padStart(2, "0")}`;
  }

  return value.toFixed(1);
}

// Format time duration in minutes to a compact human-readable format
function formatDuration(minutes: number): string {
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

  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

type QuickStats = {
  // Common
  metricType: string;
  percent_logged: number;
  isAvoid: boolean; // deprecated, use direction
  direction: "increase" | "decrease" | "neutral";
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

  // Time specific (for duration tracking)
  lifetimeTotal?: number; // in minutes
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
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number; above: boolean } | null>(null);

  // Detect touch device on mount
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window);
  }, []);

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
        isAvoid: data.metric?.isAvoid ?? false, // deprecated
        direction: data.metric?.direction ?? (data.metric?.isAvoid ? "decrease" : "increase"),
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

        // Time specific
        lifetimeTotal: data.numberStats?.timeTotals?.lifetime,
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
      // Calculate tooltip position based on element's screen position
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const positionAbove = spaceBelow < 250;

        setTooltipPosition({
          left: rect.left,
          top: positionAbove ? rect.top : rect.bottom,
          above: positionAbove,
        });
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

  // Click-outside listener for touch devices
  useEffect(() => {
    if (!isTouchDevice || !showTooltip) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        tooltipRef.current && !tooltipRef.current.contains(e.target as Node)
      ) {
        setShowTooltip(false);
      }
    };

    document.addEventListener("click", handleOutsideClick, true);
    return () => document.removeEventListener("click", handleOutsideClick, true);
  }, [isTouchDevice, showTooltip]);

  // Handle tap on touch devices
  const handleTouchClick = useCallback((e: React.MouseEvent) => {
    if (!isTouchDevice) {
      // Desktop: always open full sheet
      onClick();
      return;
    }

    // Touch device: first tap shows tooltip, second tap opens sheet
    if (!showTooltip) {
      e.preventDefault();
      e.stopPropagation();

      // Position and show tooltip
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const positionAbove = spaceBelow < 250;

        setTooltipPosition({
          left: rect.left,
          top: positionAbove ? rect.top : rect.bottom,
          above: positionAbove,
        });
      }
      setShowTooltip(true);
      fetchQuickStats();
    } else {
      // Tooltip is already showing — open the full sheet
      setShowTooltip(false);
      onClick();
    }
  }, [isTouchDevice, showTooltip, onClick, fetchQuickStats]);

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
      onMouseEnter={isTouchDevice ? undefined : handleMouseEnter}
      onMouseLeave={isTouchDevice ? undefined : handleMouseLeave}
    >
      <button
        type="button"
        onClick={handleTouchClick}
        className={cn(
          "hover:text-primary hover:underline underline-offset-2 transition-colors text-left",
          className
        )}
      >
        {children || metricName}
      </button>

      {/* Tooltip - rendered via portal to avoid overflow clipping */}
      {showTooltip && tooltipPosition && createPortal(
        <div
          ref={tooltipRef}
          className={cn(
            "fixed z-[9999]",
            "bg-popover text-popover-foreground",
            "border rounded-md shadow-md",
            "p-3 min-w-[200px]",
            "animate-in fade-in-0 zoom-in-95 duration-100"
          )}
          style={{
            left: tooltipPosition.left,
            top: tooltipPosition.above ? undefined : tooltipPosition.top + 4,
            bottom: tooltipPosition.above ? window.innerHeight - tooltipPosition.top + 4 : undefined,
          }}
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
                        {stats.direction === "decrease"
                          ? (stats.current_streak < 0
                              ? `+${Math.abs(stats.current_streak)}`
                              : stats.current_streak > 0
                              ? `-${stats.current_streak}`
                              : "0")
                          : (stats.current_streak > 0
                              ? `+${stats.current_streak}`
                              : stats.current_streak)}
                      </div>

                      <div className="text-muted-foreground">{stats.direction === "decrease" ? "Longest avoided" : "Best streak"}</div>
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
                      {formatValue(stats.ma7, stats.metricType)}
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
                      {formatValue(stats.ma180, stats.metricType)}
                    </div>

                    <div className="text-muted-foreground">Lifetime avg</div>
                    <div className="font-medium tabular-nums text-right">
                      {formatValue(stats.lifetimeAvg, stats.metricType)}
                    </div>

                    <div className="text-muted-foreground">Logged</div>
                    <div className="font-medium tabular-nums text-right">
                      {stats.percent_logged}%
                    </div>

                    {/* Lifetime total for time metrics */}
                    {stats.lifetimeTotal != null && (
                      <>
                        <div className="text-muted-foreground">Total time</div>
                        <div className="font-medium tabular-nums text-right">
                          {formatDuration(stats.lifetimeTotal)}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {isTouchDevice ? (
                <button
                  type="button"
                  className="w-full text-xs text-primary font-medium pt-1.5 border-t mt-2 text-left"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTooltip(false);
                    onClick();
                  }}
                >
                  View Details &rarr;
                </button>
              ) : (
                <div className="text-[10px] text-muted-foreground pt-1 border-t mt-2">
                  Click for full details
                </div>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
