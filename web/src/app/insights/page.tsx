"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InsightDetailSheet } from "@/components/insight-detail-sheet";
import { CustomInsightBuilder } from "@/components/custom-insight-builder";
import { CustomInsightCard } from "@/components/custom-insight-card";
import type {
  CorrelationInsight,
  CheckboxCheckboxInsight,
  NumericNumericInsight,
  TimeLaggedInsight,
  DayOfWeekInsight,
  TrendInsight,
  HistogramInsight,
  CumulativeInsight,
  YearOverYearInsight,
  StreakTimelineInsight,
  CandlestickInsight,
  InsightsResponse,
  CustomInsightConfig,
} from "@/types/insights";

const DISMISSED_KEY = "insights:dismissed";
const CUSTOM_KEY = "insights:custom";

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(ids)));
}

function getCustomInsights(): CustomInsightConfig[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomInsights(configs: CustomInsightConfig[]) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(configs));
}

function formatPercent(val: number): string {
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(1)}%`;
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

function DismissBtn({ id, onDismiss }: { id: string; onDismiss: (id: string) => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onDismiss(id); }}
      className="text-muted-foreground/40 hover:text-muted-foreground transition-colors text-sm leading-none"
      title="Dismiss this insight"
    >
      &times;
    </button>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function privateBorder(involvesPrivate: boolean): string {
  return involvesPrivate ? "border-purple-300/50 dark:border-purple-700/50" : "";
}

function InsightCard({
  insight,
  onDismiss,
  onClick,
}: {
  insight: CorrelationInsight;
  onDismiss: (id: string) => void;
  onClick: () => void;
}) {
  const hib = insight.numericHigherIsBetter !== false;
  const isHigher = insight.direction === "higher";
  const isGood = hib ? isHigher : !isHigher;
  const color = isGood
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";
  const bgColor = isGood
    ? "bg-green-50 dark:bg-green-900/20"
    : "bg-red-50 dark:bg-red-900/20";

  return (
    <Card
      className={`overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${privateBorder(insight.involvesPrivate)}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">When you</p>
            <p className="font-semibold text-lg mb-2">
              {insight.checkboxMetricName}
            </p>
            <p className="text-sm text-muted-foreground">your</p>
            <p className="font-medium">{insight.numericMetricName}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <DismissBtn id={insight.id} onDismiss={onDismiss} />
            <div className={`text-right ${bgColor} rounded-lg p-3`}>
              <p className={`text-2xl font-bold ${color}`}>
                {formatPercent(insight.percentDiff)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {insight.direction}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Avg when checked</p>
            <p className="font-mono font-semibold">{insight.avgWhenTrue}</p>
            <p className="text-xs text-muted-foreground">
              ({insight.daysTrue} days)
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Avg when not checked</p>
            <p className="font-mono font-semibold">{insight.avgWhenFalse}</p>
            <p className="text-xs text-muted-foreground">
              ({insight.daysFalse} days)
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CheckboxInsightCard({
  insight,
  onDismiss,
  onClick,
}: {
  insight: CheckboxCheckboxInsight;
  onDismiss: (id: string) => void;
  onClick: () => void;
}) {
  const isPositive = insight.percentDiff > 0;
  const color = isPositive
    ? "text-green-600 dark:text-green-400"
    : "text-amber-600 dark:text-amber-400";

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${privateBorder(insight.involvesPrivate)}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">
              Days you <span className="font-medium">{insight.metricAName}</span>
            </p>
            <p className="mt-2">
              you&apos;re{" "}
              <span className={`font-bold ${color}`}>
                {Math.abs(insight.percentDiff).toFixed(0)}%{" "}
                {isPositive ? "more" : "less"}
              </span>{" "}
              likely to also
            </p>
            <p className="font-semibold mt-1">{insight.metricBName}</p>
          </div>
          <DismissBtn id={insight.id} onDismiss={onDismiss} />
        </div>

        <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Rate when A checked</p>
            <p className="font-mono font-semibold">
              {insight.rateWhenATrue.toFixed(0)}%
            </p>
            <p className="text-xs text-muted-foreground">
              ({insight.daysATrue} days)
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Rate when A not</p>
            <p className="font-mono font-semibold">
              {insight.rateWhenAFalse.toFixed(0)}%
            </p>
            <p className="text-xs text-muted-foreground">
              ({insight.daysAFalse} days)
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NumericNumericCard({
  insight,
  onDismiss,
  onClick,
}: {
  insight: NumericNumericInsight;
  onDismiss: (id: string) => void;
  onClick: () => void;
}) {
  const isPositive = insight.direction === "positive";
  const color = isPositive
    ? "text-blue-600 dark:text-blue-400"
    : "text-orange-600 dark:text-orange-400";
  const strength =
    Math.abs(insight.correlation) >= 0.7
      ? "Strong"
      : Math.abs(insight.correlation) >= 0.5
      ? "Moderate"
      : "Weak";

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${privateBorder(insight.involvesPrivate)}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="font-semibold">{insight.metricAName}</p>
            <p className="text-sm text-muted-foreground my-1">
              {isPositive ? "rises with" : "falls when"}
            </p>
            <p className="font-semibold">{insight.metricBName}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <DismissBtn id={insight.id} onDismiss={onDismiss} />
            <div className="text-right">
              <p className={`text-2xl font-bold font-mono ${color}`}>
                {insight.correlation > 0 ? "+" : ""}
                {insight.correlation.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {strength} &middot; {insight.daysOverlap} days
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TimeLaggedCard({
  insight,
  onDismiss,
  onClick,
}: {
  insight: TimeLaggedInsight;
  onDismiss: (id: string) => void;
  onClick: () => void;
}) {
  const hib = insight.outcomeHigherIsBetter !== false;
  const isHigher = insight.direction === "higher";
  const isGood = hib ? isHigher : !isHigher;
  const color = isGood
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";
  const bgColor = isGood
    ? "bg-green-50 dark:bg-green-900/20"
    : "bg-red-50 dark:bg-red-900/20";

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${privateBorder(insight.involvesPrivate)}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">
              The day after you
            </p>
            <p className="font-semibold text-lg mb-2">
              {insight.triggerMetricName}
            </p>
            <p className="text-sm text-muted-foreground">your</p>
            <p className="font-medium">{insight.outcomeMetricName}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <DismissBtn id={insight.id} onDismiss={onDismiss} />
            <div className={`text-right ${bgColor} rounded-lg p-3`}>
              <p className={`text-2xl font-bold ${color}`}>
                {formatPercent(insight.percentDiff)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {insight.direction}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Next-day avg when checked</p>
            <p className="font-mono font-semibold">
              {insight.avgNextDayWhenTrue}
            </p>
            <p className="text-xs text-muted-foreground">
              ({insight.daysTrue} days)
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Next-day avg when not</p>
            <p className="font-mono font-semibold">
              {insight.avgNextDayWhenFalse}
            </p>
            <p className="text-xs text-muted-foreground">
              ({insight.daysFalse} days)
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DayOfWeekCard({
  insight,
  onDismiss,
  onClick,
}: {
  insight: DayOfWeekInsight;
  onDismiss: (id: string) => void;
  onClick: () => void;
}) {
  const maxAvg = Math.max(...insight.dayAverages.map((d) => d.avg));

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${privateBorder(insight.involvesPrivate)}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{insight.metricName}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Best:{" "}
              <span className="text-green-600 dark:text-green-400 font-medium">
                {insight.bestDay} ({formatValue(insight.bestAvg, insight.metricType)})
              </span>
              {" "}&middot; Worst:{" "}
              <span className="text-red-600 dark:text-red-400 font-medium">
                {insight.worstDay} ({formatValue(insight.worstAvg, insight.metricType)})
              </span>
            </p>
          </div>
          <DismissBtn id={insight.id} onDismiss={onDismiss} />
        </div>

        <div className="mt-4 pt-4 border-t flex items-end gap-1" style={{ height: 80 }}>
          {insight.dayAverages.map((d) => {
            const pct = maxAvg > 0 ? d.avg / maxAvg : 0;
            const barHeightPx = Math.max(pct * 48, 2);
            const isBest = d.day === insight.bestDay;
            const isWorst = d.day === insight.worstDay;
            const barColor = isBest
              ? "bg-green-500 dark:bg-green-400"
              : isWorst
              ? "bg-red-400 dark:bg-red-500"
              : "bg-muted-foreground/30";
            return (
              <div
                key={d.day}
                className="flex-1 flex flex-col items-center justify-end gap-0.5"
                style={{ height: 80 }}
              >
                <div
                  className={`w-full rounded-sm ${barColor}`}
                  style={{ height: barHeightPx }}
                  title={`${d.day}: ${formatValue(d.avg, insight.metricType)}`}
                />
                <span className="text-[10px] text-muted-foreground">
                  {d.day.slice(0, 2)}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function TrendCard({
  insight,
  onDismiss,
  onClick,
}: {
  insight: TrendInsight;
  onDismiss: (id: string) => void;
  onClick: () => void;
}) {
  const hib = insight.higherIsBetter !== false;
  const isUp = insight.direction === "up";
  const isGood = hib ? isUp : !isUp;
  const color = isGood
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";
  const arrow = isUp ? "\u2191" : "\u2193";

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${privateBorder(insight.involvesPrivate)}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="font-semibold">{insight.metricName}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Last 30 days vs prior 30 days
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <DismissBtn id={insight.id} onDismiss={onDismiss} />
            <p className={`text-2xl font-bold ${color}`}>
              {arrow} {formatPercent(insight.percentChange)}
            </p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Recent avg</p>
            <p className="font-mono font-semibold">{formatValue(insight.recentAvg, insight.metricType)}</p>
            <p className="text-xs text-muted-foreground">
              ({insight.recentDays} days)
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Prior avg</p>
            <p className="font-mono font-semibold">{formatValue(insight.priorAvg, insight.metricType)}</p>
            <p className="text-xs text-muted-foreground">
              ({insight.priorDays} days)
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HistogramCard({
  insight,
  onDismiss,
  onClick,
}: {
  insight: HistogramInsight;
  onDismiss: (id: string) => void;
  onClick: () => void;
}) {
  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${privateBorder(insight.involvesPrivate)}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="font-semibold">{insight.metricName}</p>
            <p className="text-sm text-muted-foreground mt-1">Distribution</p>
          </div>
          <DismissBtn id={insight.id} onDismiss={onDismiss} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Mean</p>
            <p className="font-mono font-semibold">{formatValue(insight.mean, insight.metricType)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Std Dev</p>
            <p className="font-mono font-semibold">{formatValue(insight.stdDev, insight.metricType)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Count</p>
            <p className="font-mono font-semibold">{insight.count}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CumulativeCard({
  insight,
  onDismiss,
  onClick,
}: {
  insight: CumulativeInsight;
  onDismiss: (id: string) => void;
  onClick: () => void;
}) {
  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${privateBorder(insight.involvesPrivate)}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="font-semibold">{insight.metricName}</p>
            <p className="text-sm text-muted-foreground mt-1">Running Total</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <DismissBtn id={insight.id} onDismiss={onDismiss} />
            <p className="text-2xl font-bold font-mono">
              {formatValue(insight.currentTotal, insight.metricType)}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Daily Rate</p>
            <p className="font-mono font-semibold">{formatValue(insight.dailyRate, insight.metricType)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Year-End Est.</p>
            <p className="font-mono font-semibold">{formatValue(insight.projectedYearEnd, insight.metricType)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function YearOverYearCard({
  insight,
  onDismiss,
  onClick,
}: {
  insight: YearOverYearInsight;
  onDismiss: (id: string) => void;
  onClick: () => void;
}) {
  const hib = insight.higherIsBetter !== false;
  const isUp = insight.percentChange > 0;
  const isGood = hib ? isUp : !isUp;
  const color = isGood
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${privateBorder(insight.involvesPrivate)}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="font-semibold">{insight.metricName}</p>
            <p className="text-sm text-muted-foreground mt-1">{insight.yearRange}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <DismissBtn id={insight.id} onDismiss={onDismiss} />
            <p className={`text-2xl font-bold ${color}`}>
              {formatPercent(insight.percentChange)}
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Current Year</p>
            <p className="font-mono font-semibold">{formatValue(insight.currentYearAvg, insight.metricType)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Prior Year</p>
            <p className="font-mono font-semibold">{formatValue(insight.priorYearAvg, insight.metricType)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StreakTimelineCard({
  insight,
  onDismiss,
  onClick,
}: {
  insight: StreakTimelineInsight;
  onDismiss: (id: string) => void;
  onClick: () => void;
}) {
  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${privateBorder(insight.involvesPrivate)}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="font-semibold">{insight.metricName}</p>
            <p className="text-sm text-muted-foreground mt-1">Streak Analysis</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <DismissBtn id={insight.id} onDismiss={onDismiss} />
            <p className="text-2xl font-bold font-mono">
              {insight.currentStreak}
              <span className="text-sm font-normal text-muted-foreground ml-1">current</span>
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Longest</p>
            <p className="font-mono font-semibold">{insight.longestStreak} days</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Average</p>
            <p className="font-mono font-semibold">{insight.averageStreak} days</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CandlestickCard({
  insight,
  onDismiss,
  onClick,
}: {
  insight: CandlestickInsight;
  onDismiss: (id: string) => void;
  onClick: () => void;
}) {
  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${privateBorder(insight.involvesPrivate)}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="font-semibold">{insight.metricName}</p>
            <p className="text-sm text-muted-foreground mt-1">Volatility</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <DismissBtn id={insight.id} onDismiss={onDismiss} />
            <p className="text-2xl font-bold font-mono">
              {(insight.volatility * 100).toFixed(0)}%
              <span className="text-sm font-normal text-muted-foreground ml-1">CV</span>
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Recent Range</p>
            <p className="font-mono font-semibold">{formatValue(insight.recentRange, insight.metricType)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Recent Close</p>
            <p className="font-mono font-semibold">{formatValue(insight.recentClose, insight.metricType)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({
  title,
  subtitle,
  count,
  expanded,
  onToggle,
}: {
  title: string;
  subtitle: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 mb-2 w-full text-left"
      >
        <ChevronIcon expanded={expanded} />
        <h2 className="text-lg font-semibold">{title}</h2>
        <Badge variant="secondary">{count} found</Badge>
      </button>
      {expanded && (
        <p className="text-sm text-muted-foreground mb-4 ml-6">{subtitle}</p>
      )}
    </>
  );
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPrivate, setShowPrivate] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [customInsights, setCustomInsights] = useState<CustomInsightConfig[]>([]);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<CustomInsightConfig | null>(null);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    custom: true,
    trends: true,
    cumulative: true,
    dayOfWeek: true,
    histograms: true,
    candlesticks: true,
    streakTimelines: true,
    numericNumeric: true,
    yearOverYear: true,
    timeLagged: true,
    checkboxNumeric: true,
    checkboxCheckbox: true,
  });

  const toggleSection = useCallback((key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState<{
    type: string;
    id: string;
    metricIds: string[];
    metricNames: string[];
  } | null>(null);

  const openDetail = useCallback(
    (type: string, id: string, metricIds: string[], metricNames: string[]) => {
      setSelectedInsight({ type, id, metricIds, metricNames });
      setSheetOpen(true);
    },
    []
  );

  useEffect(() => {
    setDismissed(getDismissed());
    setCustomInsights(getCustomInsights());
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      const next = new Set(dismissed);
      next.add(id);
      setDismissed(next);
      saveDismissed(next);
    },
    [dismissed]
  );

  const resetDismissed = useCallback(() => {
    setDismissed(new Set());
    saveDismissed(new Set());
  }, []);

  const handleSaveCustom = useCallback((config: CustomInsightConfig) => {
    setCustomInsights((prev) => {
      const existing = prev.findIndex((c) => c.id === config.id);
      let next: CustomInsightConfig[];
      if (existing >= 0) {
        next = [...prev];
        next[existing] = config;
      } else {
        next = [...prev, config];
      }
      saveCustomInsights(next);
      return next;
    });
    setEditingConfig(null);
  }, []);

  const handleDeleteCustom = useCallback((id: string) => {
    setCustomInsights((prev) => {
      const next = prev.filter((c) => c.id !== id);
      saveCustomInsights(next);
      return next;
    });
  }, []);

  const handleEditCustom = useCallback((config: CustomInsightConfig) => {
    setEditingConfig(config);
    setBuilderOpen(true);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/insights${showPrivate ? "?showPrivate=true" : ""}`,
          { headers }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load insights");
        setData(json);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    })();
  }, [showPrivate]);

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Insights</h1>
        <p className="text-muted-foreground">Analyzing your data...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Insights</h1>
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
          {error}
        </div>
      </main>
    );
  }

  const visibleTrends =
    data?.trends?.filter((i) => !dismissed.has(i.id)) ?? [];
  const visibleDOW =
    data?.dayOfWeek?.filter((i) => !dismissed.has(i.id)) ?? [];
  const visibleNN =
    data?.numericNumeric?.filter((i) => !dismissed.has(i.id)) ?? [];
  const visibleTimeLagged =
    data?.timeLagged?.filter((i) => !dismissed.has(i.id)) ?? [];
  const visibleNumeric =
    data?.checkboxNumeric?.filter((i) => !dismissed.has(i.id)) ?? [];
  const visibleCheckbox =
    data?.checkboxCheckbox?.filter((i) => !dismissed.has(i.id)) ?? [];
  const visibleHistograms =
    data?.histograms?.filter((i) => !dismissed.has(i.id)) ?? [];
  const visibleCumulative =
    data?.cumulative?.filter((i) => !dismissed.has(i.id)) ?? [];
  const visibleYoY =
    data?.yearOverYear?.filter((i) => !dismissed.has(i.id)) ?? [];
  const visibleStreaks =
    data?.streakTimelines?.filter((i) => !dismissed.has(i.id)) ?? [];
  const visibleCandlesticks =
    data?.candlesticks?.filter((i) => !dismissed.has(i.id)) ?? [];

  const hasInsights =
    customInsights.length > 0 ||
    visibleTrends.length > 0 ||
    visibleCumulative.length > 0 ||
    visibleDOW.length > 0 ||
    visibleHistograms.length > 0 ||
    visibleCandlesticks.length > 0 ||
    visibleStreaks.length > 0 ||
    visibleNN.length > 0 ||
    visibleYoY.length > 0 ||
    visibleTimeLagged.length > 0 ||
    visibleNumeric.length > 0 ||
    visibleCheckbox.length > 0;
  const dismissedCount = dismissed.size;

  return (
    <main className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Insights</h1>
          {data?.dateRange && (
            <p className="text-sm text-muted-foreground mt-1">
              Based on {data.totalDays} days of data ({data.dateRange.first} to{" "}
              {data.dateRange.last})
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          {dismissedCount > 0 && (
            <button
              onClick={resetDismissed}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Show {dismissedCount} dismissed
            </button>
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={showPrivate}
              onChange={(e) => setShowPrivate(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            Show private
          </label>
        </div>
      </div>

      {!hasInsights ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-2">
              No significant insights found yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Keep tracking! Insights require sufficient data and meaningful
              differences to appear.
            </p>
            <button
              onClick={() => setBuilderOpen(true)}
              className="mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              + Create a custom insight
            </button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* 1. Custom Insights - always visible */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => toggleSection("custom")}
                className="flex items-center gap-2 text-left"
              >
                <ChevronIcon expanded={expanded.custom} />
                <h2 className="text-lg font-semibold">Custom Insights</h2>
              </button>
              <button
                onClick={() => { setEditingConfig(null); setBuilderOpen(true); }}
                className="ml-2 px-2 py-0.5 rounded text-sm border border-dashed border-muted-foreground/40 text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
              >
                + New
              </button>
              {customInsights.length > 0 && (
                <Badge variant="secondary">{customInsights.length}</Badge>
              )}
            </div>
            {expanded.custom && (
              <>
                {customInsights.length === 0 ? (
                  <p className="text-sm text-muted-foreground ml-6 mb-4">
                    Create custom charts for any metric. Click &quot;+ New&quot; to get started.
                  </p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {customInsights.map((config) => (
                      <CustomInsightCard
                        key={config.id}
                        config={config}
                        showPrivate={showPrivate}
                        onEdit={() => handleEditCustom(config)}
                        onDelete={() => handleDeleteCustom(config.id)}
                        onClick={() =>
                          openDetail(config.chartType, config.id, [config.metricId], [config.metricName])
                        }
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {/* 2. Recent Trends */}
          {visibleTrends.length > 0 && (
            <section>
              <SectionHeader
                title="Recent Trends"
                subtitle="Metrics shifting compared to the prior period"
                count={visibleTrends.length}
                expanded={expanded.trends}
                onToggle={() => toggleSection("trends")}
              />
              {expanded.trends && (
                <div className="grid gap-4 md:grid-cols-2">
                  {visibleTrends.map((insight) => (
                    <TrendCard
                      key={insight.id}
                      insight={insight}
                      onDismiss={dismiss}
                      onClick={() =>
                        openDetail("trend", insight.id, [insight.metricId], [insight.metricName])
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 3. Cumulative Totals */}
          {visibleCumulative.length > 0 && (
            <section>
              <SectionHeader
                title="Cumulative Totals"
                subtitle="Running totals and year-end projections"
                count={visibleCumulative.length}
                expanded={expanded.cumulative}
                onToggle={() => toggleSection("cumulative")}
              />
              {expanded.cumulative && (
                <div className="grid gap-4 md:grid-cols-2">
                  {visibleCumulative.map((insight) => (
                    <CumulativeCard
                      key={insight.id}
                      insight={insight}
                      onDismiss={dismiss}
                      onClick={() =>
                        openDetail("cumulative", insight.id, [insight.metricId], [insight.metricName])
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 4. Weekly Patterns */}
          {visibleDOW.length > 0 && (
            <section>
              <SectionHeader
                title="Weekly Patterns"
                subtitle="How your metrics vary by day of the week"
                count={visibleDOW.length}
                expanded={expanded.dayOfWeek}
                onToggle={() => toggleSection("dayOfWeek")}
              />
              {expanded.dayOfWeek && (
                <div className="grid gap-4 md:grid-cols-2">
                  {visibleDOW.map((insight) => (
                    <DayOfWeekCard
                      key={insight.id}
                      insight={insight}
                      onDismiss={dismiss}
                      onClick={() =>
                        openDetail("day_of_week", insight.id, [insight.metricId], [insight.metricName])
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 5. Value Distribution (histogram) */}
          {visibleHistograms.length > 0 && (
            <section>
              <SectionHeader
                title="Value Distribution"
                subtitle="How your metric values are distributed"
                count={visibleHistograms.length}
                expanded={expanded.histograms}
                onToggle={() => toggleSection("histograms")}
              />
              {expanded.histograms && (
                <div className="grid gap-4 md:grid-cols-2">
                  {visibleHistograms.map((insight) => (
                    <HistogramCard
                      key={insight.id}
                      insight={insight}
                      onDismiss={dismiss}
                      onClick={() =>
                        openDetail("histogram", insight.id, [insight.metricId], [insight.metricName])
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 6. Volatility (candlestick) */}
          {visibleCandlesticks.length > 0 && (
            <section>
              <SectionHeader
                title="Volatility"
                subtitle="Metrics with high variation over time"
                count={visibleCandlesticks.length}
                expanded={expanded.candlesticks}
                onToggle={() => toggleSection("candlesticks")}
              />
              {expanded.candlesticks && (
                <div className="grid gap-4 md:grid-cols-2">
                  {visibleCandlesticks.map((insight) => (
                    <CandlestickCard
                      key={insight.id}
                      insight={insight}
                      onDismiss={dismiss}
                      onClick={() =>
                        openDetail("candlestick", insight.id, [insight.metricId], [insight.metricName])
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 7. Streak Analysis */}
          {visibleStreaks.length > 0 && (
            <section>
              <SectionHeader
                title="Streak Analysis"
                subtitle="Consecutive day patterns in your metrics"
                count={visibleStreaks.length}
                expanded={expanded.streakTimelines}
                onToggle={() => toggleSection("streakTimelines")}
              />
              {expanded.streakTimelines && (
                <div className="grid gap-4 md:grid-cols-2">
                  {visibleStreaks.map((insight) => (
                    <StreakTimelineCard
                      key={insight.id}
                      insight={insight}
                      onDismiss={dismiss}
                      onClick={() =>
                        openDetail("streak_timeline", insight.id, [insight.metricId], [insight.metricName])
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 8. Metric Correlations */}
          {visibleNN.length > 0 && (
            <section>
              <SectionHeader
                title="Metric Correlations"
                subtitle="Numeric metrics that move together"
                count={visibleNN.length}
                expanded={expanded.numericNumeric}
                onToggle={() => toggleSection("numericNumeric")}
              />
              {expanded.numericNumeric && (
                <div className="grid gap-4 md:grid-cols-2">
                  {visibleNN.map((insight) => (
                    <NumericNumericCard
                      key={insight.id}
                      insight={insight}
                      onDismiss={dismiss}
                      onClick={() =>
                        openDetail(
                          "numeric_numeric",
                          insight.id,
                          [insight.metricAId, insight.metricBId],
                          [insight.metricAName, insight.metricBName]
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 9. Year-over-Year */}
          {visibleYoY.length > 0 && (
            <section>
              <SectionHeader
                title="Year-over-Year"
                subtitle="How metrics compare across calendar years"
                count={visibleYoY.length}
                expanded={expanded.yearOverYear}
                onToggle={() => toggleSection("yearOverYear")}
              />
              {expanded.yearOverYear && (
                <div className="grid gap-4 md:grid-cols-2">
                  {visibleYoY.map((insight) => (
                    <YearOverYearCard
                      key={insight.id}
                      insight={insight}
                      onDismiss={dismiss}
                      onClick={() =>
                        openDetail("year_over_year", insight.id, [insight.metricId], [insight.metricName])
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 10. Next-Day Effects */}
          {visibleTimeLagged.length > 0 && (
            <section>
              <SectionHeader
                title="Next-Day Effects"
                subtitle="How today&apos;s habits affect tomorrow&apos;s metrics"
                count={visibleTimeLagged.length}
                expanded={expanded.timeLagged}
                onToggle={() => toggleSection("timeLagged")}
              />
              {expanded.timeLagged && (
                <div className="grid gap-4 md:grid-cols-2">
                  {visibleTimeLagged.map((insight) => (
                    <TimeLaggedCard
                      key={insight.id}
                      insight={insight}
                      onDismiss={dismiss}
                      onClick={() =>
                        openDetail(
                          "time_lagged",
                          insight.id,
                          [insight.triggerMetricId, insight.outcomeMetricId],
                          [insight.triggerMetricName, insight.outcomeMetricName]
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 11. Habits -> Metrics */}
          {visibleNumeric.length > 0 && (
            <section>
              <SectionHeader
                title="Habits &rarr; Metrics"
                subtitle="How your daily habits correlate with numeric metrics"
                count={visibleNumeric.length}
                expanded={expanded.checkboxNumeric}
                onToggle={() => toggleSection("checkboxNumeric")}
              />
              {expanded.checkboxNumeric && (
                <div className="grid gap-4 md:grid-cols-2">
                  {visibleNumeric.map((insight) => (
                    <InsightCard
                      key={insight.id}
                      insight={insight}
                      onDismiss={dismiss}
                      onClick={() =>
                        openDetail(
                          "checkbox_numeric",
                          insight.id,
                          [insight.checkboxMetricId, insight.numericMetricId],
                          [insight.checkboxMetricName, insight.numericMetricName]
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 12. Habit Pairs */}
          {visibleCheckbox.length > 0 && (
            <section>
              <SectionHeader
                title="Habit Pairs"
                subtitle="Habits that tend to occur together (or not)"
                count={visibleCheckbox.length}
                expanded={expanded.checkboxCheckbox}
                onToggle={() => toggleSection("checkboxCheckbox")}
              />
              {expanded.checkboxCheckbox && (
                <div className="grid gap-4 md:grid-cols-2">
                  {visibleCheckbox.map((insight) => (
                    <CheckboxInsightCard
                      key={insight.id}
                      insight={insight}
                      onDismiss={dismiss}
                      onClick={() =>
                        openDetail(
                          "checkbox_checkbox",
                          insight.id,
                          [insight.metricAId, insight.metricBId],
                          [insight.metricAName, insight.metricBName]
                        )
                      }
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Methodology note */}
      <div className="mt-12 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
        <p className="font-medium mb-2">How this works</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Recent Trends:</strong> Compares the last 30 days to the
            prior 30 days.
          </li>
          <li>
            <strong>Cumulative Totals:</strong> Running totals with daily rate
            and year-end projections.
          </li>
          <li>
            <strong>Weekly Patterns:</strong> Compares each day&apos;s average
            to the overall average (needs 4+ data points per day).
          </li>
          <li>
            <strong>Value Distribution:</strong> Histogram showing how metric
            values are spread (needs 30+ data points).
          </li>
          <li>
            <strong>Volatility:</strong> Candlestick charts showing weekly/monthly
            open-high-low-close patterns.
          </li>
          <li>
            <strong>Streak Analysis:</strong> Consecutive day patterns showing
            current, longest, and average streaks.
          </li>
          <li>
            <strong>Metric Correlations:</strong> Pearson correlation between
            numeric metrics. Values near +1 or -1 indicate strong relationships.
          </li>
          <li>
            <strong>Year-over-Year:</strong> Compares metric averages across
            calendar years (needs 60+ days per year).
          </li>
          <li>
            <strong>Next-Day Effects:</strong> Compares tomorrow&apos;s metric
            average based on whether you checked a habit today.
          </li>
          <li>
            <strong>Habits &rarr; Metrics:</strong> Compares the average of a
            numeric metric on days when a checkbox is checked vs unchecked.
          </li>
          <li>
            <strong>Habit Pairs:</strong> Shows how often two habits occur
            together vs separately.
          </li>
          <li>
            <em>Correlation &ne; causation.</em> These patterns suggest
            relationships but don&apos;t prove one thing causes another.
          </li>
        </ul>
      </div>

      <InsightDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        insightType={selectedInsight?.type ?? null}
        insightId={selectedInsight?.id ?? null}
        metricIds={selectedInsight?.metricIds ?? []}
        metricNames={selectedInsight?.metricNames ?? []}
        showPrivate={showPrivate}
      />

      <CustomInsightBuilder
        open={builderOpen}
        onOpenChange={(open) => {
          setBuilderOpen(open);
          if (!open) setEditingConfig(null);
        }}
        onSave={handleSaveCustom}
        editingConfig={editingConfig}
      />
    </main>
  );
}
