"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { PanelTest } from "../page";

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = ["#f43f5e", "#14b8a6", "#a855f7", "#f97316", "#3b82f6", "#22c55e", "#ec4899", "#84cc16"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoToTs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

function normalize(value: number, refLow: number | null, refHigh: number | null): number | null {
  if (refLow == null || refHigh == null) return null;
  const range = refHigh - refLow;
  if (range === 0) return 50;
  return ((value - refLow) / range) * 100;
}

type DateRange = "1yr" | "2yr" | "5yr" | "all";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  selectedTests: PanelTest[];
  allTests: PanelTest[];
  onAddTest: (canonical: string) => void;
  onRemoveTest: (canonical: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LabCompareSheet({
  open,
  onClose,
  selectedTests,
  allTests,
  onAddTest,
  onRemoveTest,
}: Props) {
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [normalizeValues, setNormalizeValues] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);

  // Close add dropdown on outside click
  useEffect(() => {
    if (!addOpen) return;
    const handler = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) {
        setAddOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addOpen]);

  // Units — determine if normalization is useful
  const uniqueUnits = useMemo(
    () => new Set(selectedTests.map((t) => t.unit ?? "").filter(Boolean)),
    [selectedTests]
  );
  const mixedUnits = uniqueUnits.size > 1;

  // Date cutoff timestamp
  const cutoffTs = useMemo(() => {
    if (dateRange === "all") return 0;
    const d = new Date();
    if (dateRange === "1yr") d.setFullYear(d.getFullYear() - 1);
    else if (dateRange === "2yr") d.setFullYear(d.getFullYear() - 2);
    else if (dateRange === "5yr") d.setFullYear(d.getFullYear() - 5);
    return d.getTime();
  }, [dateRange]);

  // Merged chart data — unified timestamp axis
  const chartData = useMemo(() => {
    const tsMap = new Map<number, Record<string, number | null>>();

    for (const test of selectedTests) {
      for (const entry of test.history) {
        const ts = isoToTs(entry.visit_date);
        if (ts < cutoffTs) continue;

        if (!tsMap.has(ts)) tsMap.set(ts, { ts });
        const point = tsMap.get(ts)!;

        if (normalizeValues && mixedUnits) {
          const norm = normalize(entry.value, entry.ref_low, entry.ref_high);
          point[test.canonical_name] = norm;
        } else {
          point[test.canonical_name] = entry.value;
        }
      }
    }

    return [...tsMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, point]) => point);
  }, [selectedTests, cutoffTs, normalizeValues, mixedUnits]);

  // Year markers
  const yearMarkers = useMemo(() => {
    if (chartData.length < 2) return [];
    const tsValues = chartData.map((d) => d.ts as number);
    const first = Math.min(...tsValues);
    const last = Math.max(...tsValues);
    const markers: number[] = [];
    for (let y = new Date(first).getUTCFullYear() + 1; y <= new Date(last).getUTCFullYear(); y++) {
      const ts = Date.UTC(y, 0, 1);
      if (ts > first && ts < last) markers.push(ts);
    }
    return markers;
  }, [chartData]);

  // Stats per test within date range
  const stats = useMemo(() => {
    return selectedTests.map((test) => {
      const vals = test.history
        .filter((h) => isoToTs(h.visit_date) >= cutoffTs)
        .map((h) => h.value);
      if (!vals.length) return { min: null, max: null, avg: null, n: 0 };
      return {
        min: Math.min(...vals),
        max: Math.max(...vals),
        avg: vals.reduce((a, b) => a + b, 0) / vals.length,
        n: vals.length,
      };
    });
  }, [selectedTests, cutoffTs]);

  // Tests not yet selected
  const available = useMemo(
    () => allTests.filter((t) => !selectedTests.some((s) => s.canonical_name === t.canonical_name)),
    [allTests, selectedTests]
  );

  const TREND_ICON: Record<string, string> = { up: "↑", down: "↓", stable: "→", insufficient_data: "—" };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        storageKey="lab_compare_sheet_width"
        defaultWidth={800}
        className="flex flex-col h-full p-0 gap-0"
      >
        <SheetHeader className="px-5 py-4 border-b shrink-0">
          <SheetTitle>Compare Tests</SheetTitle>
          <SheetDescription className="sr-only">
            Compare multiple lab tests on a shared timeline.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* ── Selected test chips + add ── */}
          <div className="flex flex-wrap gap-2 items-center">
            {selectedTests.map((test, i) => (
              <div
                key={test.canonical_name}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-sm font-medium"
                style={{
                  borderColor: COLORS[i % COLORS.length],
                  color: COLORS[i % COLORS.length],
                  backgroundColor: `${COLORS[i % COLORS.length]}18`,
                }}
              >
                {test.display_name}
                {test.unit && <span className="text-xs opacity-70">({test.unit})</span>}
                {selectedTests.length > 1 && (
                  <button
                    onClick={() => onRemoveTest(test.canonical_name)}
                    className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity text-base leading-none"
                    aria-label={`Remove ${test.display_name}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}

            {/* Add test dropdown */}
            {available.length > 0 && (
              <div className="relative" ref={addRef}>
                <button
                  onClick={() => setAddOpen((v) => !v)}
                  className="px-2.5 py-1 rounded-full border border-dashed text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                >
                  + Add test
                </button>
                {addOpen && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-popover border rounded-xl shadow-lg w-56 max-h-60 overflow-y-auto">
                    {available.map((t) => (
                      <button
                        key={t.canonical_name}
                        onClick={() => { onAddTest(t.canonical_name); setAddOpen(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{t.display_name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">{t.category}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Controls ── */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Date range pills */}
            <div className="flex items-center rounded-lg border bg-muted/30 p-0.5 gap-0.5">
              {(["1yr", "2yr", "5yr", "all"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                    dateRange === r
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r === "all" ? "All time" : r}
                </button>
              ))}
            </div>

            {/* Normalize toggle — only shown when units differ */}
            {mixedUnits && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={normalizeValues}
                  onChange={(e) => setNormalizeValues(e.target.checked)}
                  className="rounded"
                />
                Normalize to reference range (%)
              </label>
            )}
          </div>

          {/* Mixed-units notice */}
          {mixedUnits && !normalizeValues && (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
              These tests use different units ({[...uniqueUnits].join(", ")}). Enable normalization to plot them on a shared scale.
            </p>
          )}

          {/* ── Chart ── */}
          {chartData.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-sm text-muted-foreground">
              No data in selected range
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-25" />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickFormatter={(ts: number) =>
                      new Date(ts).toLocaleDateString("en-US", {
                        month: "short", year: "2-digit", timeZone: "UTC",
                      })
                    }
                    tick={{ fontSize: 10 }}
                    minTickGap={60}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    width={45}
                    tickFormatter={(v: number) =>
                      normalizeValues && mixedUnits ? `${Math.round(v)}%` : String(v)
                    }
                  />

                  {/* Normalize reference lines: 0% = low, 100% = high, 50% = midpoint */}
                  {normalizeValues && mixedUnits && (
                    <>
                      <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="3 3" strokeOpacity={0.4} />
                      <ReferenceLine y={100} stroke="#dc2626" strokeDasharray="3 3" strokeOpacity={0.4} />
                      <ReferenceLine y={50} stroke="#16a34a" strokeDasharray="3 3" strokeOpacity={0.35} />
                    </>
                  )}

                  {/* Year markers */}
                  {yearMarkers.map((ts) => (
                    <ReferenceLine
                      key={ts}
                      x={ts}
                      stroke="currentColor"
                      strokeOpacity={0.12}
                      strokeDasharray="3 3"
                      label={{
                        value: new Date(ts).getUTCFullYear(),
                        position: "insideTopLeft",
                        fontSize: 9,
                        opacity: 0.4,
                      }}
                    />
                  ))}

                  <Tooltip
                    labelFormatter={(ts: number) => formatDate(new Date(ts).toISOString().slice(0, 10))}
                    formatter={(value: number, key: string) => {
                      const test = selectedTests.find((t) => t.canonical_name === key);
                      if (value == null) return ["—", test?.display_name ?? key];
                      if (normalizeValues && mixedUnits)
                        return [`${value.toFixed(1)}%`, test?.display_name ?? key];
                      return [
                        `${value}${test?.unit ? ` ${test.unit}` : ""}`,
                        test?.display_name ?? key,
                      ];
                    }}
                  />

                  <Legend
                    formatter={(value: string) => {
                      const test = selectedTests.find((t) => t.canonical_name === value);
                      return test?.display_name ?? value;
                    }}
                    wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  />

                  {selectedTests.map((test, i) => (
                    <Line
                      key={test.canonical_name}
                      type="monotone"
                      dataKey={test.canonical_name}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3, fill: COLORS[i % COLORS.length] }}
                      activeDot={{ r: 5 }}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Stat strips ── */}
          <div className="space-y-2">
            {selectedTests.map((test, i) => {
              const s = stats[i];
              const latest = test.history.find(
                (h) => isoToTs(h.visit_date) >= cutoffTs
              );
              return (
                <div key={test.canonical_name} className="rounded-xl border px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="font-medium text-sm">{test.display_name}</span>
                    <span className="text-xs text-muted-foreground">{test.category}</span>
                    {test.unit && (
                      <span className="text-xs text-muted-foreground opacity-60">({test.unit})</span>
                    )}
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    {[
                      { label: "Latest", value: latest?.value != null ? String(latest.value) : "—" },
                      { label: "Min", value: s.min != null ? s.min.toFixed(1) : "—" },
                      { label: "Max", value: s.max != null ? s.max.toFixed(1) : "—" },
                      { label: "Avg", value: s.avg != null ? s.avg.toFixed(1) : "—" },
                      { label: "Trend", value: TREND_ICON[test.trend] ?? "—" },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                        <div className="text-sm font-mono font-semibold tabular-nums">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
