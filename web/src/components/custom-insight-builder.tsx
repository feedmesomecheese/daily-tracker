"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { InsightType, CustomInsightConfig } from "@/types/insights";

type MetricOption = {
  metric_id: string;
  metric_name: string | null;
  type: string;
};

const CHART_TYPES: {
  value: InsightType;
  label: string;
  description: string;
  requiresNumeric: boolean;
  requiresCheckbox: boolean;
}[] = [
  { value: "trend", label: "Trend", description: "Daily values with moving average", requiresNumeric: true, requiresCheckbox: false },
  { value: "histogram", label: "Distribution", description: "Value frequency histogram", requiresNumeric: true, requiresCheckbox: false },
  { value: "cumulative", label: "Cumulative", description: "Running total over time", requiresNumeric: true, requiresCheckbox: false },
  { value: "day_of_week", label: "Day of Week", description: "Averages by day of week", requiresNumeric: true, requiresCheckbox: false },
  { value: "candlestick", label: "Candlestick", description: "Weekly/monthly OHLC candles", requiresNumeric: true, requiresCheckbox: false },
  { value: "streak_timeline", label: "Streaks", description: "Consecutive day patterns", requiresNumeric: false, requiresCheckbox: false },
  { value: "year_over_year", label: "Year-over-Year", description: "Compare across years", requiresNumeric: true, requiresCheckbox: false },
];

const NUMERIC_TYPES = ["number", "score", "time", "hhmm", "count", "calculated"];

export function CustomInsightBuilder({
  open,
  onOpenChange,
  onSave,
  editingConfig,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: CustomInsightConfig) => void;
  editingConfig: CustomInsightConfig | null;
}) {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const [metrics, setMetrics] = useState<MetricOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMetricId, setSelectedMetricId] = useState<string>("");
  const [selectedChartType, setSelectedChartType] = useState<InsightType | "">("");
  const [customLabel, setCustomLabel] = useState("");
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");
  const [filterText, setFilterText] = useState("");

  // Load metrics
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const headers = await getAuthHeaders();
        const res = await fetch("/api/config", { headers });
        const json = await res.json();
        if (!res.ok) return;
        if (!cancelled) {
          const allMetrics = Array.isArray(json) ? json : (json.metrics || []);
          const activeMetrics = allMetrics
            .filter((m: MetricOption & { active?: boolean }) => m.active !== false)
            .map((m: MetricOption) => ({
              metric_id: m.metric_id,
              metric_name: m.metric_name,
              type: m.type,
            }));
          setMetrics(activeMetrics);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Populate from editing config
  useEffect(() => {
    if (editingConfig) {
      setSelectedMetricId(editingConfig.metricId);
      setSelectedChartType(editingConfig.chartType);
      setCustomLabel(editingConfig.label || "");
      setPeriod(editingConfig.options?.period || "weekly");
    } else {
      setSelectedMetricId("");
      setSelectedChartType("");
      setCustomLabel("");
      setPeriod("weekly");
    }
    setFilterText("");
  }, [editingConfig, open]);

  const selectedMetric = metrics.find((m) => m.metric_id === selectedMetricId);
  const isNumeric = selectedMetric ? NUMERIC_TYPES.includes(selectedMetric.type) : false;
  const isCheckbox = selectedMetric?.type === "checkbox";

  const availableChartTypes = CHART_TYPES.filter((ct) => {
    if (!selectedMetric) return true;
    if (ct.requiresNumeric && !isNumeric) return false;
    if (ct.requiresCheckbox && !isCheckbox) return false;
    return true;
  });

  const filteredMetrics = metrics.filter((m) => {
    if (!filterText) return true;
    const name = (m.metric_name || m.metric_id).toLowerCase();
    return name.includes(filterText.toLowerCase());
  });

  const handleSave = useCallback(() => {
    if (!selectedMetricId || !selectedChartType) return;
    const metric = metrics.find((m) => m.metric_id === selectedMetricId);
    if (!metric) return;

    const config: CustomInsightConfig = {
      id: editingConfig?.id || `custom:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      metricId: selectedMetricId,
      metricName: metric.metric_name || metric.metric_id,
      chartType: selectedChartType as InsightType,
      label: customLabel || undefined,
      options: {
        period: selectedChartType === "candlestick" ? period : undefined,
      },
      createdAt: editingConfig?.createdAt || Date.now(),
    };

    onSave(config);
    onOpenChange(false);
  }, [selectedMetricId, selectedChartType, customLabel, period, metrics, editingConfig, onSave, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={
          isMobile
            ? "h-[90vh] overflow-hidden flex flex-col rounded-t-xl"
            : "sm:max-w-[480px] overflow-hidden flex flex-col"
        }
        storageKey="custom_insight_sheet_width"
        defaultWidth={480}
      >
        {isMobile && (
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
        )}
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>{editingConfig ? "Edit Custom Insight" : "New Custom Insight"}</SheetTitle>
          <SheetDescription>
            Choose a metric and chart type to create a custom insight card.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-6">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading metrics...</p>
          ) : (
            <>
              {/* Step 1: Select Metric */}
              <div>
                <label className="text-sm font-medium mb-2 block">1. Select Metric</label>
                <Input
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Filter metrics..."
                  className="mb-2"
                />
                <div className="max-h-48 overflow-y-auto border rounded-md">
                  {filteredMetrics.map((m) => (
                    <button
                      key={m.metric_id}
                      onClick={() => {
                        setSelectedMetricId(m.metric_id);
                        // Reset chart type if it's no longer compatible
                        const newIsNumeric = NUMERIC_TYPES.includes(m.type);
                        if (selectedChartType) {
                          const ct = CHART_TYPES.find((c) => c.value === selectedChartType);
                          if (ct?.requiresNumeric && !newIsNumeric) {
                            setSelectedChartType("");
                          }
                        }
                      }}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-muted transition-colors ${
                        selectedMetricId === m.metric_id ? "bg-accent text-accent-foreground" : ""
                      }`}
                    >
                      <span>{m.metric_name || m.metric_id}</span>
                      <span className="text-xs text-muted-foreground">{m.type}</span>
                    </button>
                  ))}
                  {filteredMetrics.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-3">No metrics found</p>
                  )}
                </div>
              </div>

              {/* Step 2: Select Chart Type */}
              <div>
                <label className="text-sm font-medium mb-2 block">2. Chart Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {availableChartTypes.map((ct) => (
                    <button
                      key={ct.value}
                      onClick={() => setSelectedChartType(ct.value)}
                      disabled={!selectedMetricId}
                      className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                        selectedChartType === ct.value
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                          : "hover:bg-muted"
                      } ${!selectedMetricId ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <p className="font-medium">{ct.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{ct.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3: Options */}
              {selectedChartType === "candlestick" && (
                <div>
                  <label className="text-sm font-medium mb-2 block">3. Period</label>
                  <div className="flex gap-2">
                    {(["weekly", "monthly"] as const).map((p) => (
                      <Button
                        key={p}
                        variant={period === p ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPeriod(p)}
                      >
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 4: Custom Label */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {selectedChartType === "candlestick" ? "4" : "3"}. Label (optional)
                </label>
                <Input
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="Custom label for this insight..."
                />
              </div>

              {/* Save button */}
              <Button
                className="w-full"
                disabled={!selectedMetricId || !selectedChartType}
                onClick={handleSave}
              >
                {editingConfig ? "Update Insight" : "Create Insight"}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
