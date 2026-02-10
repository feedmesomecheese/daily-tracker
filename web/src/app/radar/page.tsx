"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { RadarChart, RadarDataPoint } from "@/components/radar-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ConfigRow = {
  metric_id: string;
  metric_name: string;
  type: string;
  active: boolean;
  group?: string | null;
};

type RadarResponse = {
  view: string;
  date: string | null;
  compare_date: string | null;
  data: RadarDataPoint[];
  stats: {
    metric_id: string;
    metric_name: string;
    min: number;
    max: number;
    avg: number;
    higher_is_better: boolean;
  }[];
};

const VIEW_OPTIONS = [
  { value: "average", label: "All-time Average" },
  { value: "7d", label: "7-day Average" },
  { value: "30d", label: "30-day Average" },
  { value: "day", label: "Single Day" },
];

function getLocalDateString(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export default function RadarPage() {
  const [config, setConfig] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set());
  const [view, setView] = useState("7d");
  const [date, setDate] = useState(getLocalDateString());
  const [compareDate, setCompareDate] = useState("");
  const [showComparison, setShowComparison] = useState(false);

  const [radarData, setRadarData] = useState<RadarDataPoint[]>([]);
  const [radarStats, setRadarStats] = useState<RadarResponse["stats"]>([]);
  const [radarLoading, setRadarLoading] = useState(false);

  // Load config
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const headers = await getAuthHeaders();
        const res = await fetch("/api/config", { headers });
        const data = await res.json();

        if (!res.ok) throw new Error(data?.error || "Failed to load config");

        // Filter to active numeric metrics
        const activeMetrics = (data as ConfigRow[]).filter(
          (m) => m.active && m.type !== "text"
        );
        setConfig(activeMetrics);

        // Auto-select first 5 metrics
        const initial = new Set(activeMetrics.slice(0, 5).map((m) => m.metric_id));
        setSelectedMetrics(initial);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fetch radar data when selection changes
  const fetchRadarData = useCallback(async () => {
    if (selectedMetrics.size === 0) {
      setRadarData([]);
      setRadarStats([]);
      return;
    }

    setRadarLoading(true);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({
        metrics: Array.from(selectedMetrics).join(","),
        view,
      });

      if (view === "day" || view === "7d" || view === "30d") {
        params.set("date", date);
      }

      if (showComparison && compareDate) {
        params.set("compare_date", compareDate);
      }

      const res = await fetch(`/api/radar?${params}`, { headers });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "Failed to load radar data");

      setRadarData(data.data);
      setRadarStats(data.stats);
    } catch (e) {
      console.error("Failed to fetch radar data:", e);
    } finally {
      setRadarLoading(false);
    }
  }, [selectedMetrics, view, date, compareDate, showComparison]);

  useEffect(() => {
    fetchRadarData();
  }, [fetchRadarData]);

  // Group metrics by group
  const groupedMetrics = useMemo(() => {
    const groups = new Map<string, ConfigRow[]>();
    for (const m of config) {
      const group = m.group || "Ungrouped";
      const existing = groups.get(group) || [];
      existing.push(m);
      groups.set(group, existing);
    }
    return groups;
  }, [config]);

  const toggleMetric = useCallback((metricId: string) => {
    setSelectedMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(metricId)) {
        next.delete(metricId);
      } else {
        next.add(metricId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedMetrics(new Set(config.map((m) => m.metric_id)));
  }, [config]);

  const clearAll = useCallback(() => {
    setSelectedMetrics(new Set());
  }, []);

  if (loading) {
    return (
      <main className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Radar Chart</h1>
        <div className="text-sm text-muted-foreground">Loading...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Radar Chart</h1>
        <div className="text-sm text-red-600">Error: {error}</div>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Radar Chart</h1>
          <Badge variant="secondary">{selectedMetrics.size} metrics</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Controls sidebar */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* View selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">View</label>
              <Select value={view} onValueChange={setView}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIEW_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date picker (for day/period views) */}
            {(view === "day" || view === "7d" || view === "30d") && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            )}

            {/* Comparison toggle */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="compare"
                  checked={showComparison}
                  onCheckedChange={(checked) => setShowComparison(checked === true)}
                />
                <label htmlFor="compare" className="text-sm font-medium cursor-pointer">
                  Compare to another period
                </label>
              </div>
              {showComparison && (
                <Input
                  type="date"
                  value={compareDate}
                  onChange={(e) => setCompareDate(e.target.value)}
                  placeholder="Comparison date"
                />
              )}
            </div>

            {/* Metric selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Metrics</label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll}>
                    All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearAll}>
                    None
                  </Button>
                </div>
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-3">
                {Array.from(groupedMetrics.entries()).map(([group, metrics]) => (
                  <div key={group}>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      {group}
                    </div>
                    <div className="space-y-1">
                      {metrics.map((m) => (
                        <label
                          key={m.metric_id}
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted px-2 py-1 rounded"
                        >
                          <Checkbox
                            checked={selectedMetrics.has(m.metric_id)}
                            onCheckedChange={() => toggleMetric(m.metric_id)}
                          />
                          {m.metric_name}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Multi-metric Comparison
              {view === "day" && ` - ${date}`}
              {view === "7d" && ` - 7 days ending ${date}`}
              {view === "30d" && ` - 30 days ending ${date}`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {radarLoading ? (
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : (
              <RadarChart
                data={radarData}
                showComparison={showComparison && !!compareDate}
                primaryLabel={view === "day" ? date : `${view} ending ${date}`}
                compareLabel={
                  view === "day" ? compareDate : `${view} ending ${compareDate}`
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stats table */}
      {radarStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metric Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Metric</th>
                    <th className="text-right py-2 px-3">Min</th>
                    <th className="text-right py-2 px-3">Max</th>
                    <th className="text-right py-2 px-3">Avg</th>
                    <th className="text-center py-2 px-3">Direction</th>
                    <th className="text-right py-2 px-3">Current</th>
                    {showComparison && compareDate && (
                      <th className="text-right py-2 px-3">Compare</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {radarStats.map((stat) => {
                    const dataPoint = radarData.find(
                      (d) => d.metric_id === stat.metric_id
                    );
                    return (
                      <tr key={stat.metric_id} className="border-b">
                        <td className="py-2 px-3">{stat.metric_name}</td>
                        <td className="text-right py-2 px-3 font-mono">
                          {stat.min}
                        </td>
                        <td className="text-right py-2 px-3 font-mono">
                          {stat.max}
                        </td>
                        <td className="text-right py-2 px-3 font-mono">
                          {stat.avg}
                        </td>
                        <td className="text-center py-2 px-3">
                          <Badge
                            variant={stat.higher_is_better ? "default" : "secondary"}
                          >
                            {stat.higher_is_better ? "Higher" : "Lower"}
                          </Badge>
                        </td>
                        <td className="text-right py-2 px-3 font-mono">
                          {dataPoint?.value ?? "-"}
                        </td>
                        {showComparison && compareDate && (
                          <td className="text-right py-2 px-3 font-mono">
                            {dataPoint?.compare_value ?? "-"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
