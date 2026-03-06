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
      <SheetContent side="right" className="overflow-y-auto w-full sm:max-w-[50vw]">
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
                        domain={["dataMin", "dataMax"]}
                        tick={{ fontSize: 10 }}
                        tickCount={5}
                        tickFormatter={tsToShortDate}
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        width={40}
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
