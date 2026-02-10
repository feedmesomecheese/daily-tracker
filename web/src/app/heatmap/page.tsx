"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import {
  CalendarHeatmap,
  HeatmapDataPoint,
  getHeatmapLegendColors,
  formatHHMM,
  formatDuration,
} from "@/components/calendar-heatmap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DailyGoal = {
  type: "numeric" | "numeric_threshold" | "checkbox" | "hhmm_target";
  target?: number;
  threshold?: number;
  target_time?: number;
  target_count?: number;
  direction?: "gte" | "lte" | "before" | "after";
  measure?: "sum" | "average";
};

type ConfigRow = {
  metric_id: string;
  metric_name: string;
  type: "number" | "checkbox" | "hhmm" | "time" | "score" | "count" | "text";
  active: boolean;
  analytics_config?: {
    higher_is_better?: boolean;
    direction?: "increase" | "decrease" | "neutral";
  } | null;
  goals_config?: {
    goals?: Array<{
      id: string;
      name: string;
      frequency: "daily" | "weekly" | "monthly";
      enabled: boolean;
      type: string;
      target?: number;
      threshold?: number;
      target_time?: number;
      target_count?: number;
      direction?: string;
      measure?: string;
    }>;
  } | null;
};

type LogRow = {
  date: string;
  metric_id: string;
  value: number | null;
};

function formatValue(value: number, type: string): string {
  switch (type) {
    case "hhmm":
      return formatHHMM(value);
    case "time":
      return formatDuration(value);
    case "checkbox":
      return value >= 0.5 ? "Yes" : "No";
    default:
      return String(Math.round(value * 100) / 100);
  }
}

// Check if a value meets a daily goal
function checkDailyGoal(value: number, goal: DailyGoal, metricType: string): boolean {
  switch (goal.type) {
    case "numeric":
      if (goal.direction === "lte") {
        return value <= (goal.target ?? 0);
      }
      return value >= (goal.target ?? 0);
    case "numeric_threshold":
      if (goal.direction === "lte") {
        return value <= (goal.threshold ?? 0);
      }
      return value >= (goal.threshold ?? 0);
    case "checkbox":
      return value >= 0.5;
    case "hhmm_target":
      if (goal.direction === "before") {
        return value <= (goal.target_time ?? 0);
      }
      return value >= (goal.target_time ?? 0);
    default:
      return false;
  }
}

export default function HeatmapPage() {
  const [config, setConfig] = useState<ConfigRow[]>([]);
  const [logData, setLogData] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [hoveredCell, setHoveredCell] = useState<{ date: string; value: number } | null>(null);

  // Load config on mount
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const headers = await getAuthHeaders();

        const cfgRes = await fetch("/api/config", { headers });
        const cfgData = await cfgRes.json();

        if (!cfgRes.ok) throw new Error(cfgData?.error || "Failed to load config");

        // Filter to active non-text metrics
        const activeMetrics = (cfgData as ConfigRow[]).filter(
          (m) => m.active && m.type !== "text"
        );
        setConfig(activeMetrics);

        // Default to first metric if not selected
        if (activeMetrics.length > 0 && !selectedMetric) {
          setSelectedMetric(activeMetrics[0].metric_id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Load log data for selected year (with year filter for performance)
  useEffect(() => {
    if (!selectedMetric) return;

    (async () => {
      try {
        const headers = await getAuthHeaders();
        const logRes = await fetch(`/api/log?year=${selectedYear}`, { headers });
        const logDataRes = await logRes.json();

        if (!logRes.ok) throw new Error(logDataRes?.error || "Failed to load logs");
        setLogData(logDataRes);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [selectedYear, selectedMetric]);

  // Available years - show current year and previous 5 years
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) {
      years.push(y);
    }
    return years;
  }, []);

  // Get selected metric config
  const selectedConfig = useMemo(() => {
    return config.find((c) => c.metric_id === selectedMetric);
  }, [config, selectedMetric]);

  // Get daily goal for selected metric (if any)
  const dailyGoal = useMemo((): DailyGoal | null => {
    const goals = selectedConfig?.goals_config?.goals;
    if (!goals) return null;

    const daily = goals.find((g) => g.frequency === "daily" && g.enabled);
    if (!daily) return null;

    return {
      type: daily.type as DailyGoal["type"],
      target: daily.target,
      threshold: daily.threshold,
      target_time: daily.target_time,
      target_count: daily.target_count,
      direction: daily.direction as DailyGoal["direction"],
      measure: daily.measure as DailyGoal["measure"],
    };
  }, [selectedConfig]);

  // Prepare heatmap data for selected metric with goal achievement info
  const heatmapData = useMemo((): HeatmapDataPoint[] => {
    if (!selectedMetric) return [];
    const metricType = selectedConfig?.type || "number";

    return logData
      .filter((l) => l.metric_id === selectedMetric && l.value != null)
      .map((l) => ({
        date: l.date,
        value: l.value!,
        goalMet: dailyGoal ? checkDailyGoal(l.value!, dailyGoal, metricType) : undefined,
      }));
  }, [logData, selectedMetric, selectedConfig, dailyGoal]);

  // Determine direction (default to "increase" for backwards compat)
  const direction = useMemo((): "increase" | "decrease" | "neutral" => {
    if (selectedConfig?.analytics_config?.direction) {
      return selectedConfig.analytics_config.direction;
    }
    // Backwards compat: higher_is_better false means decrease
    if (selectedConfig?.analytics_config?.higher_is_better === false) {
      return "decrease";
    }
    return "increase";
  }, [selectedConfig]);

  const metricType = selectedConfig?.type || "number";

  // Stats for selected year
  const yearStats = useMemo(() => {
    const yearStr = String(selectedYear);
    const yearData = heatmapData.filter((d) => d.date.startsWith(yearStr));
    if (yearData.length === 0) return null;

    const values = yearData.map((d) => d.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const goalMetCount = yearData.filter((d) => d.goalMet).length;

    return {
      count: yearData.length,
      sum,
      avg,
      min,
      max,
      goalMetCount,
    };
  }, [heatmapData, selectedYear]);

  // Legend colors
  const legendColors = useMemo(() => {
    if (!yearStats || metricType === "checkbox") return null;
    return getHeatmapLegendColors(direction, yearStats.min, yearStats.max);
  }, [yearStats, direction, metricType]);

  const handleHover = useCallback((cell: { date: string; value: number } | null) => {
    setHoveredCell(cell);
  }, []);

  // Handle cell click (for mobile - tap to select)
  const handleCellClick = useCallback((date: string, value: number) => {
    setHoveredCell({ date, value });
  }, []);

  if (loading) {
    return (
      <main className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Calendar Heatmap</h1>
        <div className="text-sm text-muted-foreground">Loading...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Calendar Heatmap</h1>
        <div className="text-sm text-red-600">Error: {error}</div>
      </main>
    );
  }

  if (config.length === 0) {
    return (
      <main className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Calendar Heatmap</h1>
        <div className="text-sm text-muted-foreground">No metrics available.</div>
      </main>
    );
  }

  // Determine which stats to show based on type
  const showTotal = metricType !== "hhmm" && metricType !== "checkbox";
  const showAvg = metricType !== "checkbox";
  const showMinMax = metricType !== "checkbox";

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold">Calendar Heatmap</h1>

        <div className="flex items-center gap-4">
          {/* Metric selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Metric:</label>
            <Select value={selectedMetric ?? ""} onValueChange={setSelectedMetric}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select metric" />
              </SelectTrigger>
              <SelectContent>
                {config.map((m) => (
                  <SelectItem key={m.metric_id} value={m.metric_id}>
                    {m.metric_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Year selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Year:</label>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedYear((y) => y - 1)}
                disabled={selectedYear <= 2015}
              >
                &lt;
              </Button>
              <Select
                value={String(selectedYear)}
                onValueChange={(v) => setSelectedYear(parseInt(v, 10))}
              >
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={String(year)}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedYear((y) => y + 1)}
                disabled={selectedYear >= new Date().getFullYear()}
              >
                &gt;
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats card with legend and hover info */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Stats */}
            <div className="flex items-center gap-6 text-sm">
              {yearStats && (
                <>
                  <div className="text-center">
                    <div className="font-mono text-lg">{yearStats.count}</div>
                    <div className="text-muted-foreground text-xs">days</div>
                  </div>
                  {showAvg && (
                    <div className="text-center">
                      <div className="font-mono text-lg">
                        {formatValue(yearStats.avg, metricType)}
                      </div>
                      <div className="text-muted-foreground text-xs">average</div>
                    </div>
                  )}
                  {showTotal && (
                    <div className="text-center">
                      <div className="font-mono text-lg">
                        {formatValue(yearStats.sum, metricType)}
                      </div>
                      <div className="text-muted-foreground text-xs">total</div>
                    </div>
                  )}
                  {showMinMax && (
                    <>
                      <div className="text-center">
                        <div className="font-mono text-lg">
                          {formatValue(yearStats.min, metricType)}
                        </div>
                        <div className="text-muted-foreground text-xs">min</div>
                      </div>
                      <div className="text-center">
                        <div className="font-mono text-lg">
                          {formatValue(yearStats.max, metricType)}
                        </div>
                        <div className="text-muted-foreground text-xs">max</div>
                      </div>
                    </>
                  )}
                  {dailyGoal && yearStats.goalMetCount > 0 && (
                    <div className="text-center">
                      <div className="font-mono text-lg">
                        {yearStats.goalMetCount} 🏆
                      </div>
                      <div className="text-muted-foreground text-xs">goals met</div>
                    </div>
                  )}
                </>
              )}

              {/* Hover/tap info - fixed width to prevent shifting */}
              <div className="text-center min-w-[120px]">
                {hoveredCell ? (
                  <>
                    <div className="font-mono text-lg">
                      {formatValue(hoveredCell.value, metricType)}
                    </div>
                    <div className="text-muted-foreground text-xs">{hoveredCell.date}</div>
                  </>
                ) : (
                  <>
                    <div className="font-mono text-lg text-muted-foreground/30">—</div>
                    <div className="text-muted-foreground/30 text-xs">tap a day</div>
                  </>
                )}
              </div>
            </div>

            {/* Legend */}
            {legendColors && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{direction === "decrease" ? "High" : "Low"}</span>
                <div className="flex gap-0.5">
                  {legendColors.map((item, idx) => (
                    <div
                      key={idx}
                      className="w-4 h-4 rounded-sm"
                      style={{ backgroundColor: item.color }}
                      title={formatValue(item.value, metricType)}
                    />
                  ))}
                </div>
                <span>{direction === "decrease" ? "Low" : "High"}</span>
                {dailyGoal && (
                  <>
                    <span className="ml-2">🏆</span>
                    <span>Goal met</span>
                  </>
                )}
              </div>
            )}

            {/* Checkbox legend */}
            {metricType === "checkbox" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div
                  className="w-4 h-4 rounded-sm"
                  style={{
                    backgroundColor: direction === "decrease" ? "rgb(239, 68, 68)" : "rgb(34, 197, 94)",
                  }}
                />
                <span>Checked</span>
                <div
                  className="w-4 h-4 rounded-sm ml-2"
                  style={{ backgroundColor: "var(--muted)" }}
                />
                <span>Not checked</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selectedConfig?.metric_name} - {selectedYear}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CalendarHeatmap
            data={heatmapData}
            year={selectedYear}
            metricType={metricType}
            direction={direction}
            onHover={handleHover}
            onCellClick={handleCellClick}
          />
        </CardContent>
      </Card>
    </main>
  );
}
