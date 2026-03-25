"use client";
import { useState } from "react";
import React from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { getAuthHeaders } from "@/lib/authHeaders";

function Label({ htmlFor, children, className }: { htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={`text-sm font-medium leading-none ${className ?? ""}`}>
      {children}
    </label>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2 border-t border-border">
      {children}
    </p>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingGroups: string[];
  onCreated: () => void;
};

const METRIC_TYPES = [
  { value: "number", label: "Number" },
  { value: "checkbox", label: "Checkbox" },
  { value: "score", label: "Score" },
  { value: "count", label: "Count" },
  { value: "time", label: "Time" },
  { value: "hhmm", label: "HH:MM" },
  { value: "text", label: "Text" },
] as const;

const NUMERIC_TYPES = new Set(["number", "score", "count", "time", "hhmm"]);

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function QuickAddMetricSheet({ open, onOpenChange, existingGroups, onCreated }: Props) {
  // Core
  const [name, setName] = useState("");
  const [metricId, setMetricId] = useState("");
  const [idManuallyEdited, setIdManuallyEdited] = useState(false);
  const [type, setType] = useState<string>("number");
  const [group, setGroup] = useState("");

  // Behavior
  const [isPrivate, setIsPrivate] = useState(false);
  const [required, setRequired] = useState(false);

  // Value constraints
  const [defaultValue, setDefaultValue] = useState("");
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [disallowedValues, setDisallowedValues] = useState("");
  const [presetValues, setPresetValues] = useState("");

  // Analytics
  const [lowerIsBetter, setLowerIsBetter] = useState(false);
  const [showStreak, setShowStreak] = useState(true);
  const [direction, setDirection] = useState<"increase" | "decrease" | "neutral">("increase");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNumeric = NUMERIC_TYPES.has(type);
  const isNonText = type !== "text";

  function handleNameChange(value: string) {
    setName(value);
    if (!idManuallyEdited) {
      setMetricId(toSlug(value));
    }
  }

  function handleIdChange(value: string) {
    setMetricId(value);
    setIdManuallyEdited(true);
  }

  function resetForm() {
    setName("");
    setMetricId("");
    setIdManuallyEdited(false);
    setType("number");
    setGroup("");
    setIsPrivate(false);
    setRequired(false);
    setDefaultValue("");
    setMinValue("");
    setMaxValue("");
    setDisallowedValues("");
    setPresetValues("");
    setLowerIsBetter(false);
    setShowStreak(true);
    setDirection("increase");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !metricId.trim()) return;

    setSubmitting(true);
    setError(null);

    const analyticsConfig: Record<string, unknown> = {};
    if (isNumeric && lowerIsBetter) analyticsConfig.higher_is_better = false;
    if (isNonText && !showStreak) analyticsConfig.show_streak = false;
    if (isNonText && direction !== "increase") analyticsConfig.direction = direction;

    const body: Record<string, unknown> = {
      metric_id: metricId.trim(),
      metric_name: name.trim(),
      type,
      group: group.trim() || null,
      private: isPrivate,
      required,
    };

    if (defaultValue !== "") body.default_value = parseFloat(defaultValue);
    if (minValue !== "") body.min_value = parseFloat(minValue);
    if (maxValue !== "") body.max_value = parseFloat(maxValue);
    if (disallowedValues.trim()) body.disallowed_values = disallowedValues.trim();
    if (presetValues.trim()) body.preset_values_csv = presetValues.trim();
    if (Object.keys(analyticsConfig).length > 0) body.analytics_config = analyticsConfig;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/metrics", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to create metric");
        return;
      }

      resetForm();
      onOpenChange(false);
      onCreated();
    } catch {
      setError("Network error, please try again");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) resetForm();
    onOpenChange(open);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col" storageKey="quick_add_metric_sheet_width" defaultWidth={448}>
        <SheetHeader>
          <SheetTitle>Add Metric</SheetTitle>
          <SheetDescription>
            Create a new metric with essential settings.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 flex-1 mt-4 overflow-y-auto pr-1">

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qa-name">Metric Name</Label>
            <Input
              id="qa-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Sleep Hours"
              required
              autoFocus
            />
          </div>

          {/* ID */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qa-id">Metric ID</Label>
            <Input
              id="qa-id"
              value={metricId}
              onChange={(e) => handleIdChange(e.target.value)}
              placeholder="e.g. sleep_hours"
              required
              pattern="[a-zA-Z0-9_]+"
              title="Letters, numbers, and underscores only"
            />
            <p className="text-xs text-muted-foreground">
              Letters, numbers, underscores only. Cannot be changed later.
            </p>
          </div>

          {/* Type + Group */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qa-type">Type</Label>
              <select
                id="qa-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {METRIC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Group <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Combobox
                value={group}
                onChange={setGroup}
                options={existingGroups}
                placeholder="Select or create..."
              />
            </div>
          </div>

          {/* Behavior */}
          <SectionHeading>Behavior</SectionHeading>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="h-4 w-4"
              />
              Private
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="h-4 w-4"
              />
              Required
            </label>
          </div>

          {/* Value Constraints */}
          <SectionHeading>Value Constraints</SectionHeading>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qa-default">Default</Label>
              <Input
                id="qa-default"
                type="number"
                value={defaultValue}
                onChange={(e) => setDefaultValue(e.target.value)}
                placeholder="—"
                step="any"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qa-min">Min</Label>
              <Input
                id="qa-min"
                type="number"
                value={minValue}
                onChange={(e) => setMinValue(e.target.value)}
                placeholder="—"
                step="any"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qa-max">Max</Label>
              <Input
                id="qa-max"
                type="number"
                value={maxValue}
                onChange={(e) => setMaxValue(e.target.value)}
                placeholder="—"
                step="any"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qa-disallowed">Not Allowed Values</Label>
            <Input
              id="qa-disallowed"
              value={disallowedValues}
              onChange={(e) => setDisallowedValues(e.target.value)}
              placeholder="e.g. 0,99 (comma-separated)"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qa-presets">Preset Values</Label>
            <Input
              id="qa-presets"
              value={presetValues}
              onChange={(e) => setPresetValues(e.target.value)}
              placeholder="e.g. 1,2,3,5,8 (comma-separated)"
            />
          </div>

          {/* Analytics */}
          {isNonText && (
            <>
              <SectionHeading>Analytics</SectionHeading>
              <div className="flex flex-col gap-2">
                {isNumeric && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={lowerIsBetter}
                      onChange={(e) => setLowerIsBetter(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Lower is better
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showStreak}
                    onChange={(e) => setShowStreak(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Show streak
                </label>
                <div className="flex items-center gap-2">
                  <Label htmlFor="qa-direction">Direction</Label>
                  <select
                    id="qa-direction"
                    value={direction}
                    onChange={(e) => setDirection(e.target.value as "increase" | "decrease" | "neutral")}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="increase">↑ Increase (more is better)</option>
                    <option value="decrease">↓ Decrease (less is better)</option>
                    <option value="neutral">— Neutral (no flame)</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="flex gap-2 mt-auto pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={submitting || !name.trim() || !metricId.trim()}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>

        <SheetFooter className="mt-2">
          <p className="text-xs text-muted-foreground">
            For advanced settings, go to{" "}
            <Link href="/metrics" className="underline hover:text-foreground" onClick={() => handleOpenChange(false)}>
              Metrics →
            </Link>
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
