"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { getAuthHeaders } from "@/lib/authHeaders";
import { cn } from "@/lib/utils";

// Inline sparkline (matches MetricHoverTooltip pattern)
function Sparkline({
  values,
  width = 120,
  height = 24,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(" L ")}`;

  const startAvg =
    values.slice(0, 3).reduce((a, b) => a + b, 0) /
    Math.min(3, values.length);
  const endAvg =
    values.slice(-3).reduce((a, b) => a + b, 0) /
    Math.min(3, values.length);
  const strokeColor =
    endAvg > startAvg ? "#22c55e" : endAvg < startAvg ? "#ef4444" : "#6b7280";

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
      <circle
        cx={width}
        cy={
          height -
          ((values[values.length - 1] - min) / range) * (height - 4) -
          2
        }
        r={2}
        fill={strokeColor}
      />
    </svg>
  );
}

type ExerciseStats = {
  exercise: {
    id: string;
    name: string;
    exercise_type: string;
    group_ids: string[];
    inputType: string;
  };
  frequency: {
    last30d: number;
    last60d: number;
    perWeek30d: number;
    total: number;
  };
  lastSession: {
    date: string;
    sets: {
      set_number: number;
      reps: number | null;
      weight: number | null;
      is_pr: boolean;
      is_cycle_max: boolean;
      is_missed: boolean;
    }[];
    tonnage: number;
    topWeight: number;
    topReps: number;
    duration_minutes: number | null;
    distance_miles: number | null;
    incline_pct: number | null;
    time_on_seconds: number | null;
    time_off_seconds: number | null;
    cycles: number | null;
    notes: string | null;
  } | null;
  pr: { weight: number; reps: number; date: string } | null;
  cycleMax: { weight: number; date: string } | null;
  cardioPr?: {
    distance: { distance: number; date: string } | null;
    pace: {
      pace: number;
      distance: number;
      duration: number;
      date: string;
    } | null;
  };
  tonnageTrend: "up" | "down" | "flat";
  sessions: {
    date: string;
    tonnage: number;
    topWeight: number;
    topReps: number;
    duration_minutes: number | null;
    distance_miles: number | null;
    intensity: number | null;
  }[];
};

type Props = {
  exerciseId: string;
  exerciseName: string;
  onClick: () => void;
  children?: React.ReactNode;
  className?: string;
  hoverDelay?: number;
};

const TREND_ARROWS: Record<string, string> = {
  up: "\u2191",
  down: "\u2193",
  flat: "\u2192",
};

const TREND_COLORS: Record<string, string> = {
  up: "text-green-500",
  down: "text-red-500",
  flat: "text-muted-foreground",
};

function formatDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y.slice(2)}`;
}

function formatSets(
  sets: ExerciseStats["lastSession"] extends infer T
    ? T extends { sets: infer S }
      ? S
      : never
    : never
) {
  if (!sets || !Array.isArray(sets) || sets.length === 0) return null;
  return sets
    .map(
      (s: { reps: number | null; weight: number | null }) =>
        `${s.reps || 0}x${s.weight || 0}`
    )
    .join(", ");
}

function formatPace(minutesPerMile: number) {
  const mins = Math.floor(minutesPerMile);
  const secs = Math.round((minutesPerMile - mins) * 60);
  return `${mins}:${String(secs).padStart(2, "0")}/mi`;
}

export default function ExerciseHoverTooltip({
  exerciseId,
  exerciseName,
  onClick,
  children,
  className,
  hoverDelay = 300,
}: Props) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [stats, setStats] = useState<ExerciseStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fetchedRef = useRef(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    top: number;
    left: number;
    above: boolean;
  } | null>(null);

  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window);
  }, []);

  const fetchStats = useCallback(async () => {
    if (fetchedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/workouts/exercises/${encodeURIComponent(exerciseId)}/stats`,
        { headers }
      );
      if (!res.ok) throw new Error("Failed to load stats");
      const data = await res.json();
      setStats(data);
      fetchedRef.current = true;
    } catch {
      setError("Could not load stats");
    } finally {
      setLoading(false);
    }
  }, [exerciseId]);

  const positionTooltip = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < 280;
    setTooltipPosition({
      left: Math.min(rect.left, window.innerWidth - 240),
      top: above ? rect.top : rect.bottom,
      above,
    });
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      positionTooltip();
      setShowTooltip(true);
      fetchStats();
    }, hoverDelay);
  }, [hoverDelay, fetchStats, positionTooltip]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setShowTooltip(false);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  // Touch: click-outside to dismiss
  useEffect(() => {
    if (!isTouchDevice || !showTooltip) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("click", handleOutsideClick, true);
    return () =>
      document.removeEventListener("click", handleOutsideClick, true);
  }, [isTouchDevice, showTooltip]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isTouchDevice) {
        onClick();
        return;
      }
      if (!showTooltip) {
        e.preventDefault();
        e.stopPropagation();
        positionTooltip();
        setShowTooltip(true);
        fetchStats();
      } else {
        setShowTooltip(false);
        onClick();
      }
    },
    [isTouchDevice, showTooltip, onClick, fetchStats, positionTooltip]
  );

  const inputType = stats?.exercise?.inputType || "strength";

  // Build sparkline values based on type
  const sparklineValues =
    stats?.sessions
      ?.map((s) => {
        if (inputType === "cardio") return s.distance_miles || s.duration_minutes || 0;
        return s.tonnage;
      })
      .slice(-14) || [];

  // Build intensity sparkline (strength only)
  const intensityValues =
    inputType === "strength"
      ? (stats?.sessions
          ?.map((s) => s.intensity)
          .filter((v): v is number => v !== null)
          .slice(-14) || [])
      : [];

  return (
    <span
      ref={containerRef}
      className="inline-block"
      onMouseEnter={isTouchDevice ? undefined : handleMouseEnter}
      onMouseLeave={isTouchDevice ? undefined : handleMouseLeave}
    >
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "hover:text-primary hover:underline underline-offset-2 transition-colors text-left",
          className
        )}
      >
        {children || exerciseName}
      </button>

      {showTooltip &&
        tooltipPosition &&
        createPortal(
          <div
            ref={tooltipRef}
            className={cn(
              "fixed z-[9999]",
              "bg-popover text-popover-foreground",
              "border rounded-md shadow-md",
              "p-3 min-w-[220px] max-w-[280px]",
              "animate-in fade-in-0 zoom-in-95 duration-100"
            )}
            style={{
              left: tooltipPosition.left,
              top: tooltipPosition.above
                ? undefined
                : tooltipPosition.top + 4,
              bottom: tooltipPosition.above
                ? window.innerHeight - tooltipPosition.top + 4
                : undefined,
            }}
          >
            {loading && (
              <div className="text-xs text-muted-foreground">Loading...</div>
            )}

            {error && <div className="text-xs text-destructive">{error}</div>}

            {stats && !loading && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground border-b pb-1 mb-2">
                  Quick Stats
                </div>

                {/* Tonnage/Volume sparkline */}
                {sparklineValues.length > 2 && (
                  <div className="mb-2">
                    <div className="text-[10px] text-muted-foreground mb-0.5">
                      {inputType === "cardio" ? "Distance/Duration" : "Tonnage"}
                    </div>
                    <Sparkline values={sparklineValues} />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {/* Frequency */}
                  <div className="text-muted-foreground">Frequency</div>
                  <div className="font-medium tabular-nums text-right">
                    {stats.frequency.last30d}x / 30d
                  </div>

                  <div className="text-muted-foreground">Avg/week</div>
                  <div className="font-medium tabular-nums text-right">
                    {stats.frequency.perWeek30d}/wk
                  </div>

                  {/* Last session - type-specific */}
                  {stats.lastSession && (
                    <>
                      <div className="text-muted-foreground">Last</div>
                      <div className="font-medium tabular-nums text-right">
                        {formatDate(stats.lastSession.date)}
                      </div>

                      {inputType === "strength" &&
                        stats.lastSession.sets.length > 0 && (
                          <>
                            <div className="text-muted-foreground">Sets</div>
                            <div className="font-medium tabular-nums text-right text-[11px] leading-tight">
                              {formatSets(stats.lastSession.sets)}
                            </div>
                          </>
                        )}

                      {inputType === "cardio" && (
                        <>
                          {stats.lastSession.duration_minutes && (
                            <>
                              <div className="text-muted-foreground">Duration</div>
                              <div className="font-medium tabular-nums text-right">
                                {stats.lastSession.duration_minutes} min
                              </div>
                            </>
                          )}
                          {stats.lastSession.distance_miles && (
                            <>
                              <div className="text-muted-foreground">Distance</div>
                              <div className="font-medium tabular-nums text-right">
                                {stats.lastSession.distance_miles} mi
                              </div>
                            </>
                          )}
                        </>
                      )}

                      {inputType === "hiit" && (
                        <>
                          {stats.lastSession.cycles && (
                            <>
                              <div className="text-muted-foreground">Cycles</div>
                              <div className="font-medium tabular-nums text-right">
                                {stats.lastSession.cycles}
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}

                  {/* PR (strength) */}
                  {inputType === "strength" && stats.pr && (
                    <>
                      <div className="text-muted-foreground">PR</div>
                      <div className="font-medium tabular-nums text-right">
                        <span className="inline-block px-1 py-0.5 rounded text-[10px] border border-amber-600/30 bg-amber-600/10 text-amber-700">
                          {stats.pr.reps}x{stats.pr.weight}
                        </span>{" "}
                        <span className="text-[10px] text-muted-foreground">
                          {formatDate(stats.pr.date)}
                        </span>
                      </div>
                    </>
                  )}

                  {/* Cycle Max (strength) */}
                  {inputType === "strength" && stats.cycleMax && (
                    <>
                      <div className="text-muted-foreground">Cycle Max</div>
                      <div className="font-medium tabular-nums text-right">
                        <span className="inline-block px-1 py-0.5 rounded text-[10px] border border-emerald-700/30 bg-emerald-700/10 text-emerald-700">
                          {stats.cycleMax.weight} lbs
                        </span>{" "}
                        <span className="text-[10px] text-muted-foreground">
                          {formatDate(stats.cycleMax.date)}
                        </span>
                      </div>
                    </>
                  )}

                  {/* Cardio PRs */}
                  {inputType === "cardio" && stats.cardioPr?.distance && (
                    <>
                      <div className="text-muted-foreground">Best Distance</div>
                      <div className="font-medium tabular-nums text-right">
                        {stats.cardioPr.distance.distance} mi
                      </div>
                    </>
                  )}
                  {inputType === "cardio" && stats.cardioPr?.pace && (
                    <>
                      <div className="text-muted-foreground">Best Pace</div>
                      <div className="font-medium tabular-nums text-right">
                        {formatPace(stats.cardioPr.pace.pace)}
                      </div>
                    </>
                  )}

                  {/* Tonnage trend (strength) */}
                  {inputType === "strength" && stats.sessions.length >= 4 && (
                    <>
                      <div className="text-muted-foreground">Tonnage Trend</div>
                      <div className="font-medium text-right flex items-center justify-end gap-1">
                        <span
                          className={cn(
                            "text-sm",
                            TREND_COLORS[stats.tonnageTrend]
                          )}
                        >
                          {TREND_ARROWS[stats.tonnageTrend]}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Intensity sparkline (strength with cycle max) */}
                {inputType === "strength" && intensityValues.length > 2 && (
                  <div className="pt-1 border-t mt-1">
                    <div className="text-[10px] text-muted-foreground mb-0.5">
                      Intensity (% of Cycle Max)
                    </div>
                    <Sparkline values={intensityValues} />
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
    </span>
  );
}
