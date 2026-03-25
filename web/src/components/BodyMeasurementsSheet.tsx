"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
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

type BodyEntry = { date: string; value: number };
type BodyData = { weight: BodyEntry[]; bodyfat: BodyEntry[] };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** If provided, draws a marker on the charts and auto-selects a range that includes this date */
  highlightDate?: string;
};

function formatDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

const dateToTs = (d: string) => new Date(d + "T12:00:00").getTime();
const tsToShortDate = (ts: string | number) => {
  const d = new Date(Number(ts));
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export function findNearestPrior(
  entries: BodyEntry[],
  target: string
): number | null {
  let result: number | null = null;
  for (const e of entries) {
    if (e.date > target) break;
    result = e.value;
  }
  return result;
}

export default function BodyMeasurementsSheet({ open, onOpenChange, highlightDate }: Props) {
  const [bodyData, setBodyData] = useState<BodyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState<"6mo" | "1yr" | "2yr" | "all">("all");
  const fetchedRef = useRef(false);

  // Auto-set range when a highlight date is provided
  useEffect(() => {
    if (!highlightDate) return;
    const now = getLocalDateString();
    const monthsAgo = (date: string, months: number) => {
      const d = new Date(now + "T12:00:00");
      d.setMonth(d.getMonth() - months);
      return d.toISOString().slice(0, 10);
    };
    if (highlightDate >= monthsAgo(now, 6)) setChartRange("6mo");
    else if (highlightDate >= monthsAgo(now, 12)) setChartRange("1yr");
    else if (highlightDate >= monthsAgo(now, 24)) setChartRange("2yr");
    else setChartRange("all");
  }, [highlightDate]);

  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/metrics/body", { headers });
        if (!res.ok) throw new Error("Failed to load body data");
        const data = await res.json();
        setBodyData(data);
      } catch {
        setError("Could not load body measurements");
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const today = getLocalDateString();

  const currentWeight = useMemo(
    () => (bodyData ? findNearestPrior(bodyData.weight, today) : null),
    [bodyData, today]
  );
  const currentBF = useMemo(
    () => (bodyData ? findNearestPrior(bodyData.bodyfat, today) : null),
    [bodyData, today]
  );

  // Most recent entry date
  const mostRecentDate = useMemo(() => {
    if (!bodyData) return null;
    const wDate = bodyData.weight.length ? bodyData.weight[bodyData.weight.length - 1].date : null;
    const bDate = bodyData.bodyfat.length ? bodyData.bodyfat[bodyData.bodyfat.length - 1].date : null;
    if (!wDate && !bDate) return null;
    if (!wDate) return bDate;
    if (!bDate) return wDate;
    return wDate > bDate ? wDate : bDate;
  }, [bodyData]);

  // Filter by chart range
  const filterByRange = (entries: BodyEntry[]): BodyEntry[] => {
    if (chartRange === "all") return entries;
    const now = new Date();
    const daysBack = { "6mo": 183, "1yr": 365, "2yr": 730 }[chartRange];
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - daysBack);
    const cutoffStr = getLocalDateString(cutoff);
    return entries.filter((e) => e.date >= cutoffStr);
  };

  const weightFiltered = useMemo(
    () => filterByRange(bodyData?.weight ?? []),
    [bodyData, chartRange]
  );
  const bfFiltered = useMemo(
    () => filterByRange(bodyData?.bodyfat ?? []),
    [bodyData, chartRange]
  );

  const weightChartData = useMemo(
    () => weightFiltered.map((e) => ({ ts: dateToTs(e.date), date: e.date, value: e.value })),
    [weightFiltered]
  );
  const bfChartData = useMemo(
    () => bfFiltered.map((e) => ({ ts: dateToTs(e.date), date: e.date, value: e.value })),
    [bfFiltered]
  );

  // If there's a highlight date, extend the chart domain to always include it
  const highlightTs = highlightDate ? dateToTs(highlightDate) : null;
  const xDomain: [unknown, unknown] = highlightTs
    ? ["dataMin", (max: number) => Math.max(max, highlightTs)]
    : ["dataMin", "dataMax"];

  // Year markers based on whichever dataset has more range
  const yearMarkers = useMemo(() => {
    const allFiltered = [...weightFiltered, ...bfFiltered].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    if (allFiltered.length < 2) return [];
    const firstDate = allFiltered[0].date;
    const lastDate = allFiltered[allFiltered.length - 1].date;
    const firstYear = parseInt(firstDate.slice(0, 4), 10);
    const lastYear = parseInt(lastDate.slice(0, 4), 10);
    const markers: { ts: number; year: number }[] = [];
    for (let year = firstYear + 1; year <= lastYear; year++) {
      markers.push({ ts: dateToTs(`${year}-01-01`), year });
    }
    return markers;
  }, [weightFiltered, bfFiltered]);

  // BF% vs. weight regression
  const bfTrend = useMemo(() => {
    if (!bodyData) return null;
    const weightEntries = bodyData.weight;
    const bfEntries = bodyData.bodyfat;
    if (weightEntries.length < 3 || bfEntries.length < 3) return null;

    // Build (weight, bf) pairs: for each BF entry, find nearest prior weight
    const pairs: { x: number; y: number }[] = [];
    for (const bfEntry of bfEntries) {
      const w = findNearestPrior(weightEntries, bfEntry.date);
      if (w !== null) pairs.push({ x: w, y: bfEntry.value });
    }
    if (pairs.length < 5) return null;

    // Linear regression: BF% = a * weight + b
    const n = pairs.length;
    const sumX = pairs.reduce((s, p) => s + p.x, 0);
    const sumY = pairs.reduce((s, p) => s + p.y, 0);
    const sumXY = pairs.reduce((s, p) => s + p.x * p.y, 0);
    const sumX2 = pairs.reduce((s, p) => s + p.x * p.x, 0);
    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-10) return null;

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    if (currentWeight === null || currentBF === null) return null;

    const expectedBF = slope * currentWeight + intercept;
    const deltaPct = currentBF - expectedBF;
    const deltaLbs = (deltaPct / 100) * currentWeight;

    return {
      expectedBF: Math.round(expectedBF * 10) / 10,
      deltaPct: Math.round(deltaPct * 10) / 10,
      deltaLbs: Math.round(deltaLbs * 10) / 10,
      pairCount: pairs.length,
    };
  }, [bodyData, currentWeight, currentBF]);

  // Smart Y-axis domains
  const weightYDomain = useMemo(() => {
    if (!weightChartData.length) return undefined;
    const values = weightChartData.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.1, 2);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [weightChartData]);

  const bfYDomain = useMemo(() => {
    if (!bfChartData.length) return undefined;
    const values = bfChartData.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.1, 0.5);
    return [Math.floor((min - pad) * 10) / 10, Math.ceil((max + pad) * 10) / 10];
  }, [bfChartData]);

  // All-time stats
  const weightStats = useMemo(() => {
    const entries = bodyData?.weight ?? [];
    if (!entries.length) return null;
    let high = entries[0];
    let low = entries[0];
    for (const e of entries) {
      if (e.value > high.value) high = e;
      if (e.value < low.value) low = e;
    }
    return { high, low };
  }, [bodyData]);

  const bfStats = useMemo(() => {
    const entries = bodyData?.bodyfat ?? [];
    if (!entries.length) return null;
    let high = entries[0];
    let low = entries[0];
    for (const e of entries) {
      if (e.value > high.value) high = e;
      if (e.value < low.value) low = e;
    }
    return { high, low };
  }, [bodyData]);

  const hasData = bodyData && (bodyData.weight.length > 0 || bodyData.bodyfat.length > 0);
  const hasChartData = weightChartData.length > 1 || bfChartData.length > 1;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto w-full sm:max-w-[50vw]" storageKey="body_measurements_sheet_width" defaultWidth={720}>
        <SheetHeader>
          <SheetTitle>Body Measurements</SheetTitle>
          <SheetDescription>
            Weight and body fat history
          </SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        )}

        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm mt-4">
            {error}
          </div>
        )}

        {!loading && !error && !hasData && (
          <div className="py-8 text-center text-muted-foreground text-sm mt-4">
            No body measurement data found.
          </div>
        )}

        {!loading && hasData && (
          <div className="space-y-4 mt-4">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Current Weight</span>
                <span className="text-lg font-semibold tabular-nums">
                  {currentWeight !== null ? `${currentWeight} lbs` : "—"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Current BF%</span>
                <span className="text-lg font-semibold tabular-nums">
                  {currentBF !== null ? `${currentBF}%` : "—"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Last Recorded</span>
                <span className="text-sm font-medium">
                  {mostRecentDate ? formatDate(mostRecentDate) : "—"}
                </span>
              </div>
            </div>

            {/* BF% vs trend */}
            {bfTrend && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">BF% vs. Your Weight Trend</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">Expected BF%</span>
                      <span className="text-lg font-semibold tabular-nums">{bfTrend.expectedBF}%</span>
                      <span className="text-xs text-muted-foreground">at {currentWeight} lbs</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">Actual BF%</span>
                      <span className="text-lg font-semibold tabular-nums">{currentBF}%</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-muted-foreground">vs. Trend</span>
                      <span className={`text-lg font-semibold tabular-nums ${bfTrend.deltaPct < 0 ? "text-green-500" : bfTrend.deltaPct > 0 ? "text-amber-500" : ""}`}>
                        {bfTrend.deltaPct > 0 ? "+" : ""}{bfTrend.deltaPct}%
                      </span>
                      <span className={`text-xs font-medium ${bfTrend.deltaLbs < 0 ? "text-green-500" : bfTrend.deltaLbs > 0 ? "text-amber-500" : ""}`}>
                        {bfTrend.deltaLbs > 0 ? "+" : ""}{bfTrend.deltaLbs} lbs fat
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {bfTrend.deltaPct < 0
                      ? `${Math.abs(bfTrend.deltaPct)}% leaner than expected for this weight`
                      : bfTrend.deltaPct > 0
                      ? `${bfTrend.deltaPct}% above expected for this weight`
                      : "Right on your historical trend"
                    } · based on {bfTrend.pairCount} data points
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Range selector */}
            {hasChartData && (
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

            {/* Weight chart */}
            {weightChartData.length > 1 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Weight Over Time</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={weightChartData}>
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
                      {highlightDate && (
                        <ReferenceLine
                          x={dateToTs(highlightDate)}
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeDasharray="4 2"
                          label={{ value: "workout", position: "insideTopLeft", fontSize: 10, fill: "#f59e0b" }}
                        />
                      )}
                      <XAxis
                        dataKey="ts"
                        type="number"
                        domain={xDomain as [number, number]}
                        tick={{ fontSize: 10 }}
                        tickCount={5}
                        tickFormatter={tsToShortDate}
                      />
                      <YAxis tick={{ fontSize: 10 }} width={40} domain={weightYDomain} />
                      <Tooltip
                        content={<ChartTooltip formatter={(e) => `${e.value} lbs`} />}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
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

            {/* BF% chart */}
            {bfChartData.length > 1 && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Body Fat % Over Time</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={bfChartData}>
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
                      {highlightDate && (
                        <ReferenceLine
                          x={dateToTs(highlightDate)}
                          stroke="#f59e0b"
                          strokeWidth={2}
                          strokeDasharray="4 2"
                          label={{ value: "workout", position: "insideTopLeft", fontSize: 10, fill: "#f59e0b" }}
                        />
                      )}
                      <XAxis
                        dataKey="ts"
                        type="number"
                        domain={xDomain as [number, number]}
                        tick={{ fontSize: 10 }}
                        tickCount={5}
                        tickFormatter={tsToShortDate}
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        width={40}
                        domain={bfYDomain}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        content={<ChartTooltip formatter={(e) => `${e.value}%`} />}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
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

            {/* All-time stats */}
            {(weightStats || bfStats) && (
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">All-Time Records</CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="grid grid-cols-2 gap-3">
                    {weightStats && (
                      <>
                        <div>
                          <span className="text-xs text-muted-foreground block">Highest Weight</span>
                          <span className="font-semibold tabular-nums">{weightStats.high.value} lbs</span>
                          <span className="text-xs text-muted-foreground ml-1">{formatDate(weightStats.high.date)}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">Lowest Weight</span>
                          <span className="font-semibold tabular-nums">{weightStats.low.value} lbs</span>
                          <span className="text-xs text-muted-foreground ml-1">{formatDate(weightStats.low.date)}</span>
                        </div>
                      </>
                    )}
                    {bfStats && (
                      <>
                        <div>
                          <span className="text-xs text-muted-foreground block">Highest BF%</span>
                          <span className="font-semibold tabular-nums">{bfStats.high.value}%</span>
                          <span className="text-xs text-muted-foreground ml-1">{formatDate(bfStats.high.date)}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block">Lowest BF%</span>
                          <span className="font-semibold tabular-nums">{bfStats.low.value}%</span>
                          <span className="text-xs text-muted-foreground ml-1">{formatDate(bfStats.low.date)}</span>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
