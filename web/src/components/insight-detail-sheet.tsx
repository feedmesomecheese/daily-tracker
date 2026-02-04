"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";

type InsightDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  insightType: string | null;
  insightId: string | null;
  metricIds: string[];
  metricNames: string[];
  showPrivate?: boolean;
};

type RangeOption = "30d" | "90d" | "1y" | "all";
type GroupOption = "week" | "month" | "year";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DetailData = Record<string, any>;

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
}

function formatShortDate(dateStr: string): string {
  return dateStr.slice(5); // MM-DD
}

export function InsightDetailSheet({
  open,
  onOpenChange,
  insightType,
  insightId,
  metricIds,
  metricNames,
  showPrivate,
}: InsightDetailSheetProps) {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeOption>("all");
  const [groupBy, setGroupBy] = useState<GroupOption>("month");

  // Mobile swipe-to-close
  const touchStartY = useRef(0);
  const touchDeltaY = useRef(0);
  const swipeActive = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchDeltaY.current = 0;
    swipeActive.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchDeltaY.current = e.touches[0].clientY - touchStartY.current;
    if (touchDeltaY.current > 10 && scrollRef.current?.scrollTop === 0) {
      swipeActive.current = true;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (swipeActive.current && touchDeltaY.current > 100) {
      onOpenChange(false);
    }
  }, [onOpenChange]);

  useEffect(() => {
    if (!open || !insightType || metricIds.length === 0) {
      setData(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const headers = await getAuthHeaders();
        const params = new URLSearchParams({ type: insightType, metrics: metricIds.join(",") });
        if (insightType === "trend") {
          params.set("range", range);
        }
        if (showPrivate) params.set("showPrivate", "true");

        const res = await fetch(`/api/insights/detail?${params}`, { headers });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load detail");
        if (!cancelled) setData(json);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, insightType, metricIds, range, showPrivate]);

  const title = insightType
    ? {
        trend: "Trend Detail",
        day_of_week: "Weekly Pattern",
        numeric_numeric: "Metric Correlation",
        time_lagged: "Next-Day Effect",
        checkbox_numeric: "Habit Impact",
        checkbox_checkbox: "Habit Pair",
      }[insightType] || "Insight Detail"
    : "Insight Detail";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={
          isMobile
            ? "h-[90vh] overflow-hidden flex flex-col rounded-t-xl"
            : "sm:max-w-[560px] overflow-hidden flex flex-col"
        }
      >
        {isMobile && (
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        )}
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {metricNames.join(" & ")}
          </SheetDescription>
        </SheetHeader>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto mt-4 space-y-4"
          onTouchStart={isMobile ? handleTouchStart : undefined}
          onTouchMove={isMobile ? handleTouchMove : undefined}
          onTouchEnd={isMobile ? handleTouchEnd : undefined}
        >
          {loading && !data && (
            <p className="text-muted-foreground text-sm py-8 text-center">
              Loading...
            </p>
          )}
          {error && (
            <div className="bg-destructive/10 text-destructive p-4 rounded-lg text-sm">
              {error}
            </div>
          )}
          {data && (
            <div className={loading ? "opacity-50 pointer-events-none transition-opacity duration-200" : "transition-opacity duration-200"}>
              {insightType === "trend" && (
                <TrendDetail data={data} range={range} setRange={setRange} groupBy={groupBy} setGroupBy={setGroupBy} />
              )}
              {insightType === "day_of_week" && <DayOfWeekDetail data={data} />}
              {insightType === "numeric_numeric" && <NumericNumericDetail data={data} />}
              {insightType === "checkbox_numeric" && <CheckboxNumericDetail data={data} />}
              {insightType === "time_lagged" && <TimeLaggedDetail data={data} />}
              {insightType === "checkbox_checkbox" && <CheckboxCheckboxDetail data={data} />}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function formatValue(val: number, metricType?: string): string {
  if (metricType === "time" || metricType === "hhmm") {
    const totalMins = Math.round(val);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `${hrs}:${String(mins).padStart(2, "0")}`;
  }
  return String(Math.round(val * 100) / 100);
}

function formatPeriod(period: string, group: GroupOption): string {
  if (group === "week") {
    // period is "YYYY-MM-DD" (the Monday)
    const d = new Date(period + "T00:00:00");
    const month = d.toLocaleString("default", { month: "short" });
    return `Week of ${month} ${d.getDate()}, ${d.getFullYear()}`;
  } else if (group === "month") {
    // period is "YYYY-MM"
    const d = new Date(period + "-01T00:00:00");
    return d.toLocaleString("default", { month: "long", year: "numeric" });
  } else {
    // year: period is "YYYY"
    return period;
  }
}

function aggregatePoints(
  points: { date: string; value: number }[],
  group: GroupOption
): { period: string; avg: number; total: number; count: number }[] {
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const p of points) {
    let key: string;
    const d = new Date(p.date + "T00:00:00");
    if (group === "week") {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      key = monday.toISOString().slice(0, 10);
    } else if (group === "year") {
      key = p.date.slice(0, 4);
    } else {
      key = p.date.slice(0, 7);
    }
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.sum += p.value;
      bucket.count++;
    } else {
      buckets.set(key, { sum: p.value, count: 1 });
    }
  }
  return Array.from(buckets.entries())
    .map(([period, { sum, count }]) => ({
      period,
      avg: Math.round((sum / count) * 100) / 100,
      total: Math.round(sum * 100) / 100,
      count,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

// --- Trend Detail ---
function TrendDetail({
  data,
  range,
  setRange,
  groupBy,
  setGroupBy,
}: {
  data: DetailData;
  range: RangeOption;
  setRange: (r: RangeOption) => void;
  groupBy: GroupOption;
  setGroupBy: (g: GroupOption) => void;
}) {
  const hib = data.higherIsBetter !== false;
  const metricType = data.metricType as string | undefined;
  const isCount = metricType === "count";
  const ranges: RangeOption[] = ["30d", "90d", "1y", "all"];
  const groups: GroupOption[] = ["week", "month", "year"];
  const [aggMode, setAggMode] = useState<"avg" | "total">("avg");

  const aggregated = useMemo(() => {
    if (!data?.points) return [];
    return aggregatePoints(data.points, groupBy);
  }, [data?.points, groupBy]);

  const aggDataKey = isCount && aggMode === "total" ? "total" : "avg";
  const aggLabel = isCount && aggMode === "total" ? "Total" : "Avg";

  // Compute MA7 for daily values
  const ma7Points = useMemo(() => {
    const pts = data.points as { date: string; value: number }[] | undefined;
    if (!pts || pts.length < 7) return pts || [];
    return pts.map((p: { date: string; value: number }, i: number) => {
      if (i < 6) return { ...p, ma7: undefined };
      const window = pts.slice(i - 6, i + 1);
      const avg = window.reduce((s: number, w: { value: number }) => s + w.value, 0) / 7;
      return { ...p, ma7: Math.round(avg * 100) / 100 };
    });
  }, [data?.points]);

  const showMa7 = ma7Points.length > 14;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {ranges.map((r) => (
          <Button
            key={r}
            variant={range === r ? "default" : "outline"}
            size="sm"
            onClick={() => setRange(r)}
          >
            {r === "all" ? "All" : r}
          </Button>
        ))}
      </div>

      {/* Raw data line chart */}
      {data.points?.length > 0 && (
        <Card>
          <CardContent className="px-2 pt-4 pb-2">
            <p className="text-sm font-medium mb-2 px-2">Daily Values</p>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={ma7Points}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={formatShortDate}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatValue(v, metricType)} />
                  <Tooltip
                    labelFormatter={(d) => formatDate(d as string)}
                    formatter={(value: number, name: string) => [formatValue(value, metricType), name === "ma7" ? "7-day avg" : "Value"]}
                  />
                  <ReferenceLine
                    y={data.overallAvg}
                    stroke="#888"
                    strokeDasharray="3 3"
                    label={{ value: `Avg: ${formatValue(data.overallAvg, metricType)}`, fontSize: 10, fill: "#888" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#3b82f6"
                    dot={false}
                    strokeWidth={1.5}
                    animationDuration={300}
                  />
                  {showMa7 && (
                    <Line
                      type="monotone"
                      dataKey="ma7"
                      stroke="#f59e0b"
                      dot={false}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="ma7"
                      connectNulls
                      animationDuration={300}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grouped averages */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Group by:</span>
          {groups.map((g) => (
            <Button
              key={g}
              variant={groupBy === g ? "default" : "outline"}
              size="sm"
              onClick={() => setGroupBy(g)}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </Button>
          ))}
        </div>

        {isCount && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show:</span>
            {(["avg", "total"] as const).map((m) => (
              <Button
                key={m}
                variant={aggMode === m ? "default" : "outline"}
                size="sm"
                onClick={() => setAggMode(m)}
              >
                {m === "avg" ? "Average" : "Total"}
              </Button>
            ))}
          </div>
        )}
      </div>

      {aggregated.length > 0 && (
        <Card>
          <CardContent className="px-2 pt-4 pb-2">
            <p className="text-sm font-medium mb-2 px-2">
              {groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}ly {aggLabel}s
            </p>
            <div style={{ width: "100%", height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={aggregated}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatValue(v, metricType)} />
                  <Tooltip
                    content={({ payload, label }) => {
                      if (!payload?.[0]) return null;
                      return (
                        <div className="bg-background border rounded p-2 text-xs shadow">
                          <p className="text-muted-foreground">{formatPeriod(String(label), groupBy)}</p>
                          <p className="font-medium">{aggLabel}: {formatValue(payload[0].value as number, metricType)}</p>
                          {payload[0].payload?.count != null && (
                            <p className="text-muted-foreground">{payload[0].payload.count} days</p>
                          )}
                        </div>
                      );
                    }}
                  />
                  {aggDataKey === "avg" && (
                    <ReferenceLine
                      y={data.overallAvg}
                      stroke="#888"
                      strokeDasharray="3 3"
                    />
                  )}
                  <Bar dataKey={aggDataKey} radius={[3, 3, 0, 0]} animationDuration={300}>
                    {aggregated.map(
                      (entry, i) => {
                        const refVal = aggDataKey === "avg" ? data.overallAvg : undefined;
                        const aboveAvg = refVal != null ? entry[aggDataKey] >= refVal : true;
                        const isGood = hib ? aboveAvg : !aboveAvg;
                        return (
                          <Cell
                            key={i}
                            fill={refVal != null ? (isGood ? "#22c55e" : "#ef4444") : "#3b82f6"}
                            fillOpacity={0.7}
                          />
                        );
                      }
                    )}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted-foreground px-2 mt-1">
              {aggregated.length} periods &middot; Overall avg: {formatValue(data.overallAvg, metricType)}
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// --- Day of Week Detail ---
type DowView = "weekly" | "monthly";

function DayOfWeekDetail({ data }: { data: DetailData }) {
  const hib = data.higherIsBetter !== false;
  const metricType = data.metricType as string | undefined;
  const isCount = metricType === "count";
  const dayAverages = data.dayAverages as { day: string; avg: number; total: number; count: number }[];
  const overallAvg = data.overallAvg as number;
  const [aggMode, setAggMode] = useState<"avg" | "total">("avg");
  const [view, setView] = useState<DowView>("weekly");
  const [hoveredCell, setHoveredCell] = useState<{ date: string; value: number } | null>(null);

  const dataKey = isCount && aggMode === "total" ? "total" : "avg";
  const label = isCount && aggMode === "total" ? "Total" : "Avg";

  return (
    <>
      <div className="sticky top-0 z-10 bg-background pb-2 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">View:</span>
          {(["weekly", "monthly"] as const).map((v) => (
            <Button key={v} variant={view === v ? "default" : "outline"} size="sm" onClick={() => setView(v)}>
              {v === "weekly" ? "Weekly" : "Calendar"}
            </Button>
          ))}
        </div>
        {view === "monthly" && (
          <p className="text-sm min-h-[20px]">
            {hoveredCell ? (
              <>
                <span className="text-muted-foreground">{formatDate(hoveredCell.date)}: </span>
                <span className="font-semibold">{formatValue(hoveredCell.value, metricType)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Hover a date to see its value</span>
            )}
          </p>
        )}

        {isCount && view === "weekly" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show:</span>
            {(["avg", "total"] as const).map((m) => (
              <Button key={m} variant={aggMode === m ? "default" : "outline"} size="sm" onClick={() => setAggMode(m)}>
                {m === "avg" ? "Average" : "Total"}
              </Button>
            ))}
          </div>
        )}
      </div>

      {view === "weekly" && (
        <Card>
          <CardContent className="px-2 pt-4 pb-2">
            <p className="text-sm font-medium mb-2 px-2">
              {data.metricName} by Day of Week
            </p>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dayAverages}
                  margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(0, 3)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatValue(v, metricType)} />
                  <Tooltip
                    formatter={(value: number, _name: string, props: { payload?: { count?: number } }) => [
                      `${formatValue(value, metricType)} (${props.payload?.count} days)`,
                      label,
                    ]}
                  />
                  {dataKey === "avg" && (
                    <ReferenceLine
                      y={overallAvg}
                      stroke="#888"
                      strokeDasharray="3 3"
                      label={{ value: `Avg: ${formatValue(overallAvg, metricType)}`, fontSize: 10, fill: "#888" }}
                    />
                  )}
                  <Bar dataKey={dataKey} radius={[3, 3, 0, 0]} animationDuration={300}>
                    {dayAverages.map((entry, i) => {
                      const refVal = dataKey === "avg" ? overallAvg : undefined;
                      const aboveAvg = refVal != null ? entry[dataKey] >= refVal : true;
                      const isGood = hib ? aboveAvg : !aboveAvg;
                      return (
                        <Cell
                          key={i}
                          fill={refVal != null ? (isGood ? "#22c55e" : "#ef4444") : "#3b82f6"}
                          fillOpacity={0.7}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {view === "monthly" && data.dailyValues && (
        <CalendarHeatmap
          data={data.dailyValues as { date: string; value: number }[]}
          metricType={metricType}
          higherIsBetter={hib}
          hoveredCell={hoveredCell}
          onHover={setHoveredCell}
        />
      )}
    </>
  );
}

function CalendarHeatmap({
  data,
  higherIsBetter,
  hoveredCell,
  onHover,
}: {
  data: { date: string; value: number }[];
  metricType?: string;
  higherIsBetter: boolean;
  hoveredCell: { date: string; value: number } | null;
  onHover: (cell: { date: string; value: number } | null) => void;
}) {
  const valueMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of data) m.set(d.date, d.value);
    return m;
  }, [data]);

  const months = useMemo(() => {
    if (data.length === 0) return [];
    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0].date;
    const last = sorted[sorted.length - 1].date;
    const result: string[] = [];
    const d = new Date(first.slice(0, 7) + "-01T00:00:00");
    const end = new Date(last.slice(0, 7) + "-01T00:00:00");
    while (d <= end) {
      result.push(d.toISOString().slice(0, 7));
      d.setMonth(d.getMonth() + 1);
    }
    return result.sort().reverse();
  }, [data]);

  // Consistent color scale across all months
  const allValues = data.map((d) => d.value);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const valRange = maxVal - minVal || 1;

  function getColor(value: number): string {
    const t = (value - minVal) / valRange;
    if (higherIsBetter) {
      // Red (low) → Yellow (mid) → Green (high)
      if (t < 0.5) {
        const s = t * 2; // 0..1 within first half
        const r = Math.round(220 - s * 40);
        const g = Math.round(60 + s * 160);
        const b = Math.round(60 + s * 10);
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        const s = (t - 0.5) * 2; // 0..1 within second half
        const r = Math.round(180 - s * 140);
        const g = Math.round(220 - s * 25);
        const b = Math.round(70 + s * 30);
        return `rgb(${r}, ${g}, ${b})`;
      }
    } else {
      // Green (low) → Yellow (mid) → Red (high)
      if (t < 0.5) {
        const s = t * 2;
        const r = Math.round(40 + s * 140);
        const g = Math.round(195 - s * 25);
        const b = Math.round(100 - s * 30);
        return `rgb(${r}, ${g}, ${b})`;
      } else {
        const s = (t - 0.5) * 2;
        const r = Math.round(180 + s * 40);
        const g = Math.round(170 - s * 110);
        const b = Math.round(70 - s * 10);
        return `rgb(${r}, ${g}, ${b})`;
      }
    }
  }

  const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="grid grid-cols-2 gap-3">
      {months.map((month) => {
        const [y, m] = month.split("-").map(Number);
        const firstDay = new Date(y, m - 1, 1);
        const daysInMonth = new Date(y, m, 0).getDate();
        const startDow = firstDay.getDay();
        const cells: (null | { day: number; date: string; value: number | undefined })[] = [];
        for (let i = 0; i < startDow; i++) cells.push(null);
        for (let day = 1; day <= daysInMonth; day++) {
          const ds = `${month}-${String(day).padStart(2, "0")}`;
          cells.push({ day, date: ds, value: valueMap.get(ds) });
        }

        return (
          <Card key={month} className="overflow-hidden">
            <CardContent className="px-2 pt-2 pb-1.5">
              <p className="text-[10px] font-medium mb-1 text-muted-foreground">
                {firstDay.toLocaleString("default", { month: "short" })} {y}
              </p>
              <div className="grid grid-cols-7 gap-px">
                {DAY_LABELS.map((d, i) => (
                  <div key={`${d}${i}`} className="text-[7px] text-muted-foreground/60 text-center">{d}</div>
                ))}
                {cells.map((cell, i) => {
                  if (!cell) return <div key={`e${i}`} />;
                  const hasValue = cell.value !== undefined;
                  const isHovered = hoveredCell?.date === cell.date;
                  return (
                    <div
                      key={cell.date}
                      className={`aspect-square rounded-[2px] flex items-center justify-center text-[7px] cursor-default transition-transform duration-100 ${isHovered ? "ring-2 ring-foreground shadow-lg" : ""}`}
                      style={{
                        backgroundColor: hasValue ? getColor(cell.value!) : "var(--muted)",
                        opacity: hasValue ? 1 : 0.2,
                        transform: isHovered ? "scale(1.8)" : "scale(1)",
                        zIndex: isHovered ? 10 : 0,
                        position: "relative",
                        color: hasValue ? "rgba(0,0,0,0.5)" : undefined,
                      }}
                      onMouseEnter={() => hasValue && onHover({ date: cell.date, value: cell.value! })}
                      onMouseLeave={() => onHover(null)}
                    >
                      {cell.day}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// --- Numeric Numeric Detail (Scatter) ---
function NumericNumericDetail({ data }: { data: DetailData }) {
  const points = data.points as { date: string; valueA: number; valueB: number }[];
  const correlation = data.correlation as number;
  const strength =
    Math.abs(correlation) >= 0.7 ? "Strong" : Math.abs(correlation) >= 0.5 ? "Moderate" : "Weak";
  const dir = correlation > 0 ? "positive" : "negative";

  return (
    <>
      <div className="text-center">
        <p className="text-3xl font-bold font-mono">
          r = {correlation > 0 ? "+" : ""}
          {correlation.toFixed(3)}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {strength} {dir} correlation &middot; {points.length} overlapping days
        </p>
      </div>
      <Card>
        <CardContent className="px-2 pt-4 pb-2">
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 10, left: -10, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis
                  dataKey="valueA"
                  name={data.metricAName}
                  tick={{ fontSize: 10 }}
                  label={{ value: data.metricAName, position: "insideBottom", offset: -15, fontSize: 11 }}
                />
                <YAxis
                  dataKey="valueB"
                  name={data.metricBName}
                  tick={{ fontSize: 10 }}
                  label={{
                    value: data.metricBName,
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 11,
                    offset: 15,
                  }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ payload }) => {
                    if (!payload?.[0]) return null;
                    const p = payload[0].payload;
                    return (
                      <div className="bg-background border rounded p-2 text-xs shadow">
                        <p className="text-muted-foreground">{formatDate(p.date)}</p>
                        <p>{data.metricAName}: {p.valueA}</p>
                        <p>{data.metricBName}: {p.valueB}</p>
                      </div>
                    );
                  }}
                />
                <Scatter data={points} fill="#3b82f6" fillOpacity={0.6} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// --- Checkbox Numeric Detail ---
function CheckboxNumericDetail({ data }: { data: DetailData }) {
  const hib = data.numericHigherIsBetter !== false;
  const barData = [
    { label: "Checked", avg: data.avgWhenTrue, count: data.daysTrue },
    { label: "Not Checked", avg: data.avgWhenFalse, count: data.daysFalse },
  ];
  const higher = data.avgWhenTrue > data.avgWhenFalse;
  const diff = data.avgWhenTrue - data.avgWhenFalse;

  return (
    <>
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          When you <span className="font-medium text-foreground">{data.checkboxName}</span>
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="font-medium text-foreground">{data.numericName}</span> is{" "}
          <span className="font-bold">
            {higher ? "+" : ""}{Math.round(diff * 100) / 100}
          </span>{" "}
          ({higher ? "higher" : "lower"})
        </p>
      </div>
      <Card>
        <CardContent className="px-2 pt-4 pb-2">
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number, _: string, props: { payload?: { count?: number } }) => [`${value} (${props.payload?.count} days)`, "Avg"]} />
                <Bar dataKey="avg" radius={[3, 3, 0, 0]}>
                  {barData.map((entry, i) => {
                    const isHigher = entry.avg >= barData[1 - i].avg;
                    const isGood = hib ? isHigher : !isHigher;
                    return <Cell key={i} fill={isGood ? "#22c55e" : "#ef4444"} fillOpacity={0.7} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Distribution scatter */}
      {data.distribution?.length > 0 && (
        <Card>
          <CardContent className="px-2 pt-4 pb-2">
            <p className="text-sm font-medium mb-2 px-2">Daily Distribution</p>
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={formatShortDate} interval="preserveStartEnd" />
                  <YAxis dataKey="value" tick={{ fontSize: 10 }} />
                  <Tooltip labelFormatter={(d) => formatDate(d as string)} />
                  <Scatter
                    data={(data.distribution as { date: string; value: number; checked: boolean }[]).filter((d) => d.checked)}
                    fill="#22c55e"
                    fillOpacity={0.6}
                    name="Checked"
                  />
                  <Scatter
                    data={(data.distribution as { date: string; value: number; checked: boolean }[]).filter((d) => !d.checked)}
                    fill="#94a3b8"
                    fillOpacity={0.4}
                    name="Not checked"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// --- Time Lagged Detail ---
function TimeLaggedDetail({ data }: { data: DetailData }) {
  const hib = data.outcomeHigherIsBetter !== false;
  const barData = [
    { label: "After Checked", avg: data.avgNextDayWhenTrue, count: data.daysTrue },
    { label: "After Not Checked", avg: data.avgNextDayWhenFalse, count: data.daysFalse },
  ];

  return (
    <>
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          The day after <span className="font-medium text-foreground">{data.triggerName}</span>
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          <span className="font-medium text-foreground">{data.outcomeName}</span> averages
        </p>
      </div>
      <Card>
        <CardContent className="px-2 pt-4 pb-2">
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: number, _: string, props: { payload?: { count?: number } }) => [`${value} (${props.payload?.count} days)`, "Avg"]} />
                <Bar dataKey="avg" radius={[3, 3, 0, 0]}>
                  {barData.map((entry, i) => {
                    const isHigher = entry.avg >= barData[1 - i].avg;
                    const isGood = hib ? isHigher : !isHigher;
                    return <Cell key={i} fill={isGood ? "#22c55e" : "#ef4444"} fillOpacity={0.7} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// --- Checkbox Checkbox Detail ---
function CheckboxCheckboxDetail({ data }: { data: DetailData }) {
  const barData = [
    { label: `When ${data.metricAName}`, rate: data.rateWhenATrue, count: data.daysATrue },
    { label: `Without ${data.metricAName}`, rate: data.rateWhenAFalse, count: data.daysAFalse },
  ];

  return (
    <>
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          Rate of <span className="font-medium text-foreground">{data.metricBName}</span>
        </p>
      </div>
      <Card>
        <CardContent className="px-2 pt-4 pb-2">
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(value: number, _: string, props: { payload?: { count?: number } }) => [`${value}% (${props.payload?.count} days)`, "Rate"]} />
                <Bar dataKey="rate" radius={[3, 3, 0, 0]}>
                  {barData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={i === 0 ? "#3b82f6" : "#94a3b8"}
                      fillOpacity={0.7}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
