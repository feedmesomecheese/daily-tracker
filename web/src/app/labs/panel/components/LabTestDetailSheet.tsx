"use client";

import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, ReferenceLine,
} from "recharts";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PanelTest, HistoryEntry } from "../page";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function formatDateShort(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short", year: "numeric", timeZone: "UTC",
  });
}

function isoToTs(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

type Direction = "high" | "low" | "normal" | "no-range";

function getDirection(value: number, refLow: number | null, refHigh: number | null, inRange: boolean | null): Direction {
  if (inRange === true) return "normal";
  if (inRange === false) {
    if (refHigh != null && value > refHigh) return "high";
    if (refLow != null && value < refLow) return "low";
    return "high"; // fallback when in_range=false but no bounds to compare
  }
  return "no-range";
}

const DIRECTION_LABEL: Record<Direction, string> = {
  high: "↑ High",
  low: "↓ Low",
  normal: "Normal",
  "no-range": "No range",
};

// Tailwind classes per direction — matches the workouts module badge pattern
const DIRECTION_BADGE: Record<Direction, string> = {
  high: "border border-red-700/40 bg-red-700/10 text-red-700 dark:border-red-400/40 dark:bg-red-400/10 dark:text-red-400",
  low: "border border-blue-700/40 bg-blue-700/10 text-blue-700 dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-400",
  normal: "border border-green-700/40 bg-green-700/10 text-green-700 dark:border-green-400/40 dark:bg-green-400/10 dark:text-green-400",
  "no-range": "border border-border bg-muted/50 text-muted-foreground",
};

const DIRECTION_VALUE_COLOR: Record<Direction, string> = {
  high: "text-red-600 dark:text-red-400",
  low: "text-blue-600 dark:text-blue-400",
  normal: "text-green-600 dark:text-green-400",
  "no-range": "text-foreground",
};

const DIRECTION_DOT_COLOR: Record<Direction, string> = {
  high: "#dc2626",   // red-600
  low: "#2563eb",    // blue-600
  normal: "#16a34a", // green-600
  "no-range": "#94a3b8",
};

// ── Reference range bar ───────────────────────────────────────────────────────

function RangeBar({ value, refLow, refHigh }: { value: number; refLow: number | null; refHigh: number | null }) {
  if (refLow == null && refHigh == null) return null;

  let viewMin: number, viewMax: number, greenStart: number, greenEnd: number;

  if (refLow != null && refHigh != null) {
    const range = Math.max(refHigh - refLow, 0.001);
    const buffer = range * 0.4;
    viewMin = refLow - buffer;
    viewMax = refHigh + buffer;
    greenStart = (refLow - viewMin) / (viewMax - viewMin);
    greenEnd = (refHigh - viewMin) / (viewMax - viewMin);
  } else if (refLow != null) {
    const buffer = Math.max(Math.abs(refLow) * 0.4, refLow * 0.1 + 5);
    viewMin = refLow - buffer;
    viewMax = refLow + buffer * 2.5;
    greenStart = (refLow - viewMin) / (viewMax - viewMin);
    greenEnd = 1;
  } else {
    const refH = refHigh!;
    const buffer = Math.max(Math.abs(refH) * 0.4, refH * 0.1 + 5);
    viewMin = refH - buffer * 2.5;
    viewMax = refH + buffer;
    greenStart = 0;
    greenEnd = (refH - viewMin) / (viewMax - viewMin);
  }

  const viewSpan = viewMax - viewMin;
  const inRange = (refLow == null || value >= refLow) && (refHigh == null || value <= refHigh);
  const dotPct = Math.min(Math.max(((value - viewMin) / viewSpan) * 100, 1), 99);

  const direction = getDirection(value, refLow, refHigh, inRange ? true : inRange === false ? false : null);
  const dotBg = DIRECTION_DOT_COLOR[direction];

  return (
    <div className="relative h-4 my-1">
      <div className="absolute inset-0 rounded-full overflow-hidden bg-red-200 dark:bg-red-900/60">
        <div
          className="absolute inset-y-0 bg-green-200 dark:bg-green-900/60"
          style={{ left: `${greenStart * 100}%`, width: `${(greenEnd - greenStart) * 100}%` }}
        />
      </div>
      {refLow != null && (
        <div
          className="absolute inset-y-0 w-px bg-green-600/70"
          style={{ left: `${((refLow - viewMin) / viewSpan) * 100}%` }}
        />
      )}
      {refHigh != null && (
        <div
          className="absolute inset-y-0 w-px bg-green-600/70"
          style={{ left: `${((refHigh - viewMin) / viewSpan) * 100}%` }}
        />
      )}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-5 w-5 rounded-full border-2 border-background shadow-sm z-10"
        style={{ left: `${dotPct}%`, backgroundColor: dotBg }}
      />
    </div>
  );
}

function RangeBarLabels({ refLow, refHigh, unit }: { refLow: number | null; refHigh: number | null; unit: string | null }) {
  const refDisplay =
    refLow != null && refHigh != null ? `${refLow} – ${refHigh}${unit ? ` ${unit}` : ""}` :
    refLow != null ? `≥ ${refLow}${unit ? ` ${unit}` : ""}` :
    refHigh != null ? `≤ ${refHigh}${unit ? ` ${unit}` : ""}` : "";

  if (!refDisplay) return null;

  return (
    <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
      <span>Reference range</span>
      <span className="font-medium">{refDisplay}</span>
    </div>
  );
}

// ── Custom chart dot ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ColoredDot(props: any) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const dir = getDirection(payload.value, payload.ref_low, payload.ref_high, payload.in_range);
  return <circle cx={cx} cy={cy} r={4} fill={DIRECTION_DOT_COLOR[dir]} stroke="var(--background)" strokeWidth={1.5} />;
}

// ── Stat item ────────────────────────────────────────────────────────────────

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </div>
  );
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltipContent({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { visit_date: string; value: number; unit: string | null; in_range: boolean | null; ref_low: number | null; ref_high: number | null };
  const dir = getDirection(d.value, d.ref_low, d.ref_high, d.in_range);
  return (
    <div className="bg-background border rounded-lg shadow-lg px-3 py-2 text-xs space-y-0.5">
      <div className="font-medium text-foreground">{formatDate(d.visit_date)}</div>
      <div className={cn("font-mono font-semibold text-sm", DIRECTION_VALUE_COLOR[dir])}>
        {d.value}{d.unit ? ` ${d.unit}` : ""}
      </div>
      {(d.ref_low != null || d.ref_high != null) && (
        <div className="text-muted-foreground">
          Range:{" "}
          {d.ref_low != null && d.ref_high != null ? `${d.ref_low} – ${d.ref_high}` :
           d.ref_low != null ? `≥ ${d.ref_low}` : `≤ ${d.ref_high}`}
        </div>
      )}
      <div className={DIRECTION_VALUE_COLOR[dir]}>{DIRECTION_LABEL[dir]}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type DateRange = "1y" | "2y" | "5y" | "all";

interface Props {
  test: PanelTest | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function LabTestDetailSheet({ test, open, onOpenChange }: Props) {
  const [dateRange, setDateRange] = useState<DateRange>("all");

  const filteredHistory = useMemo(() => {
    if (!test) return [];
    const history = [...test.history].sort((a, b) => a.visit_date.localeCompare(b.visit_date));
    if (dateRange === "all") return history;
    const cutoff = new Date();
    if (dateRange === "1y") cutoff.setFullYear(cutoff.getFullYear() - 1);
    else if (dateRange === "2y") cutoff.setFullYear(cutoff.getFullYear() - 2);
    else if (dateRange === "5y") cutoff.setFullYear(cutoff.getFullYear() - 5);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return history.filter((h) => h.visit_date >= cutoffStr);
  }, [test, dateRange]);

  const chartData = useMemo(() =>
    filteredHistory.map((h) => ({ ...h, ts: isoToTs(h.visit_date), unit: test?.unit ?? null })),
  [filteredHistory, test]);

  const latestWithRange = useMemo(() => {
    if (!test) return null;
    return [...test.history]
      .sort((a, b) => b.visit_date.localeCompare(a.visit_date))
      .find((h) => h.ref_low != null || h.ref_high != null) ?? null;
  }, [test]);

  const stats = useMemo(() => {
    if (!test || test.history.length === 0) return null;
    const values = test.history.map((h) => h.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return { min, max, avg };
  }, [test]);

  const yearMarkers = useMemo(() => {
    if (chartData.length < 2) return [];
    const minTs = chartData[0].ts;
    const maxTs = chartData[chartData.length - 1].ts;
    const minYear = new Date(minTs).getUTCFullYear() + 1;
    const maxYear = new Date(maxTs).getUTCFullYear();
    const markers = [];
    for (let y = minYear; y <= maxYear; y++) {
      const ts = Date.UTC(y, 0, 1);
      if (ts > minTs && ts < maxTs) markers.push(ts);
    }
    return markers;
  }, [chartData]);

  const yDomain = useMemo((): [number, number] | ["auto", "auto"] => {
    if (chartData.length === 0) return ["auto", "auto"];
    const values = chartData.map((d) => d.value);
    const rLow = latestWithRange?.ref_low;
    const rHigh = latestWithRange?.ref_high;
    const allVals = [...values, ...(rLow != null ? [rLow] : []), ...(rHigh != null ? [rHigh] : [])];
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const pad = (max - min) * 0.15 || 1;
    return [Math.max(0, min - pad), max + pad];
  }, [chartData, latestWithRange]);

  if (!test) return null;

  const latest = test.latest;
  const latestDir: Direction = latest
    ? getDirection(latest.value, latestWithRange?.ref_low ?? latest.ref_low, latestWithRange?.ref_high ?? latest.ref_high, latest.in_range)
    : "no-range";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-hidden flex flex-col" storageKey="lab_test_detail_sheet_width" defaultWidth={720}>
        <SheetHeader className="pb-4 border-b pr-8 flex-shrink-0">
          <SheetTitle className="flex items-center gap-2 flex-wrap leading-tight">
            {test.display_name}
            <Badge variant="secondary" className="text-xs font-normal">{test.category}</Badge>
          </SheetTitle>
          <SheetDescription>
            {test.canonical_name !== test.display_name
              ? `Canonical: ${test.canonical_name}`
              : `${test.visit_count} draw${test.visit_count !== 1 ? "s" : ""}${test.last_tested ? ` · last tested ${formatDate(test.last_tested)}` : ""}`
            }
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1">

          {/* ── Current value + range bar ─────────────────────────── */}
          {latest && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  Latest Result
                  <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", DIRECTION_BADGE[latestDir])}>
                    {DIRECTION_LABEL[latestDir]}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-4xl font-bold font-mono tabular-nums", DIRECTION_VALUE_COLOR[latestDir])}>
                    {latest.value}
                  </span>
                  {test.unit && <span className="text-base text-muted-foreground">{test.unit}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDate(test.last_tested!)}
                  </span>
                </div>

                {(latestWithRange?.ref_low != null || latestWithRange?.ref_high != null) && (
                  <>
                    <RangeBar value={latest.value} refLow={latestWithRange?.ref_low ?? null} refHigh={latestWithRange?.ref_high ?? null} />
                    <RangeBarLabels refLow={latestWithRange?.ref_low ?? null} refHigh={latestWithRange?.ref_high ?? null} unit={test.unit} />
                  </>
                )}
                {latestWithRange?.ref_text && !latestWithRange.ref_low && !latestWithRange.ref_high && (
                  <div className="text-xs text-muted-foreground">Reference: {latestWithRange.ref_text}</div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Stats strip ──────────────────────────────────────────── */}
          {stats && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Statistics
                  {test.times_out_of_range > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {test.times_out_of_range} of {test.visit_count} abnormal
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  <StatItem label="Min" value={`${stats.min}${test.unit ? ` ${test.unit}` : ""}`} />
                  <StatItem label="Max" value={`${stats.max}${test.unit ? ` ${test.unit}` : ""}`} />
                  <StatItem label="Avg" value={`${stats.avg.toFixed(1)}${test.unit ? ` ${test.unit}` : ""}`} />
                  <StatItem label="Draws" value={test.visit_count} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── History chart ─────────────────────────────────────────── */}
          {test.visit_count >= 2 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <span>History</span>
                  <div className="flex gap-1">
                    {(["1y", "2y", "5y", "all"] as DateRange[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => setDateRange(r)}
                        className={cn(
                          "px-2 py-0.5 text-xs rounded font-medium transition-colors",
                          dateRange === r
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {r === "all" ? "All" : r.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length < 2 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Not enough data in this date range.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                      <XAxis
                        dataKey="ts"
                        type="number"
                        scale="time"
                        domain={["dataMin", "dataMax"]}
                        tickFormatter={(ts) => formatDateShort(new Date(ts).toISOString().slice(0, 10))}
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                      />
                      <YAxis
                        domain={yDomain}
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                      />
                      <Tooltip content={<ChartTooltipContent />} />

                      {latestWithRange?.ref_low != null && latestWithRange?.ref_high != null && (
                        <ReferenceArea
                          y1={latestWithRange.ref_low}
                          y2={latestWithRange.ref_high}
                          fill="#16a34a"
                          fillOpacity={0.12}
                          strokeOpacity={0}
                        />
                      )}
                      {latestWithRange?.ref_low != null && latestWithRange?.ref_high == null && (
                        <ReferenceLine y={latestWithRange.ref_low} stroke="#22c55e" strokeDasharray="4 2" strokeOpacity={0.6}
                          label={{ value: `≥ ${latestWithRange.ref_low}`, position: "insideTopLeft", fontSize: 10, fill: "#22c55e" }} />
                      )}
                      {latestWithRange?.ref_high != null && latestWithRange?.ref_low == null && (
                        <ReferenceLine y={latestWithRange.ref_high} stroke="#22c55e" strokeDasharray="4 2" strokeOpacity={0.6}
                          label={{ value: `≤ ${latestWithRange.ref_high}`, position: "insideTopLeft", fontSize: 10, fill: "#22c55e" }} />
                      )}

                      {yearMarkers.map((ts) => (
                        <ReferenceLine key={ts} x={ts} stroke="var(--border)" strokeDasharray="2 2"
                          label={{ value: new Date(ts).getUTCFullYear(), position: "insideTopRight", fontSize: 9, fill: "var(--muted-foreground)" }} />
                      ))}

                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={<ColoredDot />}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}

                {test.trend !== "insufficient_data" && (
                  <div className="mt-2 text-xs text-muted-foreground text-center">
                    {{up: "↑ Trending up", down: "↓ Trending down", stable: "→ Stable", insufficient_data: ""}[test.trend]}{" "}
                    (comparing last two results)
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Visit history table ────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">All Results</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Value</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Reference</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...test.history]
                    .sort((a, b) => b.visit_date.localeCompare(a.visit_date))
                    .map((h: HistoryEntry, i) => {
                      const dir = getDirection(h.value, h.ref_low, h.ref_high, h.in_range);
                      const refDisplay = h.ref_text ?? (
                        h.ref_low != null && h.ref_high != null ? `${h.ref_low} – ${h.ref_high}` :
                        h.ref_low != null ? `≥ ${h.ref_low}` :
                        h.ref_high != null ? `≤ ${h.ref_high}` : "—"
                      );
                      return (
                        <tr key={i} className={cn(
                          "border-b last:border-0",
                          dir === "high" && "bg-red-500/5",
                          dir === "low" && "bg-blue-500/5",
                        )}>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(h.visit_date)}</td>
                          <td className={cn("px-3 py-2 text-right font-mono font-semibold tabular-nums", DIRECTION_VALUE_COLOR[dir])}>
                            {h.value}{test.unit ? ` ${test.unit}` : ""}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground hidden sm:table-cell">
                            {refDisplay}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {dir !== "normal" && dir !== "no-range" ? (
                              <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", DIRECTION_BADGE[dir])}>
                                {DIRECTION_LABEL[dir]}
                              </span>
                            ) : dir === "normal" ? (
                              <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </CardContent>
          </Card>

        </div>
      </SheetContent>
    </Sheet>
  );
}
