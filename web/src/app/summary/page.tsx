"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { getLocalDateString } from "@/lib/dateUtils";
import { PeriodSelector, PeriodType } from "@/components/summary/period-selector";
import { MetricSummaryCard, MetricSummary } from "@/components/summary/metric-summary-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

type SummaryResponse = {
  period: {
    type: PeriodType;
    start: string;
    end: string;
    prev_start: string;
    prev_end: string;
  };
  metrics: MetricSummary[];
  achievements: { type: string; metric: string; value: number; date: string; direction: string }[];
  summary: {
    days_logged: number;
    total_days: number;
  };
};

function formatPeriodLabel(type: PeriodType, start: string, end: string): string {
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");

  switch (type) {
    case "week": {
      const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
      return `${startDate.toLocaleDateString("en-US", options)} - ${endDate.toLocaleDateString(
        "en-US",
        options
      )}, ${endDate.getFullYear()}`;
    }
    case "month":
      return startDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    case "quarter": {
      const q = Math.floor(startDate.getMonth() / 3) + 1;
      return `Q${q} ${startDate.getFullYear()}`;
    }
    case "year":
      return String(startDate.getFullYear());
  }
}

function navigatePeriod(type: PeriodType, currentDate: string, direction: 1 | -1): string {
  const [year, month, day] = currentDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);

  switch (type) {
    case "week":
      d.setDate(d.getDate() + direction * 7);
      break;
    case "month":
      d.setMonth(d.getMonth() + direction);
      break;
    case "quarter":
      d.setMonth(d.getMonth() + direction * 3);
      break;
    case "year":
      d.setFullYear(d.getFullYear() + direction);
      break;
  }

  return getLocalDateString(d);
}

export default function SummaryPage() {
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [referenceDate, setReferenceDate] = useState(getLocalDateString());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [showPrivate, setShowPrivate] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({
        type: periodType,
        date: referenceDate,
        show_private: showPrivate ? "true" : "false",
      });

      const res = await fetch(`/api/summary?${params}`, { headers });
      const result = await res.json();

      if (!res.ok) throw new Error(result?.error || "Failed to load summary");

      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [periodType, referenceDate, showPrivate]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const periodLabel = useMemo(() => {
    if (!data) return "";
    return formatPeriodLabel(data.period.type, data.period.start, data.period.end);
  }, [data]);

  const canGoNext = useMemo(() => {
    if (!data) return false;
    return data.period.end < getLocalDateString();
  }, [data]);

  const handlePrevious = useCallback(() => {
    setReferenceDate((d) => navigatePeriod(periodType, d, -1));
  }, [periodType]);

  const handleNext = useCallback(() => {
    setReferenceDate((d) => navigatePeriod(periodType, d, 1));
  }, [periodType]);

  const handleTypeChange = useCallback((type: PeriodType) => {
    setPeriodType(type);
    setReferenceDate(getLocalDateString()); // Reset to current period
  }, []);

  const handleDateSelect = useCallback((date: string) => {
    setReferenceDate(date);
  }, []);

  if (loading && !data) {
    return (
      <main className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Summary</h1>
        <div className="text-sm text-muted-foreground">Loading...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Summary</h1>
        <div className="text-sm text-red-600">Error: {error}</div>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Sticky header with period selector */}
      <div className="sticky top-0 z-10 bg-background pb-4 -mx-6 px-6 pt-2 border-b">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Summary</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show Private</span>
            <Switch checked={showPrivate} onCheckedChange={setShowPrivate} />
          </div>
        </div>
        <PeriodSelector
          type={periodType}
          onTypeChange={handleTypeChange}
          onPrevious={handlePrevious}
          onNext={handleNext}
          canGoNext={canGoNext}
          periodLabel={periodLabel}
          currentStart={data?.period.start || referenceDate}
          onDateSelect={handleDateSelect}
        />
      </div>

      {data && (
        <>
          {/* Overview cards */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold font-mono">{data.summary.days_logged}</div>
                <div className="text-sm text-muted-foreground">Days Logged</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold font-mono">{data.summary.total_days}</div>
                <div className="text-sm text-muted-foreground">Total Days</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold font-mono">{data.metrics.length}</div>
                <div className="text-sm text-muted-foreground">Metrics Tracked</div>
              </CardContent>
            </Card>
          </div>

          {/* Achievements */}
          {data.achievements.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">Notable Achievements</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <div className="flex flex-wrap gap-2">
                  {data.achievements.map((a, i) => (
                    <Badge key={i} variant="default" className="text-sm py-1 px-3">
                      {a.type === "all_time_high" && "🏆"}
                      {a.type === "all_time_low" && "📉"}
                      {" "}{a.metric}: {a.value} ({a.date})
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Metric cards */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Metrics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.metrics.map((m) => (
                <MetricSummaryCard key={m.metric_id} metric={m} />
              ))}
            </div>
            {data.metrics.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">
                No data logged for this period.
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
