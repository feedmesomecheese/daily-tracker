"use client";

import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, ReferenceLine,
} from "recharts";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
    // >= refLow — green on right
    const buffer = Math.max(Math.abs(refLow) * 0.4, refLow * 0.1 + 5);
    viewMin = refLow - buffer;
    viewMax = refLow + buffer * 2.5;
    greenStart = (refLow - viewMin) / (viewMax - viewMin);
    greenEnd = 1;
  } else {
    // <= refHigh — green on left
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

  return (
    <div className="relative h-4 my-1">
      {/* Bar with zones */}
      <div className="absolute inset-0 rounded-full overflow-hidden bg-red-200/60 dark:bg-red-900/30">
        <div
          className="absolute inset-y-0 bg-green-200/80 dark:bg-green-900/40"
          style={{ left: `${greenStart * 100}%`, width: `${(greenEnd - greenStart) * 100}%` }}
        />
      </div>
      {/* Threshold lines */}
      {refLow != null && (
        <div
          className="absolute inset-y-0 w-px bg-green-600/40 dark:bg-green-400/40"
          style={{ left: `${((refLow - viewMin) / viewSpan) * 100}%` }}
        />
      )}
      {refHigh != null && (
        <div
          className="absolute inset-y-0 w-px bg-green-600/40 dark:bg-green-400/40"
          style={{ left: `${((refHigh - viewMin) / viewSpan) * 100}%` }}
        />
      )}
      {/* Value dot */}
      <div
        className={cn(
          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-5 w-5 rounded-full border-2 border-background shadow-sm z-10",
          inRange ? "bg-green-500" : "bg-red-500"
        )}
        style={{ left: `${dotPct}%` }}
      />
    </div>
  );
}

// ── Range bar labels ─────────────────────────────────────────────────────────

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
  const color = payload.in_range === false ? "#ef4444" : payload.in_range === true ? "#22c55e" : "#94a3b8";
  return <circle cx={cx} cy={cy} r={4} fill={color} stroke="var(--background)" strokeWidth={1.5} />;
}

// ── Stat item ────────────────────────────────────────────────────────────────

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltipContent({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { visit_date: string; value: number; unit: string | null; in_range: boolean | null; ref_low: number | null; ref_high: number | null };
  const statusColor = d.in_range === false ? "text-red-600" : d.in_range === true ? "text-green-600" : "text-muted-foreground";
  return (
    <div className="bg-background border rounded-lg shadow-lg px-3 py-2 text-xs space-y-0.5">
      <div className="font-medium text-foreground">{formatDate(d.visit_date)}</div>
      <div className={cn("font-mono font-semibold text-sm", statusColor)}>
        {d.value}{d.unit ? ` ${d.unit}` : ""}
      </div>
      {(d.ref_low != null || d.ref_high != null) && (
        <div className="text-muted-foreground">
          Range:{" "}
          {d.ref_low != null && d.ref_high != null ? `${d.ref_low} – ${d.ref_high}` :
           d.ref_low != null ? `≥ ${d.ref_low}` : `≤ ${d.ref_high}`}
        </div>
      )}
      <div className={statusColor}>
        {d.in_range === false ? "Abnormal" : d.in_range === true ? "Normal" : "No range data"}
      </div>
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

  // Reference range from latest entry that has one
  const latestWithRange = useMemo(() => {
    if (!test) return null;
    return [...test.history]
      .sort((a, b) => b.visit_date.localeCompare(a.visit_date))
      .find((h) => h.ref_low != null || h.ref_high != null) ?? null;
  }, [test]);

  // Stats
  const stats = useMemo(() => {
    if (!test || test.history.length === 0) return null;
    const values = test.history.map((h) => h.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return { min, max, avg };
  }, [test]);

  // Year markers for chart
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

  // Y-axis domain with padding
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
  const trendLabel: Record<string, string> = { up: "↑ Trending up", down: "↓ Trending down", stable: "→ Stable", insufficient_data: "—" };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-hidden flex flex-col" storageKey="lab_test_detail_sheet_width" defaultWidth={720}>
        <SheetHeader className="flex-shrink-0 pr-8">
          <div className="flex items-start gap-2 flex-wrap">
            <SheetTitle className="leading-tight">{test.display_name}</SheetTitle>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-1">{test.category}</span>
          </div>
          {test.canonical_name !== test.display_name && (
            <div className="text-xs text-muted-foreground">Canonical: {test.canonical_name}</div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-5 pr-1">

          {/* ── Current value + range bar ─────────────────────────── */}
          {latest && (
            <div className="rounded-lg border bg-card px-4 py-3 space-y-2">
              <div className="flex items-baseline gap-2">
                <span className={cn(
                  "text-3xl font-bold font-mono tabular-nums",
                  latest.in_range === false ? "text-red-600" : latest.in_range === true ? "text-green-600" : "text-foreground"
                )}>
                  {latest.value}
                </span>
                {test.unit && <span className="text-base text-muted-foreground">{test.unit}</span>}
                <span className={cn(
                  "ml-auto text-sm font-medium",
                  latest.in_range === false ? "text-red-600" : latest.in_range === true ? "text-green-600" : "text-muted-foreground"
                )}>
                  {latest.in_range === false ? "Abnormal" : latest.in_range === true ? "Normal" : "No range"}
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

              <div className="text-xs text-muted-foreground pt-0.5">
                Last tested {formatDate(test.last_tested!)}
              </div>
            </div>
          )}

          {/* ── Stats strip ──────────────────────────────────────────── */}
          {stats && (
            <div className="grid grid-cols-5 gap-2 rounded-lg border bg-card px-4 py-3">
              <StatItem label="Min" value={`${stats.min}${test.unit ? ` ${test.unit}` : ""}`} />
              <StatItem label="Max" value={`${stats.max}${test.unit ? ` ${test.unit}` : ""}`} />
              <StatItem label="Avg" value={`${stats.avg.toFixed(1)}${test.unit ? ` ${test.unit}` : ""}`} />
              <StatItem label="Draws" value={test.visit_count} />
              <StatItem
                label="Abnormal"
                value={test.times_out_of_range === 0 ? "0" : `${test.times_out_of_range}/${test.visit_count}`}
              />
            </div>
          )}

          {/* ── History chart ─────────────────────────────────────────── */}
          {test.visit_count >= 2 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">History</span>
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
              </div>

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

                    {/* Reference range band */}
                    {latestWithRange?.ref_low != null && latestWithRange?.ref_high != null && (
                      <ReferenceArea
                        y1={latestWithRange.ref_low}
                        y2={latestWithRange.ref_high}
                        fill="#22c55e"
                        fillOpacity={0.07}
                        strokeOpacity={0}
                      />
                    )}
                    {/* One-sided reference lines */}
                    {latestWithRange?.ref_low != null && latestWithRange?.ref_high == null && (
                      <ReferenceLine y={latestWithRange.ref_low} stroke="#22c55e" strokeDasharray="4 2" strokeOpacity={0.6}
                        label={{ value: `≥ ${latestWithRange.ref_low}`, position: "insideTopLeft", fontSize: 10, fill: "#22c55e" }} />
                    )}
                    {latestWithRange?.ref_high != null && latestWithRange?.ref_low == null && (
                      <ReferenceLine y={latestWithRange.ref_high} stroke="#22c55e" strokeDasharray="4 2" strokeOpacity={0.6}
                        label={{ value: `≤ ${latestWithRange.ref_high}`, position: "insideTopLeft", fontSize: 10, fill: "#22c55e" }} />
                    )}

                    {/* Year markers */}
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
            </div>
          )}

          {/* ── Visit history table ────────────────────────────────────── */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">All Results</span>
            <div className="rounded-lg border overflow-hidden">
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
                      const refDisplay = h.ref_text ?? (
                        h.ref_low != null && h.ref_high != null ? `${h.ref_low} – ${h.ref_high}` :
                        h.ref_low != null ? `≥ ${h.ref_low}` :
                        h.ref_high != null ? `≤ ${h.ref_high}` : "—"
                      );
                      return (
                        <tr key={i} className={cn("border-b last:border-0", h.in_range === false && "bg-red-500/5")}>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(h.visit_date)}</td>
                          <td className={cn(
                            "px-3 py-2 text-right font-mono font-semibold tabular-nums",
                            h.in_range === false ? "text-red-600" : ""
                          )}>
                            {h.value}{test.unit ? ` ${test.unit}` : ""}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground hidden sm:table-cell">
                            {refDisplay}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {h.in_range === false ? (
                              <span className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded">Abnormal</span>
                            ) : h.in_range === true ? (
                              <span className="text-xs text-green-600 dark:text-green-400">✓</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trend summary */}
          {test.trend !== "insufficient_data" && (
            <div className="text-xs text-muted-foreground text-center pb-2">
              {trendLabel[test.trend]} (comparing last two results)
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
