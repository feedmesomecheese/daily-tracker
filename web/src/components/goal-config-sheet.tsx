"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Goal, GoalFrequency } from "@/lib/goals";

type MetricType = "checkbox" | "number" | "score" | "count" | "time" | "hhmm" | "text";

type GoalsConfig = {
  goals: Goal[];
};

type GoalConfigSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metricId: string;
  metricName: string;
  metricType: MetricType;
  goalsConfig: GoalsConfig | null;
  onSave: (goalsConfig: GoalsConfig) => Promise<void>;
};

// Generate a simple unique ID
function generateId(): string {
  return `goal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// Format minutes from midnight to HH:MM
function formatTime(minutes: number): string {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

// Parse HH:MM to minutes from midnight
function parseTime(timeStr: string): number {
  const [hrs, mins] = timeStr.split(":").map(Number);
  return (hrs || 0) * 60 + (mins || 0);
}

// Create a default goal based on metric type
function createDefaultGoal(metricType: MetricType): Goal {
  const base = {
    id: generateId(),
    name: "",
    frequency: "weekly" as GoalFrequency,
    enabled: true,
    created_at: new Date().toISOString(),
  };

  switch (metricType) {
    case "checkbox":
      return { ...base, type: "checkbox", target_count: 5 };
    case "number":
    case "score":
    case "count":
    case "time":
      return { ...base, type: "numeric", target: 100, measure: "sum", direction: "gte" };
    case "hhmm":
      return { ...base, type: "hhmm_target", target_time: 420, direction: "before" }; // 7:00 AM
    default:
      return { ...base, type: "checkbox", target_count: 1 };
  }
}

export function GoalConfigSheet({
  open,
  onOpenChange,
  metricId,
  metricName,
  metricType,
  goalsConfig,
  onSave,
}: GoalConfigSheetProps) {
  const [goals, setGoals] = React.useState<Goal[]>(goalsConfig?.goals || []);
  const [editingGoal, setEditingGoal] = React.useState<Goal | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Reset when opened
  React.useEffect(() => {
    if (open) {
      setGoals(goalsConfig?.goals || []);
      setEditingGoal(null);
    }
  }, [open, goalsConfig]);

  const handleAddGoal = () => {
    const newGoal = createDefaultGoal(metricType);
    setEditingGoal(newGoal);
  };

  const handleEditGoal = (goal: Goal) => {
    setEditingGoal({ ...goal });
  };

  const handleDeleteGoal = (goalId: string) => {
    setGoals(goals.filter((g) => g.id !== goalId));
  };

  const handleSaveGoal = (goal: Goal) => {
    const existing = goals.find((g) => g.id === goal.id);
    if (existing) {
      setGoals(goals.map((g) => (g.id === goal.id ? goal : g)));
    } else {
      setGoals([...goals, goal]);
    }
    setEditingGoal(null);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await onSave({ goals });
      onOpenChange(false);
    } catch (e) {
      console.error("Failed to save goals:", e);
    } finally {
      setSaving(false);
    }
  };

  // Text metrics don't support goals
  if (metricType === "text") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Goals: {metricName}</SheetTitle>
            <SheetDescription>
              Goals are not available for text metrics.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Goals: {metricName}</SheetTitle>
          <SheetDescription>
            Set targets for this metric. Goals are evaluated through yesterday unless today is logged.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Existing Goals */}
          {goals.length > 0 && !editingGoal && (
            <div className="space-y-3">
              {goals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  metricType={metricType}
                  onEdit={() => handleEditGoal(goal)}
                  onDelete={() => handleDeleteGoal(goal.id)}
                />
              ))}
            </div>
          )}

          {/* Empty State */}
          {goals.length === 0 && !editingGoal && (
            <div className="text-center py-8 text-muted-foreground">
              No goals configured yet.
            </div>
          )}

          {/* Add Goal Button */}
          {!editingGoal && (
            <Button onClick={handleAddGoal} variant="outline" className="w-full">
              + Add Goal
            </Button>
          )}

          {/* Goal Editor */}
          {editingGoal && (
            <GoalEditor
              goal={editingGoal}
              metricType={metricType}
              onSave={handleSaveGoal}
              onCancel={() => setEditingGoal(null)}
            />
          )}

          {/* Save All Button */}
          {!editingGoal && goals.length > 0 && (
            <div className="pt-4 border-t">
              <Button onClick={handleSaveAll} disabled={saving} className="w-full">
                {saving ? "Saving..." : "Save Goals"}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Goal Card Component
function GoalCard({
  goal,
  metricType,
  onEdit,
  onDelete,
}: {
  goal: Goal;
  metricType: MetricType;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const getGoalDescription = (): string => {
    switch (goal.type) {
      case "checkbox":
        return `${goal.target_count}x per ${goal.frequency}`;
      case "numeric":
        return `${goal.direction === "gte" ? "≥" : "≤"} ${goal.target} ${goal.measure} per ${goal.frequency}`;
      case "numeric_threshold":
        return `${goal.direction === "gte" ? "≥" : "≤"} ${goal.threshold} on ${goal.target_count} days per ${goal.frequency}`;
      case "hhmm_target":
        return `${goal.direction === "before" ? "Before" : "After"} ${formatTime(goal.target_time)} ${goal.frequency}`;
      case "hhmm_consistency":
        return `Within ±${goal.max_std_dev} min std dev per ${goal.frequency}`;
      default:
        return "";
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-medium">{goal.name || "Unnamed Goal"}</div>
            <div className="text-sm text-muted-foreground">{getGoalDescription()}</div>
            {goal.start_date && (
              <div className="text-xs text-muted-foreground mt-1">
                {goal.end_date
                  ? `Sprint: ${goal.start_date} to ${goal.end_date}`
                  : `Starts: ${goal.start_date}`}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-600">
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Goal Editor Component
function GoalEditor({
  goal,
  metricType,
  onSave,
  onCancel,
}: {
  goal: Goal;
  metricType: MetricType;
  onSave: (goal: Goal) => void;
  onCancel: () => void;
}) {
  const [editedGoal, setEditedGoal] = React.useState<Goal>(goal);

  const updateGoal = (updates: Partial<Goal>) => {
    setEditedGoal({ ...editedGoal, ...updates } as Goal);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(editedGoal);
  };

  // Get available goal types for this metric type
  const getGoalTypes = (): { value: string; label: string }[] => {
    switch (metricType) {
      case "checkbox":
        return [{ value: "checkbox", label: "Count per period" }];
      case "number":
      case "time":
        return [
          { value: "numeric", label: "Target value (sum/avg)" },
          { value: "numeric_threshold", label: "Days meeting threshold" },
        ];
      case "hhmm":
        return [
          { value: "hhmm_target", label: "Target time" },
          { value: "hhmm_consistency", label: "Consistency" },
          { value: "numeric_threshold", label: "Days meeting threshold" },
        ];
      default:
        return [];
    }
  };

  const handleTypeChange = (newType: string) => {
    // Create a new goal with the new type while preserving common fields
    const base = {
      id: editedGoal.id,
      name: editedGoal.name,
      frequency: editedGoal.frequency,
      enabled: editedGoal.enabled,
      start_date: editedGoal.start_date,
      end_date: editedGoal.end_date,
      alerts: editedGoal.alerts,
      created_at: editedGoal.created_at,
    };

    switch (newType) {
      case "checkbox":
        setEditedGoal({ ...base, type: "checkbox", target_count: 5 });
        break;
      case "numeric":
        setEditedGoal({ ...base, type: "numeric", target: 100, measure: "sum", direction: "gte" });
        break;
      case "numeric_threshold":
        // Default threshold depends on metric type
        const defaultThreshold = metricType === "hhmm" ? 300 : 7; // 5:00 AM for hhmm, 7 for others
        const defaultDirection = metricType === "hhmm" ? "lte" : "gte"; // "before" for hhmm
        setEditedGoal({ ...base, type: "numeric_threshold", threshold: defaultThreshold, direction: defaultDirection, target_count: 5 });
        break;
      case "hhmm_target":
        setEditedGoal({ ...base, type: "hhmm_target", target_time: 420, direction: "before" });
        break;
      case "hhmm_consistency":
        setEditedGoal({ ...base, type: "hhmm_consistency", max_std_dev: 30 });
        break;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {goal.created_at ? "Edit Goal" : "New Goal"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-sm font-medium">Name</label>
            <Input
              value={editedGoal.name}
              onChange={(e) => updateGoal({ name: e.target.value })}
              placeholder="e.g., Weekly target"
              className="mt-1"
            />
          </div>

          {/* Goal Type (if multiple options) */}
          {getGoalTypes().length > 1 && (
            <div>
              <label className="text-sm font-medium">Goal Type</label>
              <select
                value={editedGoal.type}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {getGoalTypes().map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Frequency */}
          <div>
            <label className="text-sm font-medium">Frequency</label>
            <select
              value={editedGoal.frequency}
              onChange={(e) => updateGoal({ frequency: e.target.value as GoalFrequency })}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {/* Type-specific fields */}
          {editedGoal.type === "checkbox" && (
            <div>
              <label className="text-sm font-medium">Target Count</label>
              <Input
                type="number"
                min={1}
                value={editedGoal.target_count}
                onChange={(e) => updateGoal({ target_count: parseInt(e.target.value) || 1 })}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Times to check this per {editedGoal.frequency}
              </p>
            </div>
          )}

          {editedGoal.type === "numeric" && (
            <>
              <div>
                <label className="text-sm font-medium">Target Value</label>
                <Input
                  type="number"
                  value={editedGoal.target}
                  onChange={(e) => updateGoal({ target: parseFloat(e.target.value) || 0 })}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Measure</label>
                  <select
                    value={editedGoal.measure}
                    onChange={(e) => updateGoal({ measure: e.target.value as "sum" | "average" })}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="sum">Total (sum)</option>
                    <option value="average">Average</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Direction</label>
                  <select
                    value={editedGoal.direction}
                    onChange={(e) => updateGoal({ direction: e.target.value as "gte" | "lte" })}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="gte">At least (≥)</option>
                    <option value="lte">At most (≤)</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {editedGoal.type === "numeric_threshold" && (
            <>
              <div>
                <label className="text-sm font-medium">
                  {metricType === "hhmm" ? "Threshold Time" : "Threshold Value"}
                </label>
                {metricType === "hhmm" ? (
                  <Input
                    type="time"
                    value={formatTime(editedGoal.threshold)}
                    onChange={(e) => updateGoal({ threshold: parseTime(e.target.value) })}
                    className="mt-1"
                  />
                ) : (
                  <Input
                    type="number"
                    value={editedGoal.threshold}
                    onChange={(e) => updateGoal({ threshold: parseFloat(e.target.value) || 0 })}
                    className="mt-1"
                  />
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {metricType === "hhmm"
                    ? "The time that must be met each day"
                    : "The value that must be met each day"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium">Direction</label>
                <select
                  value={editedGoal.direction}
                  onChange={(e) => updateGoal({ direction: e.target.value as "gte" | "lte" })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {metricType === "hhmm" ? (
                    <>
                      <option value="lte">Before (≤)</option>
                      <option value="gte">After (≥)</option>
                    </>
                  ) : (
                    <>
                      <option value="gte">At least (≥)</option>
                      <option value="lte">At most (≤)</option>
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Target Days</label>
                <Input
                  type="number"
                  min={1}
                  value={editedGoal.target_count}
                  onChange={(e) => updateGoal({ target_count: parseInt(e.target.value) || 1 })}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  How many days per {editedGoal.frequency} must meet the threshold
                </p>
              </div>
            </>
          )}

          {editedGoal.type === "hhmm_target" && (
            <>
              <div>
                <label className="text-sm font-medium">Target Time</label>
                <Input
                  type="time"
                  value={formatTime(editedGoal.target_time)}
                  onChange={(e) => updateGoal({ target_time: parseTime(e.target.value) })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Direction</label>
                <select
                  value={editedGoal.direction}
                  onChange={(e) => updateGoal({ direction: e.target.value as "before" | "after" })}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="before">Before (≤)</option>
                  <option value="after">After (≥)</option>
                </select>
              </div>
            </>
          )}

          {editedGoal.type === "hhmm_consistency" && (
            <div>
              <label className="text-sm font-medium">Max Standard Deviation (minutes)</label>
              <Input
                type="number"
                min={1}
                value={editedGoal.max_std_dev}
                onChange={(e) => updateGoal({ max_std_dev: parseInt(e.target.value) || 30 })}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Lower = more consistent. 15 min is very consistent, 60 min is variable.
              </p>
            </div>
          )}

          {/* Sprint dates (optional) */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Sprint Goal (optional)</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Start Date</label>
                <Input
                  type="date"
                  value={editedGoal.start_date || ""}
                  onChange={(e) => updateGoal({ start_date: e.target.value || null })}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">End Date</label>
                <Input
                  type="date"
                  value={editedGoal.end_date || ""}
                  onChange={(e) => updateGoal({ end_date: e.target.value || null })}
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave empty for ongoing goals
            </p>
          </div>

          {/* Alert Settings */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Alerts</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editedGoal.alerts?.achieved || false}
                  onChange={(e) =>
                    updateGoal({
                      alerts: { ...editedGoal.alerts, achieved: e.target.checked },
                    })
                  }
                  className="rounded"
                />
                Notify when achieved
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editedGoal.alerts?.missed || false}
                  onChange={(e) =>
                    updateGoal({
                      alerts: { ...editedGoal.alerts, missed: e.target.checked },
                    })
                  }
                  className="rounded"
                />
                Notify when missed
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              Save Goal
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
