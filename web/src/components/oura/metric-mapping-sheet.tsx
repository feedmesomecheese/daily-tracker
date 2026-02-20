"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const OURA_METRICS = [
  { id: "sleep_duration", name: "Sleep Duration", category: "Sleep", unit: "minutes" },
  { id: "sleep_efficiency", name: "Sleep Efficiency", category: "Sleep", unit: "score" },
  { id: "deep_sleep", name: "Deep Sleep", category: "Sleep", unit: "minutes" },
  { id: "rem_sleep", name: "REM Sleep", category: "Sleep", unit: "minutes" },
  { id: "light_sleep", name: "Light Sleep", category: "Sleep", unit: "minutes" },
  { id: "readiness_score", name: "Readiness Score", category: "Readiness", unit: "score" },
  { id: "resting_heart_rate", name: "Resting Heart Rate", category: "Readiness", unit: "bpm" },
  { id: "hrv_average", name: "HRV Average", category: "Readiness", unit: "ms" },
  { id: "activity_score", name: "Activity Score", category: "Activity", unit: "score" },
  { id: "steps", name: "Steps", category: "Activity", unit: "count" },
  { id: "calories_active", name: "Active Calories", category: "Activity", unit: "kcal" },
  { id: "calories_total", name: "Total Calories", category: "Activity", unit: "kcal" },
];

export type MetricMapping = Record<string, { enabled: boolean; metric_id: string }>;

export type MetricMappingSheetProps = {
  mapping: MetricMapping;
  availableMetrics: { metric_id: string; metric_name: string; type: string }[];
  onSave: (mapping: MetricMapping) => void;
  saving?: boolean;
};

export function MetricMappingSheet({
  mapping,
  availableMetrics,
  onSave,
  saving = false,
}: MetricMappingSheetProps) {
  const [localMapping, setLocalMapping] = useState<MetricMapping>(mapping);
  const [open, setOpen] = useState(false);

  const handleToggle = (ouraMetricId: string, enabled: boolean) => {
    setLocalMapping((prev) => ({
      ...prev,
      [ouraMetricId]: {
        ...prev[ouraMetricId],
        enabled,
      },
    }));
  };

  const NONE = "__none__";

  const handleMetricChange = (ouraMetricId: string, metricId: string) => {
    setLocalMapping((prev) => ({
      ...prev,
      [ouraMetricId]: {
        enabled: prev[ouraMetricId]?.enabled ?? true,
        metric_id: metricId === NONE ? "" : metricId,
      },
    }));
  };

  const handleSave = () => {
    onSave(localMapping);
    setOpen(false);
  };

  // Group Oura metrics by category
  const groupedMetrics = OURA_METRICS.reduce(
    (acc, m) => {
      if (!acc[m.category]) acc[m.category] = [];
      acc[m.category].push(m);
      return acc;
    },
    {} as Record<string, typeof OURA_METRICS>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">Configure Metrics</Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Metric Mapping</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <p className="text-sm text-muted-foreground">
            Choose which Oura metrics to sync and map them to your Daily Tracker metrics.
          </p>

          {Object.entries(groupedMetrics).map(([category, metrics]) => (
            <div key={category}>
              <h3 className="font-medium text-sm mb-3">{category}</h3>
              <div className="space-y-3">
                {metrics.map((ouraMetric) => {
                  const currentMapping = localMapping[ouraMetric.id] || {
                    enabled: false,
                    metric_id: "",
                  };

                  return (
                    <div
                      key={ouraMetric.id}
                      className="flex items-center gap-3 p-3 border rounded-lg"
                    >
                      <Switch
                        checked={currentMapping.enabled}
                        onCheckedChange={(checked) => handleToggle(ouraMetric.id, checked)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{ouraMetric.name}</div>
                        <div className="text-xs text-muted-foreground">{ouraMetric.unit}</div>
                      </div>
                      <Select
                        value={currentMapping.metric_id || NONE}
                        onValueChange={(v) => handleMetricChange(ouraMetric.id, v)}
                        disabled={!currentMapping.enabled}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue placeholder="Select metric" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>— not mapped —</SelectItem>
                          {availableMetrics.map((m) => (
                            <SelectItem key={m.metric_id} value={m.metric_id}>
                              {m.metric_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Mapping"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
