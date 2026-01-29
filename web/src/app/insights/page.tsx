"use client";

import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type CorrelationInsight = {
  type: "checkbox_numeric";
  checkboxMetricId: string;
  checkboxMetricName: string;
  numericMetricId: string;
  numericMetricName: string;
  avgWhenTrue: number;
  avgWhenFalse: number;
  percentDiff: number;
  daysTrue: number;
  daysFalse: number;
  direction: "higher" | "lower";
};

type CheckboxCheckboxInsight = {
  type: "checkbox_checkbox";
  metricAId: string;
  metricAName: string;
  metricBId: string;
  metricBName: string;
  rateWhenATrue: number;
  rateWhenAFalse: number;
  percentDiff: number;
  daysATrue: number;
  daysAFalse: number;
};

type InsightsResponse = {
  checkboxNumeric: CorrelationInsight[];
  checkboxCheckbox: CheckboxCheckboxInsight[];
  totalDays: number;
  dateRange: { first: string; last: string } | null;
};

function formatPercent(val: number): string {
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(1)}%`;
}

function InsightCard({ insight }: { insight: CorrelationInsight }) {
  const isPositive = insight.direction === "higher";
  const color = isPositive
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";
  const bgColor = isPositive
    ? "bg-green-50 dark:bg-green-900/20"
    : "bg-red-50 dark:bg-red-900/20";

  return (
    <Card className="overflow-hidden">
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
          <div className={`text-right ${bgColor} rounded-lg p-3`}>
            <p className={`text-2xl font-bold ${color}`}>
              {formatPercent(insight.percentDiff)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {insight.direction}
            </p>
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
}: {
  insight: CheckboxCheckboxInsight;
}) {
  const isPositive = insight.percentDiff > 0;
  const color = isPositive
    ? "text-green-600 dark:text-green-400"
    : "text-amber-600 dark:text-amber-400";

  return (
    <Card>
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
        </div>

        <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Rate when A ✓</p>
            <p className="font-mono font-semibold">
              {insight.rateWhenATrue.toFixed(0)}%
            </p>
            <p className="text-xs text-muted-foreground">
              ({insight.daysATrue} days)
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Rate when A ✗</p>
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

export default function InsightsPage() {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPrivate, setShowPrivate] = useState(false);

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
        <h1 className="text-2xl font-bold mb-6">Correlation Insights</h1>
        <p className="text-muted-foreground">Analyzing your data...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Correlation Insights</h1>
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
          {error}
        </div>
      </main>
    );
  }

  const hasInsights =
    data &&
    (data.checkboxNumeric.length > 0 || data.checkboxCheckbox.length > 0);

  return (
    <main className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Correlation Insights</h1>
          {data?.dateRange && (
            <p className="text-sm text-muted-foreground mt-1">
              Based on {data.totalDays} days of data ({data.dateRange.first} to{" "}
              {data.dateRange.last})
            </p>
          )}
        </div>
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

      {!hasInsights ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-2">
              No significant correlations found yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Keep tracking! Insights require at least 7 days of data in each
              group (checkbox checked vs unchecked) and a difference of at least
              10%.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Checkbox → Numeric correlations */}
          {data && data.checkboxNumeric.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold">
                  Habits → Metrics
                </h2>
                <Badge variant="secondary">
                  {data.checkboxNumeric.length} found
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                How your daily habits correlate with numeric metrics
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {data.checkboxNumeric.map((insight, i) => (
                  <InsightCard key={i} insight={insight} />
                ))}
              </div>
            </section>
          )}

          {/* Checkbox → Checkbox correlations */}
          {data && data.checkboxCheckbox.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-lg font-semibold">
                  Habit Pairs
                </h2>
                <Badge variant="secondary">
                  {data.checkboxCheckbox.length} found
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Habits that tend to occur together (or not)
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {data.checkboxCheckbox.map((insight, i) => (
                  <CheckboxInsightCard key={i} insight={insight} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Methodology note */}
      <div className="mt-12 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
        <p className="font-medium mb-2">How this works</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Habits → Metrics:</strong> Compares the average of a numeric
            metric on days when a checkbox is checked vs unchecked.
          </li>
          <li>
            <strong>Habit Pairs:</strong> Shows how often two habits occur
            together vs separately.
          </li>
          <li>
            Only correlations with 7+ days in each group and 10%+ difference
            are shown.
          </li>
          <li>
            <em>Correlation ≠ causation.</em> These patterns suggest
            relationships but don&apos;t prove one thing causes another.
          </li>
        </ul>
      </div>
    </main>
  );
}
