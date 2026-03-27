"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceArea, ReferenceLine,
} from "recharts";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getAuthHeaders } from "@/lib/authHeaders";
import LabVisitSheet from "../../components/LabVisitSheet";
import type { LabVisit } from "../../page";
import type { PanelTest, HistoryEntry } from "../page";

// ── Constants ────────────────────────────────────────────────────────────────

const COMPARE_COLORS = ["#f43f5e", "#14b8a6", "#a855f7"];

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

type Direction = "high" | "low" | "normal" | "suboptimal" | "no-range";

function getDirection(
  value: number,
  refLow: number | null,
  refHigh: number | null,
  inRange: boolean | null,
  optLow?: number | null,
  optHigh?: number | null,
  showOptimal?: boolean,
): Direction {
  if (inRange === false) {
    if (refHigh != null && value > refHigh) return "high";
    if (refLow != null && value < refLow) return "low";
    return "high";
  }
  if (inRange === true) {
    if (showOptimal && (optLow != null || optHigh != null)) {
      if ((optLow != null && value < optLow) || (optHigh != null && value > optHigh)) return "suboptimal";
    }
    return "normal";
  }
  return "no-range";
}

const DIRECTION_LABEL: Record<Direction, string> = {
  high: "↑ High",
  low: "↓ Low",
  normal: "Normal",
  suboptimal: "Suboptimal",
  "no-range": "No range",
};

const DIRECTION_BADGE: Record<Direction, string> = {
  high: "border border-red-700/40 bg-red-700/10 text-red-700 dark:border-red-400/40 dark:bg-red-400/10 dark:text-red-400",
  low: "border border-blue-700/40 bg-blue-700/10 text-blue-700 dark:border-blue-400/40 dark:bg-blue-400/10 dark:text-blue-400",
  normal: "border border-green-700/40 bg-green-700/10 text-green-700 dark:border-green-400/40 dark:bg-green-400/10 dark:text-green-400",
  suboptimal: "border border-amber-600/40 bg-amber-600/10 text-amber-700 dark:border-amber-400/40 dark:bg-amber-400/10 dark:text-amber-400",
  "no-range": "border border-border bg-muted/50 text-muted-foreground",
};

const DIRECTION_VALUE_COLOR: Record<Direction, string> = {
  high: "text-red-600 dark:text-red-400",
  low: "text-blue-600 dark:text-blue-400",
  normal: "text-green-600 dark:text-green-400",
  suboptimal: "text-amber-600 dark:text-amber-400",
  "no-range": "text-foreground",
};

const DIRECTION_DOT_COLOR: Record<Direction, string> = {
  high: "#dc2626",
  low: "#2563eb",
  normal: "#16a34a",
  suboptimal: "#d97706",
  "no-range": "#94a3b8",
};

// ── Reference range bar ───────────────────────────────────────────────────────

interface RangeBarProps {
  value: number;
  refLow: number | null;
  refHigh: number | null;
  optLow?: number | null;
  optHigh?: number | null;
  showOptimal?: boolean;
}

function RangeBar({ value, refLow, refHigh, optLow, optHigh, showOptimal }: RangeBarProps) {
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
  const direction = getDirection(value, refLow, refHigh, inRange ? true : false, optLow, optHigh, showOptimal);
  const dotBg = DIRECTION_DOT_COLOR[direction];

  const optStart = showOptimal && optLow != null
    ? Math.min(Math.max((optLow - viewMin) / viewSpan, greenStart), greenEnd)
    : greenStart;
  const optEnd = showOptimal && optHigh != null
    ? Math.min(Math.max((optHigh - viewMin) / viewSpan, greenStart), greenEnd)
    : greenEnd;
  const hasOptimalBand = showOptimal && (optLow != null || optHigh != null);

  return (
    <div className="relative h-4 my-1">
      <div className="absolute inset-0 rounded-full overflow-hidden" style={{ backgroundColor: "#dc2626" }}>
        <div
          className="absolute inset-y-0"
          style={{ left: `${greenStart * 100}%`, width: `${(greenEnd - greenStart) * 100}%`, backgroundColor: "#16a34a" }}
        />
        {hasOptimalBand && (
          <div
            className="absolute inset-y-0"
            style={{ left: `${optStart * 100}%`, width: `${(optEnd - optStart) * 100}%`, backgroundColor: "#3b82f6" }}
          />
        )}
      </div>
      {refLow != null && (
        <div className="absolute inset-y-0 w-px" style={{ left: `${((refLow - viewMin) / viewSpan) * 100}%`, backgroundColor: "rgba(255,255,255,0.6)" }} />
      )}
      {refHigh != null && (
        <div className="absolute inset-y-0 w-px" style={{ left: `${((refHigh - viewMin) / viewSpan) * 100}%`, backgroundColor: "rgba(255,255,255,0.6)" }} />
      )}
      {hasOptimalBand && optLow != null && (
        <div className="absolute inset-y-0 w-px" style={{ left: `${((optLow - viewMin) / viewSpan) * 100}%`, backgroundColor: "rgba(255,255,255,0.5)" }} />
      )}
      {hasOptimalBand && optHigh != null && (
        <div className="absolute inset-y-0 w-px" style={{ left: `${((optHigh - viewMin) / viewSpan) * 100}%`, backgroundColor: "rgba(255,255,255,0.5)" }} />
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
  if (cx == null || cy == null || payload.value == null) return null;
  const dir = getDirection(payload.value, payload.ref_low, payload.ref_high, payload.in_range, payload.opt_low, payload.opt_high, payload.showOptimal);
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
function ChartTooltipContent({ active, payload, compareIds, allTests, normalizeComparison }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const dir = d.value != null
    ? getDirection(d.value, d.ref_low, d.ref_high, d.in_range, d.opt_low, d.opt_high, d.showOptimal)
    : "no-range";

  return (
    <div className="bg-background border rounded-lg shadow-lg px-3 py-2 text-xs space-y-0.5 max-w-[220px]">
      <div className="font-medium text-foreground">{formatDate(d.visit_date)}</div>
      {d.value != null && (
        <>
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
          {d.showOptimal && (d.opt_low != null || d.opt_high != null) && (
            <div className="text-muted-foreground">
              Optimal:{" "}
              {d.opt_low != null && d.opt_high != null ? `${d.opt_low} – ${d.opt_high}` :
               d.opt_low != null ? `≥ ${d.opt_low}` : `≤ ${d.opt_high}`}
            </div>
          )}
          <div className={DIRECTION_VALUE_COLOR[dir]}>{DIRECTION_LABEL[dir]}</div>
        </>
      )}
      {(compareIds ?? []).map((id: string, idx: number) => {
        const rawVal = d[`comp_${idx}_raw`];
        if (rawVal == null) return null;
        const ct = (allTests as PanelTest[] | undefined)?.find((t) => t.canonical_name === id);
        return (
          <div key={id} className="pt-1 border-t mt-1" style={{ color: COMPARE_COLORS[idx] }}>
            <span className="font-medium">{ct?.display_name ?? id}: </span>
            <span className="font-mono font-semibold">{rawVal}{ct?.unit ? ` ${ct.unit}` : ""}</span>
            {normalizeComparison && <span className="opacity-50 ml-1">(norm.)</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type DateRange = "1y" | "2y" | "5y" | "all";

interface Props {
  test: PanelTest | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  showOptimal?: boolean;
  allTests?: PanelTest[];
}

export default function LabTestDetailSheet({ test, open, onOpenChange, showOptimal = true, allTests = [] }: Props) {
  const [dateRange, setDateRange] = useState<DateRange>("all");

  // ── Compare state ─────────────────────────────────────────────────────────
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [normalizeComparison, setNormalizeComparison] = useState(true);
  const [showCompareDropdown, setShowCompareDropdown] = useState(false);

  useEffect(() => {
    if (!open) {
      setCompareIds([]);
      setShowCompareDropdown(false);
    }
  }, [open]);

  useEffect(() => {
    setCompareIds([]);
    setShowCompareDropdown(false);
  }, [test?.canonical_name]);

  // ── Cutoff string for date range filter ───────────────────────────────────
  const cutoffStr = useMemo(() => {
    if (dateRange === "all") return null;
    const cutoff = new Date();
    if (dateRange === "1y") cutoff.setFullYear(cutoff.getFullYear() - 1);
    else if (dateRange === "2y") cutoff.setFullYear(cutoff.getFullYear() - 2);
    else if (dateRange === "5y") cutoff.setFullYear(cutoff.getFullYear() - 5);
    return cutoff.toISOString().slice(0, 10);
  }, [dateRange]);

  // ── Primary series ────────────────────────────────────────────────────────
  const filteredHistory = useMemo(() => {
    if (!test) return [];
    const history = [...test.history].sort((a, b) => a.visit_date.localeCompare(b.visit_date));
    if (!cutoffStr) return history;
    return history.filter((h) => h.visit_date >= cutoffStr);
  }, [test, cutoffStr]);

  const chartData = useMemo(() =>
    filteredHistory.map((h) => ({
      ...h,
      ts: isoToTs(h.visit_date),
      unit: test?.unit ?? null,
      opt_low: test?.opt_low ?? null,
      opt_high: test?.opt_high ?? null,
      showOptimal,
    })),
  [filteredHistory, test, showOptimal]);

  const latestWithRange = useMemo(() => {
    if (!test) return null;
    return [...test.history]
      .sort((a, b) => b.visit_date.localeCompare(a.visit_date))
      .find((h) => h.ref_low != null || h.ref_high != null) ?? null;
  }, [test]);

  const stats = useMemo(() => {
    if (!test || test.history.length === 0) return null;
    const values = test.history.map((h) => h.value);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    };
  }, [test]);

  // ── Compare dropdown groups ───────────────────────────────────────────────
  const compareDropdownGroups = useMemo(() => {
    if (!allTests.length || !test) return [];
    const groups = new Map<string, PanelTest[]>();
    for (const t of allTests) {
      if (t.canonical_name === test.canonical_name || t.history.length === 0) continue;
      const cat = t.category || "Other";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(t);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [allTests, test]);

  // ── Chart data with comparison series ────────────────────────────────────
  const chartDataWithComparison = useMemo(() => {
    if (compareIds.length === 0 || chartData.length === 0) return chartData;

    const compTests = compareIds
      .map((id) => allTests.find((t) => t.canonical_name === id))
      .filter((t): t is PanelTest => t != null);

    const compMaps = compTests.map((ct) => {
      const map = new Map<number, number>();
      for (const h of ct.history) {
        if (!cutoffStr || h.visit_date >= cutoffStr) {
          map.set(isoToTs(h.visit_date), h.value);
        }
      }
      return map;
    });

    // Union of timestamps
    const tsSet = new Set<number>(chartData.map((d) => d.ts));
    for (const map of compMaps) for (const ts of map.keys()) tsSet.add(ts);
    const allTs = [...tsSet].sort((a, b) => a - b);

    // Normalization ranges
    const primaryVals = chartData.map((d) => d.value);
    const primaryMin = Math.min(...primaryVals);
    const primaryMax = Math.max(...primaryVals);
    const primaryRange = primaryMax - primaryMin || 1;

    const compRanges = compMaps.map((map) => {
      const vals = [...map.values()];
      if (vals.length === 0) return { min: 0, range: 1 };
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return { min, range: max - min || 1 };
    });

    const primaryMap = new Map(chartData.map((d) => [d.ts, d]));

    return allTs.map((ts) => {
      const primary = primaryMap.get(ts);
      const base = primary ?? {
        ts,
        value: null as unknown as number,
        unit: test?.unit ?? null,
        in_range: null,
        ref_low: null,
        ref_high: null,
        ref_text: null,
        visit_id: "",
        visit_date: new Date(ts).toISOString().slice(0, 10),
        opt_low: test?.opt_low ?? null,
        opt_high: test?.opt_high ?? null,
        showOptimal,
      };

      const extras: Record<string, number | null> = {};
      compareIds.forEach((_, idx) => {
        const rawVal = compMaps[idx]?.get(ts) ?? null;
        if (rawVal != null && normalizeComparison) {
          const { min, range } = compRanges[idx];
          extras[`comp_${idx}`] = primaryMin + ((rawVal - min) / range) * primaryRange;
        } else {
          extras[`comp_${idx}`] = rawVal;
        }
        extras[`comp_${idx}_raw`] = compMaps[idx]?.get(ts) ?? null;
      });

      return { ...base, ...extras };
    });
  }, [chartData, compareIds, allTests, cutoffStr, normalizeComparison, test, showOptimal]);

  // ── Y-domain ─────────────────────────────────────────────────────────────
  const yDomain = useMemo((): [number, number] | ["auto", "auto"] => {
    if (chartData.length === 0) return ["auto", "auto"];
    const values = chartData.map((d) => d.value);
    const rLow = latestWithRange?.ref_low;
    const rHigh = latestWithRange?.ref_high;
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const dataRange = dataMax - dataMin || 1;
    const extraVals: number[] = [];
    if (rLow != null && rLow >= dataMin - dataRange * 2) extraVals.push(rLow);
    if (rHigh != null && rHigh <= dataMax + dataRange * 2) extraVals.push(rHigh);
    if (showOptimal) {
      if (test?.opt_low != null && test.opt_low >= dataMin - dataRange * 2) extraVals.push(test.opt_low);
      if (test?.opt_high != null && test.opt_high <= dataMax + dataRange * 2) extraVals.push(test.opt_high);
    }
    // When comparison is active without normalization, include their values in domain
    if (compareIds.length > 0 && !normalizeComparison) {
      for (const id of compareIds) {
        const ct = allTests.find((t) => t.canonical_name === id);
        if (ct) {
          for (const h of ct.history) {
            if (!cutoffStr || h.visit_date >= cutoffStr) extraVals.push(h.value);
          }
        }
      }
    }
    const allVals = [...values, ...extraVals];
    const min = Math.min(...allVals);
    const max = Math.max(...allVals);
    const pad = (max - min) * 0.15 || 1;
    return [min - pad, max + pad];
  }, [chartData, latestWithRange, test, showOptimal, compareIds, allTests, cutoffStr, normalizeComparison]);

  // ── Year markers ─────────────────────────────────────────────────────────
  const yearMarkers = useMemo(() => {
    if (chartDataWithComparison.length < 2) return [];
    const tsList = chartDataWithComparison.map((d) => d.ts);
    const minTs = Math.min(...tsList);
    const maxTs = Math.max(...tsList);
    const minYear = new Date(minTs).getUTCFullYear() + 1;
    const maxYear = new Date(maxTs).getUTCFullYear();
    const markers = [];
    for (let y = minYear; y <= maxYear; y++) {
      const ts = Date.UTC(y, 0, 1);
      if (ts > minTs && ts < maxTs) markers.push(ts);
    }
    return markers;
  }, [chartDataWithComparison]);

  // ── Visit sheet ───────────────────────────────────────────────────────────
  const [visitSheet, setVisitSheet] = useState<{ visit: LabVisit; open: boolean } | null>(null);
  const [loadingVisitId, setLoadingVisitId] = useState<string | null>(null);

  const handleRowClick = useCallback(async (visitId: string) => {
    setLoadingVisitId(visitId);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/labs/visits/${visitId}`, { headers });
      if (res.ok) {
        const data: LabVisit = await res.json();
        setVisitSheet({ visit: data, open: true });
      }
    } finally {
      setLoadingVisitId(null);
    }
  }, []);

  // ── Tooltip renderer (closure captures compareIds/allTests/normalizeComparison) ──
  const tooltipContent = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (props: any) => (
      <ChartTooltipContent
        {...props}
        compareIds={compareIds}
        allTests={allTests}
        normalizeComparison={normalizeComparison}
      />
    ),
    [compareIds, allTests, normalizeComparison],
  );

  if (!test) return null;

  const latest = test.latest;
  const latestDir: Direction = latest
    ? getDirection(
        latest.value,
        latestWithRange?.ref_low ?? latest.ref_low,
        latestWithRange?.ref_high ?? latest.ref_high,
        latest.in_range,
        test.opt_low,
        test.opt_high,
        showOptimal,
      )
    : "no-range";

  return (
    <>
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

          {/* ── Latest Result + range bar ─────────────────────────── */}
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
                    <RangeBar
                      value={latest.value}
                      refLow={latestWithRange?.ref_low ?? null}
                      refHigh={latestWithRange?.ref_high ?? null}
                      optLow={test.opt_low}
                      optHigh={test.opt_high}
                      showOptimal={showOptimal}
                    />
                    <RangeBarLabels refLow={latestWithRange?.ref_low ?? null} refHigh={latestWithRange?.ref_high ?? null} unit={test.unit} />
                  </>
                )}
                {latestWithRange?.ref_text && !latestWithRange.ref_low && !latestWithRange.ref_high && (
                  <div className="text-xs text-muted-foreground">Reference: {latestWithRange.ref_text}</div>
                )}
                {showOptimal && (test.opt_low != null || test.opt_high != null) && (
                  <div className="flex justify-between text-xs mt-0.5">
                    <span className="text-blue-600 dark:text-blue-400">Optimal range</span>
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {test.opt_low != null && test.opt_high != null ? `${test.opt_low} – ${test.opt_high}` :
                       test.opt_low != null ? `≥ ${test.opt_low}` : `≤ ${test.opt_high}`}
                      {test.unit ? ` ${test.unit}` : ""}
                    </span>
                  </div>
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
                <CardTitle className="text-sm font-medium flex items-center justify-between gap-2 flex-wrap">
                  <span>History</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Date range pills */}
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

                    {/* Compare button + dropdown */}
                    {allTests.length > 1 && (
                      <div className="relative">
                        <button
                          onClick={() => setShowCompareDropdown(!showCompareDropdown)}
                          className={cn(
                            "h-6 px-2 text-xs rounded font-medium border transition-colors",
                            compareIds.length > 0
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:text-foreground"
                          )}
                        >
                          Compare{compareIds.length > 0 ? ` (${compareIds.length})` : ""}
                        </button>
                        {showCompareDropdown && (
                          <div className="absolute right-0 top-7 z-50 bg-popover border rounded-md shadow-lg p-2 min-w-[220px] max-h-[320px] overflow-y-auto">
                            <div className="text-xs font-medium text-muted-foreground mb-2 px-1">
                              Select up to 3 tests
                            </div>
                            {compareDropdownGroups.map(([category, categoryTests]) => (
                              <div key={category}>
                                <div className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wide px-1 py-1 mt-1">
                                  {category}
                                </div>
                                {categoryTests.map((t) => {
                                  const idx = compareIds.indexOf(t.canonical_name);
                                  const isChecked = idx !== -1;
                                  const isDisabled = !isChecked && compareIds.length >= 3;
                                  return (
                                    <label
                                      key={t.canonical_name}
                                      className={cn(
                                        "flex items-center gap-2 py-1 px-1 rounded cursor-pointer hover:bg-accent/50 text-xs",
                                        isDisabled && "opacity-40 cursor-not-allowed"
                                      )}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        disabled={isDisabled}
                                        onChange={(e) => {
                                          if (e.target.checked && compareIds.length < 3) {
                                            setCompareIds([...compareIds, t.canonical_name]);
                                          } else if (!e.target.checked) {
                                            setCompareIds(compareIds.filter((id) => id !== t.canonical_name));
                                          }
                                        }}
                                        className="h-3 w-3 shrink-0"
                                      />
                                      <span
                                        className={isChecked ? "font-medium" : ""}
                                        style={isChecked ? { color: COMPARE_COLORS[idx] } : undefined}
                                      >
                                        {t.display_name}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            ))}
                            {compareIds.length > 0 && (
                              <div className="border-t mt-2 pt-2">
                                <label className="flex items-center gap-2 py-1 px-1 cursor-pointer text-xs">
                                  <input
                                    type="checkbox"
                                    checked={normalizeComparison}
                                    onChange={(e) => setNormalizeComparison(e.target.checked)}
                                    className="h-3 w-3"
                                  />
                                  Normalize scales
                                </label>
                              </div>
                            )}
                            <button
                              onClick={() => setShowCompareDropdown(false)}
                              className="w-full mt-2 h-6 text-xs border rounded hover:bg-accent/50 transition-colors"
                            >
                              Done
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length < 2 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Not enough data in this date range.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartDataWithComparison} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
                        tickFormatter={compareIds.length > 0 && normalizeComparison ? () => "" : undefined}
                      />
                      <Tooltip content={tooltipContent} />

                      {/* Reference range band */}
                      {latestWithRange?.ref_low != null && latestWithRange?.ref_high != null && (() => {
                        const [dMin, dMax] = yDomain as [number, number];
                        const y1 = Math.max(latestWithRange.ref_low, dMin);
                        const y2 = Math.min(latestWithRange.ref_high, dMax);
                        if (y2 <= y1) return null;
                        return <ReferenceArea y1={y1} y2={y2} fill="#16a34a" fillOpacity={0.25} strokeOpacity={0} />;
                      })()}

                      {/* Optimal range band */}
                      {showOptimal && (test.opt_low != null || test.opt_high != null) && (() => {
                        const [dMin, dMax] = yDomain as [number, number];
                        const oLow = test.opt_low ?? dMin;
                        const oHigh = test.opt_high ?? dMax;
                        const y1 = Math.max(oLow, dMin);
                        const y2 = Math.min(oHigh, dMax);
                        if (y2 <= y1) return null;
                        return <ReferenceArea y1={y1} y2={y2} fill="#3b82f6" fillOpacity={0.18} strokeOpacity={0} />;
                      })()}

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

                      {/* Comparison lines (behind primary) */}
                      {compareIds.map((id, idx) => (
                        <Line
                          key={id}
                          type="monotone"
                          dataKey={`comp_${idx}`}
                          stroke={COMPARE_COLORS[idx]}
                          strokeWidth={1.5}
                          strokeDasharray="5 3"
                          dot={{ r: 3, fill: COMPARE_COLORS[idx], stroke: "var(--background)", strokeWidth: 1 }}
                          activeDot={{ r: 4 }}
                          isAnimationActive={false}
                          connectNulls
                        />
                      ))}

                      {/* Primary line */}
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={<ColoredDot />}
                        activeDot={{ r: 5 }}
                        isAnimationActive={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}

                {/* Comparison legend */}
                {compareIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {compareIds.map((id, idx) => {
                      const ct = allTests.find((t) => t.canonical_name === id);
                      if (!ct) return null;
                      return (
                        <button
                          key={id}
                          onClick={() => setCompareIds(compareIds.filter((cid) => cid !== id))}
                          className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border transition-colors hover:opacity-80"
                          style={{ borderColor: COMPARE_COLORS[idx], color: COMPARE_COLORS[idx] }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: COMPARE_COLORS[idx] }} />
                          {ct.display_name}
                          {ct.unit && ct.unit !== test.unit && (
                            <span className="opacity-60 text-[10px]">{ct.unit}</span>
                          )}
                          <span className="opacity-60 ml-0.5">×</span>
                        </button>
                      );
                    })}
                    {normalizeComparison && (
                      <span className="text-xs text-muted-foreground self-center">· scales normalized</span>
                    )}
                  </div>
                )}

                {test.trend !== "insufficient_data" && compareIds.length === 0 && (
                  <div className="mt-2 text-xs text-muted-foreground text-center">
                    {{ up: "↑ Trending up", down: "↓ Trending down", stable: "→ Stable", insufficient_data: "" }[test.trend]}{" "}
                    (comparing last two results)
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── All Results table ──────────────────────────────────────── */}
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
                      const dir = getDirection(h.value, h.ref_low, h.ref_high, h.in_range, test.opt_low, test.opt_high, showOptimal);
                      const refDisplay =
                        h.ref_low != null && h.ref_high != null ? `${h.ref_low} – ${h.ref_high}` :
                        h.ref_low != null ? `≥ ${h.ref_low}` :
                        h.ref_high != null ? `≤ ${h.ref_high}` :
                        h.ref_text ?? "—";
                      const isLoading = loadingVisitId === h.visit_id;
                      return (
                        <tr
                          key={i}
                          onClick={() => handleRowClick(h.visit_id)}
                          className={cn(
                            "border-b last:border-0 cursor-pointer transition-colors hover:bg-accent/40",
                            dir === "high" && "bg-red-500/5",
                            dir === "low" && "bg-blue-500/5",
                            dir === "suboptimal" && "bg-amber-500/5",
                            isLoading && "opacity-60",
                          )}
                        >
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {isLoading
                              ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin align-middle" />
                              : formatDate(h.visit_date)
                            }
                          </td>
                          <td className={cn("px-3 py-2 text-right font-mono font-semibold tabular-nums", DIRECTION_VALUE_COLOR[dir])}>
                            {h.value}{test.unit ? ` ${test.unit}` : ""}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground hidden sm:table-cell">
                            {refDisplay}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {dir === "normal" ? (
                              <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓</span>
                            ) : dir === "no-range" ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", DIRECTION_BADGE[dir])}>
                                {DIRECTION_LABEL[dir]}
                              </span>
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

    {visitSheet && (
      <LabVisitSheet
        open={visitSheet.open}
        onOpenChange={(v) => setVisitSheet((s) => s ? { ...s, open: v } : null)}
        visit={visitSheet.visit}
        initialMode="edit"
        onUpdated={() => setVisitSheet((s) => s ? { ...s, open: false } : null)}
        onDeleted={() => setVisitSheet((s) => s ? { ...s, open: false } : null)}
      />
    )}
    </>
  );
}
