"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
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
  ReferenceLine,
} from "recharts";
import { ChartTooltip } from "@/components/chart-tooltip";
import { getLocalDateString } from "@/lib/dateUtils";
import BodyMeasurementsSheet, { findNearestPrior } from "@/components/BodyMeasurementsSheet";

type BodyEntry = { date: string; value: number };
type BodyData = { weight: BodyEntry[]; bodyfat: BodyEntry[] };

type SetRow = {
  set_number: number;
  reps: number | null;
  weight: number | null;
  is_pr: boolean;
  is_cycle_max: boolean;
  is_missed: boolean;
  is_move_up: boolean;
};

type SessionData = {
  date: string;
  workout_type_id: string | null;
  tonnage: number;
  topWeight: number;
  topReps: number;
  duration_minutes: number | null;
  distance_miles: number | null;
  intensity: number | null;
  applicableCycleMax: number | null;
};

type StatsResponse = {
  exercise: {
    id: string;
    name: string;
    exercise_type: string;
    group_ids: string[];
    inputType: string;
    linkedNames?: string[];
  };
  frequency: {
    last30d: number;
    last60d: number;
    perWeek30d: number;
    total: number;
  };
  lastSession: {
    date: string;
    sets: SetRow[];
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
  cycleMaxHistory: { weight: number; date: string }[];
  oneRepMax: { weight: number; date: string } | null;
  tonnagePr: { tonnage: number; date: string } | null;
  cardioPr?: {
    distance: { distance: number; date: string } | null;
    pace: { pace: number; distance: number; duration: number; date: string } | null;
  };
  tonnageTrend: "up" | "down" | "flat";
  sessions: SessionData[];
  dayOfWeek: Record<string, number>;
  setPatterns: { pattern: string; count: number }[];
};

type Props = {
  exerciseId: string | null;
  exerciseName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

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

function formatDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

function formatShortDate(d: string) {
  const [, m, day] = d.split("-");
  return `${m}/${day}`;
}

function formatPace(minutesPerMile: number) {
  const mins = Math.floor(minutesPerMile);
  const secs = Math.round((minutesPerMile - mins) * 60);
  return `${mins}:${String(secs).padStart(2, "0")}/mi`;
}

function getHeatmapColor(ratio: number): string {
  if (ratio <= 0.5) {
    const t = ratio * 2;
    const r = Math.round(59 + t * (34 - 59));
    const g = Math.round(130 + t * (197 - 130));
    const b = Math.round(246 + t * (94 - 246));
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const t = (ratio - 0.5) * 2;
    const r = Math.round(34 + t * (249 - 34));
    const g = Math.round(197 + t * (115 - 197));
    const b = Math.round(94 + t * (22 - 94));
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function DayOfWeekBar({ breakdown }: { breakdown: Record<string, number> }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const values = days.map((d) => breakdown[d] || 0);
  const maxVal = Math.max(...values, 1);

  return (
    <div className="flex gap-1 items-end" style={{ height: 70 }}>
      {days.map((day) => {
        const value = breakdown[day] || 0;
        const barHeight = Math.max((value / maxVal) * 48, value > 0 ? 4 : 2);
        const ratio = maxVal > 1 ? value / maxVal : 0.5;

        return (
          <div
            key={day}
            className="flex-1 flex flex-col items-center justify-end gap-0.5"
            style={{ height: 70 }}
          >
            <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
              {value > 0 ? value : ""}
            </span>
            <div
              className="w-full rounded-t transition-all"
              style={{
                height: barHeight,
                backgroundColor: value > 0 ? getHeatmapColor(ratio) : "rgb(100,100,100)",
              }}
            />
            <span className="text-[10px] text-muted-foreground">{day}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ExerciseStatsSheet({
  exerciseId,
  exerciseName,
  open,
  onOpenChange,
}: Props) {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedIdRef = useRef<string | null>(null);
  const [bodyData, setBodyData] = useState<BodyData | null>(null);
  const bodyFetchedRef = useRef(false);
  const [bodySheetOpen, setBodySheetOpen] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!exerciseId || fetchedIdRef.current === exerciseId) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const [statsRes, bodyRes] = await Promise.all([
        fetch(
          `/api/workouts/exercises/${encodeURIComponent(exerciseId)}/stats`,
          { headers }
        ),
        bodyFetchedRef.current
          ? Promise.resolve(null)
          : fetch("/api/metrics/body", { headers }),
      ]);
      if (!statsRes.ok) throw new Error("Failed to load stats");
      const data = await statsRes.json();
      setStats(data);
      fetchedIdRef.current = exerciseId;
      if (bodyRes && bodyRes.ok) {
        const bd = await bodyRes.json();
        setBodyData(bd);
        bodyFetchedRef.current = true;
      }
    } catch {
      setError("Could not load exercise stats");
    } finally {
      setLoading(false);
    }
  }, [exerciseId]);

  useEffect(() => {
    if (open && exerciseId) {
      // Reset if different exercise
      if (fetchedIdRef.current !== exerciseId) {
        setStats(null);
        fetchedIdRef.current = null;
      }
      fetchStats();
    }
  }, [open, exerciseId, fetchStats]);

  const inputType = stats?.exercise?.inputType || "strength";
  const today = getLocalDateString();

  // Date range filter for charts
  const [chartRange, setChartRange] = useState<"6mo" | "1yr" | "2yr" | "all">("all");

  // Filter sessions by date range
  const filteredSessions = useMemo(() => {
    if (!stats?.sessions.length) return [];
    if (chartRange === "all") return stats.sessions;

    const now = new Date();
    const daysBack = { "6mo": 183, "1yr": 365, "2yr": 730 }[chartRange];
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = getLocalDateString(cutoff);

    return stats.sessions.filter((s) => s.date >= cutoffStr);
  }, [stats?.sessions, chartRange]);

  // Helper: convert date string to timestamp for time-proportional charting
  const dateToTs = (d: string) => new Date(d + "T12:00:00").getTime();
  // Recharts may pass ts as string or number, so coerce with Number()
  const tsToShortDate = (ts: string | number) => {
    const d = new Date(Number(ts));
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  // Chart data — time-proportional via timestamps, include date string for tooltips
  const tonnageChartData = useMemo(() =>
    filteredSessions.map((s) => ({
      ts: dateToTs(s.date),
      date: s.date,
      tonnage: s.tonnage,
    })),
  [filteredSessions]);

  const topWeightChartData = useMemo(() =>
    filteredSessions
      .filter((s) => s.topWeight > 0)
      .map((s) => ({
        ts: dateToTs(s.date),
        date: s.date,
        weight: s.topWeight,
      })),
  [filteredSessions]);

  const intensityChartData = useMemo(() =>
    filteredSessions
      .filter((s) => s.intensity !== null)
      .map((s) => ({
        ts: dateToTs(s.date),
        date: s.date,
        intensity: s.intensity,
        topWeight: s.topWeight,
        cycleMax: s.applicableCycleMax,
      })),
  [filteredSessions]);

  const cardioChartData = useMemo(() =>
    filteredSessions.map((s) => ({
      ts: dateToTs(s.date),
      date: s.date,
      distance: s.distance_miles || 0,
      duration: s.duration_minutes || 0,
    })),
  [filteredSessions]);

  // Cycle max chart data (from cycleMaxHistory, filtered by date range)
  const cycleMaxChartData = useMemo(() => {
    if (!stats?.cycleMaxHistory?.length) return [];
    const sorted = [...stats.cycleMaxHistory].sort((a, b) => a.date.localeCompare(b.date));
    if (chartRange === "all") {
      return sorted.map((h) => ({ ts: dateToTs(h.date), date: h.date, weight: h.weight }));
    }
    const now = new Date();
    const daysBack = { "6mo": 183, "1yr": 365, "2yr": 730 }[chartRange];
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = getLocalDateString(cutoff);
    return sorted
      .filter((h) => h.date >= cutoffStr)
      .map((h) => ({ ts: dateToTs(h.date), date: h.date, weight: h.weight }));
  }, [stats?.cycleMaxHistory, chartRange]);

  // Year markers — exact Jan 1 timestamps within the filtered data range
  const yearMarkers = useMemo(() => {
    if (filteredSessions.length < 2) return [];

    const firstDate = filteredSessions[0].date;
    const lastDate = filteredSessions[filteredSessions.length - 1].date;
    const firstYear = parseInt(firstDate.slice(0, 4), 10);
    const lastYear = parseInt(lastDate.slice(0, 4), 10);

    const markers: { ts: number; year: number }[] = [];
    for (let year = firstYear + 1; year <= lastYear; year++) {
      const ts = dateToTs(`${year}-01-01`);
      markers.push({ ts, year });
    }

    return markers;
  }, [filteredSessions]);

  // Best Strength:Weight Ratio — best (topWeight / nearestPriorBW) across all sessions
  const bestStrengthToWeight = useMemo(() => {
    if (!stats?.sessions?.length || !bodyData?.weight?.length) return null;
    let best: { ratio: number; topWeight: number; bw: number; date: string } | null = null;
    for (const s of stats.sessions) {
      if (s.topWeight <= 0) continue;
      const bw = findNearestPrior(bodyData.weight, s.date);
      if (!bw) continue;
      const ratio = s.topWeight / bw;
      if (!best || ratio > best.ratio) {
        best = { ratio, topWeight: s.topWeight, bw, date: s.date };
      }
    }
    return best;
  }, [stats?.sessions, bodyData?.weight]);

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto w-full sm:max-w-[50vw]">
        <SheetHeader>
          <SheetTitle>{exerciseName || "Exercise Stats"}</SheetTitle>
          <SheetDescription>
            {inputType !== "strength" && (
              <Badge variant="secondary" className="text-xs capitalize">
                {inputType}
              </Badge>
            )}
            {stats && (
              <span className="text-xs ml-2">
                {stats.frequency.total} total sessions
              </span>
            )}
            {stats?.exercise.linkedNames && stats.exercise.linkedNames.length > 0 && (
              <span className="text-xs block mt-1 text-muted-foreground">
                Includes: {stats.exercise.linkedNames.join(", ")}
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        {/* Current body reading — clickable */}
        {bodyData && (bodyData.weight.length > 0 || bodyData.bodyfat.length > 0) && (() => {
          const cw = findNearestPrior(bodyData.weight, today);
          const cbf = findNearestPrior(bodyData.bodyfat, today);
          if (cw === null && cbf === null) return null;
          const parts: string[] = [];
          if (cw !== null) parts.push(`${cw} lbs`);
          if (cbf !== null) parts.push(`${cbf}% BF`);
          return (
            <button
              className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
              onClick={() => setBodySheetOpen(true)}
            >
              Current: {parts.join("  ·  ")}
            </button>
          );
        })()}

        {loading && (
          <div className="py-8 text-center text-muted-foreground">
            Loading...
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm mt-4">
            {error}
          </div>
        )}

        {stats && !loading && (
          <div className="space-y-4 mt-4">
            {/* Summary stats cards */}
            <div className="grid grid-cols-3 gap-3">
              <StatItem
                label="Last 30d"
                value={`${stats.frequency.last30d}x`}
                subtext={`${stats.frequency.perWeek30d}/wk`}
              />
              <StatItem
                label="Last 60d"
                value={`${stats.frequency.last60d}x`}
              />
              <StatItem label="All Time" value={`${stats.frequency.total}x`} />
            </div>

            {/* Records (strength) */}
            {inputType === "strength" && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Records</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-xs text-muted-foreground block">1RM</span>
                      {stats.oneRepMax ? (
                        <>
                          <span className="inline-block px-1.5 py-0.5 rounded text-xs border border-amber-600/30 bg-amber-600/10 text-amber-700 font-medium">
                            {stats.oneRepMax.weight} lbs
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            {formatDate(stats.oneRepMax.date)}
                          </span>
                          {bodyData?.weight?.length ? (() => {
                            const bw = findNearestPrior(bodyData.weight, stats.oneRepMax!.date);
                            if (!bw) return null;
                            return (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({(stats.oneRepMax!.weight / bw).toFixed(1)}x BW)
                              </span>
                            );
                          })() : null}
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">{"\u2014"}</span>
                      )}
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">Tonnage PR</span>
                      {stats.tonnagePr ? (
                        <>
                          <span className="inline-block px-1.5 py-0.5 rounded text-xs border border-blue-600/30 bg-blue-600/10 text-blue-700 font-medium">
                            {stats.tonnagePr.tonnage.toLocaleString()} lbs
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            {formatDate(stats.tonnagePr.date)}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">{"\u2014"}</span>
                      )}
                    </div>
                    {stats.pr && (
                      <div>
                        <span className="text-xs text-muted-foreground block">
                          PR (flagged)
                        </span>
                        <span className="inline-block px-1.5 py-0.5 rounded text-xs border border-amber-600/30 bg-amber-600/10 text-amber-700 font-medium">
                          {stats.pr.reps}x{stats.pr.weight}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">
                          {formatDate(stats.pr.date)}
                        </span>
                      </div>
                    )}
                    <div>
                      <span className="text-xs text-muted-foreground block">
                        Current Cycle Max
                      </span>
                      {stats.cycleMax ? (
                        <>
                          <span className="inline-block px-1.5 py-0.5 rounded text-xs border border-emerald-700/30 bg-emerald-700/10 text-emerald-700 font-medium">
                            {stats.cycleMax.weight} lbs
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            {formatDate(stats.cycleMax.date)}
                          </span>
                          {bodyData?.weight?.length ? (() => {
                            const currentBW = bodyData.weight[bodyData.weight.length - 1].value;
                            return (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({(stats.cycleMax!.weight / currentBW).toFixed(1)}x BW)
                              </span>
                            );
                          })() : null}
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">{"\u2014"}</span>
                      )}
                    </div>
                    {/* Best Strength:Weight Ratio */}
                    {bestStrengthToWeight && (
                      <div className="col-span-2">
                        <span className="text-xs text-muted-foreground block">Best S:W Ratio</span>
                        <span className="font-semibold tabular-nums">
                          {bestStrengthToWeight.ratio.toFixed(2)}x BW
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">
                          — {bestStrengthToWeight.topWeight} lbs on {formatDate(bestStrengthToWeight.date)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">
                          (BW: {bestStrengthToWeight.bw} lbs)
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Cardio Records */}
            {inputType === "cardio" && stats.cardioPr && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Records</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="grid grid-cols-2 gap-3">
                    {stats.cardioPr.distance && (
                      <div>
                        <span className="text-xs text-muted-foreground block">
                          Best Distance
                        </span>
                        <span className="font-semibold tabular-nums">
                          {stats.cardioPr.distance.distance} mi
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">
                          {formatDate(stats.cardioPr.distance.date)}
                        </span>
                      </div>
                    )}
                    {stats.cardioPr.pace && (
                      <div>
                        <span className="text-xs text-muted-foreground block">
                          Best Pace
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatPace(stats.cardioPr.pace.pace)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">
                          {formatDate(stats.cardioPr.pace.date)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Date range filter for charts */}
            {(tonnageChartData.length > 1 || cardioChartData.length > 1) && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Chart range</span>
                <div className="flex gap-1">
                  {(["6mo", "1yr", "2yr", "all"] as const).map((range) => (
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
            )}

            {/* Tonnage Chart (strength) */}
            {inputType === "strength" && tonnageChartData.length > 1 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Tonnage Over Time</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={tonnageChartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      {yearMarkers.map((m) => (
                        <ReferenceLine
                          key={`yr-${m.year}`}
                          x={m.ts}
                          stroke="#374151"
                          strokeWidth={2}
                          label={{ value: String(m.year), position: "insideTopRight", fontSize: 11, fill: "#374151", fontWeight: "bold" }}
                        />
                      ))}
                      <XAxis
                        dataKey="ts"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tick={{ fontSize: 10 }}
                        tickCount={5}
                        tickFormatter={tsToShortDate}
                      />
                      <YAxis tick={{ fontSize: 10 }} width={40} />
                      <Tooltip
                        content={<ChartTooltip formatter={(e) => `${Number(e.value).toLocaleString()} lbs`} />}
                      />
                      <Line
                        type="monotone"
                        dataKey="tonnage"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Top Weight Chart (strength - PR progression) */}
            {inputType === "strength" && topWeightChartData.length > 1 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">
                    Top Weight Per Session
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={topWeightChartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      {yearMarkers.map((m) => (
                        <ReferenceLine
                          key={`yr-${m.year}`}
                          x={m.ts}
                          stroke="#374151"
                          strokeWidth={2}
                          label={{ value: String(m.year), position: "insideTopRight", fontSize: 11, fill: "#374151", fontWeight: "bold" }}
                        />
                      ))}
                      <XAxis
                        dataKey="ts"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tick={{ fontSize: 10 }}
                        tickCount={5}
                        tickFormatter={tsToShortDate}
                      />
                      <YAxis tick={{ fontSize: 10 }} width={40} />
                      <Tooltip
                        contentStyle={{ fontSize: 12 }}
                        content={<ChartTooltip formatter={(e) => `${e.value} lbs`} />}
                      />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Intensity Chart (strength with cycle max) */}
            {inputType === "strength" && intensityChartData.length > 1 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">
                    Intensity (% of Cycle Max)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={intensityChartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      {yearMarkers.map((m) => (
                        <ReferenceLine
                          key={`yr-${m.year}`}
                          x={m.ts}
                          stroke="#374151"
                          strokeWidth={2}
                          label={{ value: String(m.year), position: "insideTopRight", fontSize: 11, fill: "#374151", fontWeight: "bold" }}
                        />
                      ))}
                      <XAxis
                        dataKey="ts"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tick={{ fontSize: 10 }}
                        tickCount={5}
                        tickFormatter={tsToShortDate}
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        width={40}
                        domain={[0, 120]}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const data = payload[0]?.payload;
                          return (
                            <div className="bg-background border rounded-lg shadow-lg px-3 py-2 text-sm">
                              {data?.date && (
                                <p className="font-semibold text-foreground mb-1">{formatDate(data.date)}</p>
                              )}
                              <p style={{ color: "#10b981" }}>Intensity: {data?.intensity}%</p>
                              <p className="text-muted-foreground">Top Weight: {data?.topWeight} lbs</p>
                              <p className="text-muted-foreground">Cycle Max: {data?.cycleMax} lbs</p>
                            </div>
                          );
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="intensity"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Cycle Max Chart (strength with cycle max data) */}
            {inputType === "strength" && cycleMaxChartData.length > 1 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">
                    Cycle Max History
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={cycleMaxChartData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      {yearMarkers.map((m) => (
                        <ReferenceLine
                          key={`yr-${m.year}`}
                          x={m.ts}
                          stroke="#374151"
                          strokeWidth={2}
                          label={{ value: String(m.year), position: "insideTopRight", fontSize: 11, fill: "#374151", fontWeight: "bold" }}
                        />
                      ))}
                      <XAxis
                        dataKey="ts"
                        type="number"
                        domain={["dataMin", "dataMax"]}
                        tick={{ fontSize: 10 }}
                        tickCount={5}
                        tickFormatter={tsToShortDate}
                      />
                      <YAxis tick={{ fontSize: 10 }} width={40} />
                      <Tooltip
                        content={<ChartTooltip formatter={(e) => `${e.value} lbs`} />}
                      />
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Cardio Charts */}
            {inputType === "cardio" && cardioChartData.length > 1 && (
              <>
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">
                      Distance Over Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={cardioChartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        {yearMarkers.map((m) => (
                          <ReferenceLine
                            key={`yr-${m.year}`}
                            x={m.ts}
                            stroke="#374151"
                            strokeWidth={2}
                            label={{ value: String(m.year), position: "insideTopRight", fontSize: 11, fill: "#374151", fontWeight: "bold" }}
                          />
                        ))}
                        <XAxis
                          dataKey="ts"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          tick={{ fontSize: 10 }}
                          tickCount={5}
                          tickFormatter={tsToShortDate}
                        />
                        <YAxis tick={{ fontSize: 10 }} width={40} />
                        <Tooltip
                          content={<ChartTooltip formatter={(e) => e.dataKey === "distance" ? `${e.value} mi` : `${e.value} min`} />}
                        />
                        <Line
                          type="monotone"
                          dataKey="distance"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">
                      Duration Over Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={cardioChartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        {yearMarkers.map((m) => (
                          <ReferenceLine
                            key={`yr-${m.year}`}
                            x={m.ts}
                            stroke="#374151"
                            strokeWidth={2}
                            label={{ value: String(m.year), position: "insideTopRight", fontSize: 11, fill: "#374151", fontWeight: "bold" }}
                          />
                        ))}
                        <XAxis
                          dataKey="ts"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          tick={{ fontSize: 10 }}
                          tickCount={5}
                          tickFormatter={tsToShortDate}
                        />
                        <YAxis tick={{ fontSize: 10 }} width={40} />
                        <Tooltip
                          content={<ChartTooltip formatter={(e) => `${e.value} min`} />}
                        />
                        <Line
                          type="monotone"
                          dataKey="duration"
                          stroke="#8b5cf6"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Day of Week */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Day of Week</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <DayOfWeekBar breakdown={stats.dayOfWeek} />
              </CardContent>
            </Card>

            {/* Set Patterns (strength) */}
            {inputType === "strength" && stats.setPatterns.length > 0 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Set Patterns</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="space-y-1.5">
                    {stats.setPatterns.map((p) => (
                      <div
                        key={p.pattern}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="font-medium tabular-nums">
                          {p.pattern}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {p.count}x
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Session History Table */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Session History</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-1.5 px-1 font-medium text-left">
                          Date
                        </th>
                        {inputType === "strength" && (
                          <>
                            <th className="py-1.5 px-1 font-medium text-right">
                              Top Set
                            </th>
                            <th className="py-1.5 px-1 font-medium text-right">
                              Tonnage
                            </th>
                            {intensityChartData.length > 0 && (
                              <th className="py-1.5 px-1 font-medium text-right">
                                Int%
                              </th>
                            )}
                          </>
                        )}
                        {inputType === "cardio" && (
                          <>
                            <th className="py-1.5 px-1 font-medium text-right">
                              Dist
                            </th>
                            <th className="py-1.5 px-1 font-medium text-right">
                              Dur
                            </th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {[...stats.sessions].reverse().map((s, i) => (
                        <tr
                          key={i}
                          className={`border-b last:border-0 ${
                            i % 2 !== 0 ? "bg-muted/20" : ""
                          }`}
                        >
                          <td className="py-1.5 px-1 tabular-nums whitespace-nowrap">
                            {formatDate(s.date)}
                          </td>
                          {inputType === "strength" && (
                            <>
                              <td className="py-1.5 px-1 text-right tabular-nums">
                                {s.topWeight > 0
                                  ? `${s.topReps}x${s.topWeight}`
                                  : "\u2014"}
                              </td>
                              <td className="py-1.5 px-1 text-right tabular-nums text-muted-foreground">
                                {s.tonnage > 0
                                  ? s.tonnage.toLocaleString()
                                  : "\u2014"}
                              </td>
                              {intensityChartData.length > 0 && (
                                <td className="py-1.5 px-1 text-right tabular-nums text-muted-foreground">
                                  {s.intensity !== null
                                    ? `${s.intensity}%`
                                    : "\u2014"}
                                </td>
                              )}
                            </>
                          )}
                          {inputType === "cardio" && (
                            <>
                              <td className="py-1.5 px-1 text-right tabular-nums">
                                {s.distance_miles
                                  ? `${s.distance_miles} mi`
                                  : "\u2014"}
                              </td>
                              <td className="py-1.5 px-1 text-right tabular-nums text-muted-foreground">
                                {s.duration_minutes
                                  ? `${s.duration_minutes} min`
                                  : "\u2014"}
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </SheetContent>
    </Sheet>

    <BodyMeasurementsSheet open={bodySheetOpen} onOpenChange={setBodySheetOpen} />
    </>
  );
}
