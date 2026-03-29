"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { useToast } from "@/components/ui/Toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { FormulaInput } from "@/components/ui/formula-input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { MetricStatsSheet } from "@/components/metric-stats-sheet";
import { GoalConfigSheet } from "@/components/goal-config-sheet";
import type { Goal } from "@/lib/goals";
import { useTour } from "@/hooks/useTour";
import { buttonVariants } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import "driver.js/dist/driver.css";

// Formula help data
const FORMULA_HELP = [
  {
    name: "prev(id, n?)",
    sig: "prev(metric_id) | prev(metric_id, n)",
    desc: "Previous-day (or n-days-back) value. Returns null if missing.",
    ex: ["prev(sleep_time)", "prev(daily_score, 7)"],
  },
  {
    name: "coalesce(a, b, ...)",
    sig: "coalesce(a, b, c...)",
    desc: "Returns the first non-null value. Great for fallbacks when you miss logging.",
    ex: [
      "coalesce(lazy_time, 0)",
      "coalesce(prev(daily_score, 7), prev(daily_score, 14), 0)",
    ],
  },
  {
    name: "diff(a, b)",
    sig: "diff(a, b) -> minutes",
    desc: "Clock-time subtraction with wraparound (non-negative). Useful for sleep/fasting windows.",
    ex: ["diff(wake_up, prev(sleep_time))", "diff(eat_finish, eat_start)"],
  },
  {
    name: "if(cond, a, b)",
    sig: "if(cond, a, b)",
    desc: "Conditional. cond is truthy if non-zero. If cond is null, treated as false (b).",
    ex: ["if(gt(daily_score, 6), 1, 0)"],
  },
  { name: "and(...)", sig: "and(a,b,...)", desc: "All must be true (non-zero).", ex: ["and(exercise, protein_goal)"] },
  { name: "or(...)", sig: "or(a,b,...)", desc: "Any true (non-zero) => 1.", ex: ["or(lift, hiit, tennis)"] },
  { name: "not(x)", sig: "not(x)", desc: "Invert boolean 1/0.", ex: ["not(sick)"] },
  {
    name: "gt/gte/lt/lte/eq/ne",
    sig: "gt(a,b) gte(a,b) lt(a,b) lte(a,b) eq(a,b) ne(a,b)",
    desc: "Comparisons return 1/0. Return null if any input is null.",
    ex: ["gte(steps, 8000)", "lt(alcohol, 1)"],
  },
  { name: "abs(x)", sig: "abs(x)", desc: "Absolute value.", ex: ["abs(lazy_time - 10)"] },
  {
    name: "Arithmetic",
    sig: "+  -  *  /  ( )",
    desc: "Standard arithmetic. If any operand is null, result becomes null.",
    ex: ["daily_score + 1", "(protein - 150) / 10"],
  },
];

type MetricType = "checkbox" | "number" | "score" | "count" | "time" | "hhmm" | "text";

type AnalyticsConfig = {
  hide_trend?: boolean;
  hide_streak?: boolean; // deprecated
  show_streak?: boolean; // default: true
  avoid?: boolean; // deprecated, use direction instead
  direction?: "increase" | "decrease" | "neutral"; // increase=positive streaks good, decrease=negative good, neutral=no flame
  lifetime_streak?: boolean; // if true, load all-time data for streak calc
  streak_seed?: number; // pre-log days to add to streak display
  trend_period?: number;
  higher_is_better?: boolean; // true = up is good (green), false = down is good (green)
};

type NotificationConfig = {
  streak_alerts?: {
    enabled?: boolean;
    negative_thresholds?: number[];
    positive_thresholds?: number[];
    last_notified_threshold?: number | null;
    last_streak_sign?: "positive" | "negative" | "zero" | null;
  };
};

type GoalsConfig = {
  goals: Goal[];
};

type Metric = {
  metric_id: string;
  metric_name: string;
  type: MetricType;
  private: boolean;
  active: boolean;
  show_ma: boolean;
  ma_periods_csv: string | null;
  default_value: number | null;
  min_value: number | null;
  max_value: number | null;
  disallowed_values: string | null;
  start_date: string | null;
  required: boolean;
  required_since: string | null;
  group: string | null;
  metric_order: number | null;
  group_order: number | null;
  is_calculated: boolean;
  calc_expr: string | null;
  preset_values_csv: string | null;
  stt_enabled: boolean;
  analytics_config: AnalyticsConfig | null;
  notification_config: NotificationConfig | null;
  goals_config: GoalsConfig | null;
};

type GroupInfo = {
  name: string;
  displayName: string;
  order: number;
  count: number;
};

// Sortable group row component
function SortableGroupRow({
  group,
  isFirst,
  isLast,
}: {
  group: GroupInfo;
  isFirst: boolean;
  isLast: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.name || "_ungrouped",
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className="border-b last:border-0">
      <td className="py-2 px-2 w-8">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab hover:bg-muted rounded p-1"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </td>
      <td className="py-2 px-2 font-medium">{group.displayName}</td>
      <td className="py-2 px-2 text-right tabular-nums">{group.count}</td>
      <td className="py-2 px-2 text-right text-xs text-muted-foreground tabular-nums">
        {group.order}
      </td>
    </tr>
  );
}

// Sortable metric row component
const SortableMetricRow = React.memo(function SortableMetricRow({
  metric,
  metricIds,
  groupNames,
  showAdvanced,
  onFieldChange,
  savingFields,
  onDelete,
  onNotificationClick,
  onGoalsClick,
  onStatsClick,
}: {
  metric: Metric;
  metricIds: string[];
  groupNames: string[];
  showAdvanced: boolean;
  onFieldChange: (metricId: string, field: string, value: unknown) => Promise<void>;
  savingFields: Set<string>;
  onDelete: (metricId: string) => void;
  onNotificationClick: (metric: Metric) => void;
  onGoalsClick: (metric: Metric) => void;
  onStatsClick: (metric: Metric) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: metric.metric_id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isSaving = (field: string) => savingFields.has(`${metric.metric_id}:${field}`);

  return (
    <tr ref={setNodeRef} style={style} className="border-b hover:bg-muted/30">
      {/* Drag handle + ID - combined sticky cell */}
      <td className="py-2 px-1 sticky left-0 z-10 bg-background border-r">
        <div className="flex items-center gap-1">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab hover:bg-muted rounded p-1 shrink-0"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
          <span className="font-mono text-xs text-muted-foreground truncate w-[120px]">
            {metric.metric_id.replace(/^__demo_[0-9a-f]{8}_/, "")}
          </span>
        </div>
      </td>

      {/* Name */}
      <td className="py-2 px-2 min-w-[140px]">
        <EditableText
          value={metric.metric_name}
          onChange={(v) => onFieldChange(metric.metric_id, "metric_name", v)}
          saving={isSaving("metric_name")}
        />
      </td>

      {/* Group */}
      <td className="py-2 px-2 min-w-[120px]">
        <Combobox
          value={metric.group || ""}
          onChange={(v) => onFieldChange(metric.metric_id, "group", v || null)}
          options={groupNames}
          placeholder="(none)"
          className="w-full"
        />
      </td>

      {/* Order */}
      <td className="py-2 px-2 min-w-[100px]">
        <EditableNumber
          value={metric.metric_order ?? 0}
          onChange={(v) => onFieldChange(metric.metric_id, "metric_order", v)}
          saving={isSaving("metric_order")}
        />
      </td>

      {/* Type */}
      <td className="py-2 px-2 min-w-[120px]">
        <select
          value={metric.type}
          onChange={(e) => onFieldChange(metric.metric_id, "type", e.target.value)}
          className="w-full h-8 text-xs border rounded-md px-2 bg-background text-foreground"
        >
          <option value="checkbox">checkbox</option>
          <option value="score">score</option>
          <option value="count">count</option>
          <option value="number">number</option>
          <option value="time">time</option>
          <option value="hhmm">HH:MM</option>
          <option value="text">text</option>
        </select>
      </td>

      {/* Calculated */}
      <td className="py-2 px-2 w-[40px] text-center">
        <input
          type="checkbox"
          checked={metric.is_calculated}
          onChange={(e) => onFieldChange(metric.metric_id, "is_calculated", e.target.checked)}
          className="h-4 w-4"
        />
      </td>

      {/* Formula */}
      <td className="py-2 px-2 min-w-[180px]">
        {metric.is_calculated && (
          <FormulaInput
            value={metric.calc_expr || ""}
            onChange={(v) => onFieldChange(metric.metric_id, "calc_expr", v || null)}
            metricIds={metricIds}
            className="w-full"
          />
        )}
      </td>

      {/* Advanced fields */}
      {showAdvanced && (
        <>
          <td className="py-2 px-2 min-w-[90px]">
            <EditableNumber
              value={metric.default_value}
              onChange={(v) => onFieldChange(metric.metric_id, "default_value", v)}
              saving={isSaving("default_value")}
              allowNull
            />
          </td>
          <td className="py-2 px-2 min-w-[90px]">
            <EditableNumber
              value={metric.min_value}
              onChange={(v) => onFieldChange(metric.metric_id, "min_value", v)}
              saving={isSaving("min_value")}
              allowNull
            />
          </td>
          <td className="py-2 px-2 min-w-[90px]">
            <EditableNumber
              value={metric.max_value}
              onChange={(v) => onFieldChange(metric.metric_id, "max_value", v)}
              saving={isSaving("max_value")}
              allowNull
            />
          </td>
          <td className="py-2 px-2 min-w-[110px]">
            <EditableText
              value={metric.disallowed_values || ""}
              onChange={(v) => onFieldChange(metric.metric_id, "disallowed_values", v || null)}
              saving={isSaving("disallowed_values")}
              placeholder="1,2,3"
            />
          </td>
        </>
      )}

      {/* Private */}
      <td className="py-2 px-2 w-[40px] text-center">
        <input
          type="checkbox"
          checked={metric.private}
          onChange={(e) => onFieldChange(metric.metric_id, "private", e.target.checked)}
          className="h-4 w-4"
        />
      </td>

      {/* Required */}
      <td className="py-2 px-2 w-[40px] text-center">
        <input
          type="checkbox"
          checked={metric.required}
          onChange={(e) => onFieldChange(metric.metric_id, "required", e.target.checked)}
          className="h-4 w-4"
        />
      </td>

      {/* Active */}
      <td className="py-2 px-2 w-[40px] text-center">
        <input
          type="checkbox"
          checked={metric.active}
          onChange={(e) => onFieldChange(metric.metric_id, "active", e.target.checked)}
          className="h-4 w-4"
        />
      </td>

      {/* More advanced fields */}
      {showAdvanced && (
        <>
          <td className="py-2 px-2 w-[50px] text-center">
            <input
              type="checkbox"
              checked={metric.show_ma}
              onChange={(e) => onFieldChange(metric.metric_id, "show_ma", e.target.checked)}
              className="h-4 w-4"
            />
          </td>
          <td className="py-2 px-2 min-w-[120px]">
            <EditableText
              value={metric.ma_periods_csv || ""}
              onChange={(v) => onFieldChange(metric.metric_id, "ma_periods_csv", v || null)}
              saving={isSaving("ma_periods_csv")}
              placeholder="7,30,90"
            />
          </td>
          <td className="py-2 px-2 min-w-[140px]">
            <Input
              type="date"
              value={metric.start_date || ""}
              onChange={(e) => onFieldChange(metric.metric_id, "start_date", e.target.value || null)}
              className="h-8 text-xs"
            />
          </td>
          <td className="py-2 px-2 min-w-[150px]">
            <EditableText
              value={metric.preset_values_csv || ""}
              onChange={(v) => onFieldChange(metric.metric_id, "preset_values_csv", v || null)}
              saving={isSaving("preset_values_csv")}
              placeholder="5,6,8"
            />
          </td>
          {/* Hide Trend - only relevant for numeric types */}
          <td className="py-2 px-2 w-[50px] text-center">
            {["number", "score", "count", "time", "hhmm"].includes(metric.type) && (
              <input
                type="checkbox"
                checked={metric.analytics_config?.hide_trend ?? false}
                onChange={(e) => {
                  const newConfig = {
                    ...(metric.analytics_config || {}),
                    hide_trend: e.target.checked,
                  };
                  onFieldChange(metric.metric_id, "analytics_config", newConfig);
                }}
                className="h-4 w-4"
                title="Hide trend indicator for this metric"
              />
            )}
          </td>
          {/* Lower is Better - only relevant for numeric types */}
          <td className="py-2 px-2 w-[50px] text-center">
            {["number", "score", "count", "time", "hhmm"].includes(metric.type) && (
              <input
                type="checkbox"
                checked={metric.analytics_config?.higher_is_better === false}
                onChange={(e) => {
                  const newConfig = {
                    ...(metric.analytics_config || {}),
                    higher_is_better: !e.target.checked,
                  };
                  onFieldChange(metric.metric_id, "analytics_config", newConfig);
                }}
                className="h-4 w-4"
                title="Lower values are better (green when trend is down)"
              />
            )}
          </td>
          {/* Show Streak - for all non-text types */}
          <td className="py-2 px-2 w-[50px] text-center">
            {metric.type !== "text" && (
              <input
                type="checkbox"
                checked={
                  metric.analytics_config?.show_streak ??
                  (metric.analytics_config?.hide_streak === true ? false : true)
                }
                onChange={(e) => {
                  const newConfig = {
                    ...(metric.analytics_config || {}),
                    show_streak: e.target.checked,
                    hide_streak: undefined, // clear deprecated
                  };
                  onFieldChange(metric.metric_id, "analytics_config", newConfig);
                }}
                className="h-4 w-4"
                title="Show streak indicator for this metric"
              />
            )}
          </td>
          {/* Direction - for all non-text types */}
          <td className="py-2 px-2 w-[80px] text-center">
            {metric.type !== "text" && (
              <select
                value={metric.analytics_config?.direction ?? (metric.analytics_config?.avoid ? "decrease" : "increase")}
                onChange={(e) => {
                  const newConfig = {
                    ...(metric.analytics_config || {}),
                    direction: e.target.value as "increase" | "decrease" | "neutral",
                    avoid: undefined, // Clear deprecated field
                  };
                  onFieldChange(metric.metric_id, "analytics_config", newConfig);
                }}
                className="h-7 text-xs border rounded px-1 bg-background"
                title="Increase: positive streaks good, Decrease: negative streaks good, Neutral: no flame"
              >
                <option value="increase">↑ Inc</option>
                <option value="decrease">↓ Dec</option>
                <option value="neutral">— Neut</option>
              </select>
            )}
          </td>
          {/* Lifetime - for all non-text types, only if streak is enabled */}
          <td className="py-2 px-2 w-[50px] text-center">
            {metric.type !== "text" && (
              metric.analytics_config?.show_streak ??
              (metric.analytics_config?.hide_streak === true ? false : true)
            ) && (
              <input
                type="checkbox"
                checked={metric.analytics_config?.lifetime_streak ?? false}
                onChange={(e) => {
                  const newConfig = {
                    ...(metric.analytics_config || {}),
                    lifetime_streak: e.target.checked,
                  };
                  onFieldChange(metric.metric_id, "analytics_config", newConfig);
                }}
                className="h-4 w-4"
                title="Track all-time streak (no 365-day limit)"
              />
            )}
          </td>
          {/* Seed - for all non-text types, only if lifetime is enabled */}
          <td className="py-2 px-2 w-[60px] text-center">
            {metric.type !== "text" && metric.analytics_config?.lifetime_streak && (
              <input
                type="number"
                min={0}
                value={metric.analytics_config?.streak_seed ?? ""}
                onChange={(e) => {
                  const val = e.target.value === "" ? undefined : parseInt(e.target.value, 10);
                  const newConfig = {
                    ...(metric.analytics_config || {}),
                    streak_seed: val,
                  };
                  onFieldChange(metric.metric_id, "analytics_config", newConfig);
                }}
                className="w-14 text-xs border rounded px-1 py-0.5 text-center"
                placeholder="0"
                title="Pre-log days to add to streak"
              />
            )}
          </td>
          {/* STT - only for text metrics */}
          <td className="py-2 px-2 w-[50px] text-center">
            {metric.type === "text" && (
              <input
                type="checkbox"
                checked={metric.stt_enabled}
                onChange={(e) =>
                  onFieldChange(metric.metric_id, "stt_enabled", e.target.checked)
                }
                className="h-4 w-4"
                title="Enable speech-to-text for this metric"
              />
            )}
          </td>
        </>
      )}

      {/* Actions */}
      <td className="py-2 px-2 w-[140px]">
        <div className="flex gap-1">
          {/* Stats button - only for non-text metrics */}
          {metric.type !== "text" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-primary hover:bg-primary/10"
              title="View detailed stats"
              onClick={() => onStatsClick(metric)}
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
          )}
          {/* Goals button - only for non-text metrics */}
          {metric.type !== "text" && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 w-7 p-0",
                metric.goals_config?.goals && metric.goals_config.goals.length > 0
                  ? "text-green-500 hover:text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              title="Goal settings"
              onClick={() => onGoalsClick(metric)}
            >
              <Target className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 w-7 p-0",
              metric.notification_config?.streak_alerts?.enabled
                ? "text-amber-500 hover:text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
            title="Notification settings"
            onClick={() => onNotificationClick(metric)}
          >
            <Bell className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            title="Delete metric"
            onClick={() => onDelete(metric.metric_id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}, (prev, next) => {
  // Only re-render if this row's data actually changed
  if (!Object.is(prev.metric, next.metric)) return false;
  if (prev.showAdvanced !== next.showAdvanced) return false;
  if (prev.groupNames !== next.groupNames) return false;
  if (prev.metricIds !== next.metricIds) return false;
  // savingFields: only care about entries for this specific metric
  const id = prev.metric.metric_id;
  const prevSaving = [...prev.savingFields].filter(k => k.startsWith(id + ':'));
  const nextSaving = [...next.savingFields].filter(k => k.startsWith(id + ':'));
  if (prevSaving.length !== nextSaving.length) return false;
  if (prevSaving.some(k => !next.savingFields.has(k))) return false;
  return true;
});

// Editable text cell
function EditableText({
  value,
  onChange,
  saving = false,
  placeholder = "",
}: {
  value: string;
  onChange: (v: string) => Promise<void>;
  saving?: boolean;
  placeholder?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLocalValue(value);
    setDirty(false);
  }, [value]);

  const handleBlur = async () => {
    if (dirty && localValue !== value) {
      await onChange(localValue);
      setDirty(false);
    }
  };

  return (
    <div className="relative">
      <Input
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value);
          setDirty(true);
        }}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="h-8 text-xs"
      />
      {saving && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
          ...
        </span>
      )}
    </div>
  );
}

// Editable number cell
function EditableNumber({
  value,
  onChange,
  saving = false,
  allowNull = false,
}: {
  value: number | null;
  onChange: (v: number | null) => Promise<void>;
  saving?: boolean;
  allowNull?: boolean;
}) {
  const [localValue, setLocalValue] = useState(value?.toString() ?? "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLocalValue(value?.toString() ?? "");
    setDirty(false);
  }, [value]);

  const handleBlur = async () => {
    if (!dirty) return;

    const trimmed = localValue.trim();
    if (trimmed === "") {
      if (allowNull && value !== null) {
        await onChange(null);
      }
    } else {
      const num = Number(trimmed);
      if (Number.isFinite(num) && num !== value) {
        await onChange(num);
      }
    }
    setDirty(false);
  };

  return (
    <div className="relative">
      <Input
        type="number"
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value);
          setDirty(true);
        }}
        onBlur={handleBlur}
        className="h-8 text-xs text-right tabular-nums"
      />
      {saving && (
        <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
          ...
        </span>
      )}
    </div>
  );
}

// Icon components
function GripVertical({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="19" r="1" />
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function Trash2({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

function Bell({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function BarChart3({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

function Target({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

// Main page component
export default function MetricsPage() {
  const { confirm } = useToast();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showPrivate, setShowPrivate] = useState(true);
  const [filterGroup, setFilterGroup] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterRequired, setFilterRequired] = useState<string>("all");
  const [filterCalculated, setFilterCalculated] = useState<string>("all");
  const [showFormulaHelp, setShowFormulaHelp] = useState(false);
  const [groupsExpanded, setGroupsExpanded] = useState(false);

  // Notification config sheet state
  const [notificationMetric, setNotificationMetric] = useState<Metric | null>(null);
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [negativeThresholds, setNegativeThresholds] = useState("");
  const [positiveThresholds, setPositiveThresholds] = useState("");
  const [savingNotification, setSavingNotification] = useState(false);

  // Stats sheet state
  const [statsMetric, setStatsMetric] = useState<Metric | null>(null);

  // Goals config sheet state
  const [goalsMetric, setGoalsMetric] = useState<Metric | null>(null);

  // Track which fields are currently saving
  const [savingFields, setSavingFields] = useState<Set<string>>(new Set());

  // New metric form state
  const [showNewMetric, setShowNewMetric] = useState(false);
  const [newMetric, setNewMetric] = useState({
    metric_id: "",
    metric_name: "",
    type: "number" as MetricType,
    group: "",
    metric_order: "",
    is_calculated: false,
    calc_expr: "",
    default_value: "",
    min_value: "",
    max_value: "",
    disallowed_values: "",
    private: false,
    required: false,
    active: true,
    show_ma: false,
    ma_periods_csv: "",
    start_date: "",
    preset_values_csv: "",
    stt_enabled: false,
  });
  const newNameRef = useRef<HTMLInputElement>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Compute groups
  const groups = useMemo<GroupInfo[]>(() => {
    const map = new Map<string, GroupInfo>();

    metrics.forEach((m) => {
      const rawName = m.group ?? "";
      const displayName = rawName || "Ungrouped";
      const groupOrder = typeof m.group_order === "number" ? m.group_order : 9999;

      const current = map.get(rawName);
      if (!current) {
        map.set(rawName, { name: rawName, displayName, order: groupOrder, count: 1 });
      } else {
        current.count += 1;
        if (groupOrder < current.order) current.order = groupOrder;
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [metrics]);

  const groupNames = useMemo(
    () => groups.map((g) => g.name).filter((n) => n !== ""),
    [groups]
  );

  // Stable metricIds: only changes reference when IDs actually change (not on field updates)
  const metricIdsKey = useMemo(() => metrics.map((m) => m.metric_id).join("\0"), [metrics]);
  const metricIds = useMemo(() => metrics.map((m) => m.metric_id), [metricIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter visible metrics
  const visibleMetrics = useMemo(() => {
    return metrics.filter((m) => {
      if (!showArchived && !m.active) return false;
      if (!showPrivate && m.private) return false;
      if (filterGroup !== "all") {
        const mGroup = m.group || "";
        if (filterGroup === "__none__" ? mGroup !== "" : mGroup !== filterGroup) return false;
      }
      if (filterType !== "all" && m.type !== filterType) return false;
      if (filterRequired === "yes" && !m.required) return false;
      if (filterRequired === "no" && m.required) return false;
      if (filterCalculated === "yes" && !m.is_calculated) return false;
      if (filterCalculated === "no" && m.is_calculated) return false;
      return true;
    });
  }, [metrics, showArchived, showPrivate, filterGroup, filterType, filterRequired, filterCalculated]);

  // Sort metrics by group then metric_order
  const sortedMetrics = useMemo(() => {
    const groupOrderMap = new Map<string, number>();
    for (const g of groups) {
      groupOrderMap.set(g.name, g.order);
    }

    return [...visibleMetrics].sort((a, b) => {
      const ga = a.group || "";
      const gb = b.group || "";
      const goa = groupOrderMap.get(ga) ?? 9999;
      const gob = groupOrderMap.get(gb) ?? 9999;
      if (goa !== gob) return goa - gob;
      if (ga !== gb) return ga.localeCompare(gb);
      const oa = a.metric_order ?? 0;
      const ob = b.metric_order ?? 0;
      if (oa !== ob) return oa - ob;
      return a.metric_id.localeCompare(b.metric_id);
    });
  }, [visibleMetrics, groups]);

  // Load metrics
  const loadMetrics = useCallback(async () => {
    try {
      setError(null);
      const headers = await getAuthHeaders();
      const res = await fetch("/api/config", { headers });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Failed to load metrics");
        return;
      }

      const arr = Array.isArray(data) ? data : [];
      const normalized: Metric[] = arr.map((r: Record<string, unknown>) => ({
        metric_id: String(r.metric_id),
        metric_name: String(r.metric_name ?? r.metric_id).replace(/\s*\[[0-9a-f]{8}\]$/, ""),
        type: r.type as MetricType,
        private: !!r.private,
        active: !!r.active,
        show_ma: !!r.show_ma,
        ma_periods_csv: (r.ma_periods_csv ?? null) as string | null,
        start_date: (r.start_date ?? null) as string | null,
        default_value: (r.default_value ?? null) as number | null,
        min_value: (r.min_value ?? null) as number | null,
        max_value: (r.max_value ?? null) as number | null,
        disallowed_values: (r.disallowed_values ?? null) as string | null,
        required: !!r.required,
        required_since: (r.required_since ?? null) as string | null,
        group: (r.group ?? null) as string | null,
        metric_order: typeof r.metric_order === "number" ? r.metric_order : null,
        group_order: typeof r.group_order === "number" ? r.group_order : null,
        is_calculated: !!r.is_calculated,
        calc_expr: (r.calc_expr ?? null) as string | null,
        preset_values_csv: (r.preset_values_csv ?? null) as string | null,
        stt_enabled: !!r.stt_enabled,
        analytics_config: (r.analytics_config ?? null) as AnalyticsConfig | null,
        notification_config: (r.notification_config ?? null) as NotificationConfig | null,
        goals_config: (r.goals_config ?? null) as GoalsConfig | null,
      }));

      setMetrics(normalized);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  // --- Tour ---
  const { status: tourStatus, loading: tourLoading, devReset: tourDevReset } = useTour();
  const tourLaunched = useRef(false);

  const launchMetricsTour = useCallback(() => {
    import("driver.js").then(({ driver }) => {
      const driverObj = driver({
        animate: true,
        showProgress: true,
        allowClose: true,
        steps: [
          {
            popover: {
              title: "Your Metrics",
              description:
                "The demo metrics from the Today tour are already here — one of every type — so you can see how they're configured. This is where you manage everything.",
              nextBtnText: "Show me →",
            },
          },
          {
            element: '[data-tour="metrics-table"]',
            popover: {
              title: "The Metrics Table",
              description:
                "Each row is one metric. Click any cell to edit it inline — changes auto-save instantly. Drag the ⠿ handle to reorder. The order here is the same order metrics appear on your Today page.",
              side: "top",
              align: "start",
            },
          },
          {
            popover: {
              title: "Per-Metric Actions",
              description:
                "Scroll right on any row to see four action buttons: view the stats chart, configure goals, set up streak notifications, and delete.",
            },
          },
          {
            element: '[data-tour="calc-col"]',
            popover: {
              title: "Calculated Metrics",
              description:
                "Check the Calc box to derive a metric from others using a formula — e.g. sleep window, net calories, or any expression. Click Formula Help at the top for available functions.",
              side: "bottom",
              align: "center",
            },
          },
          {
            element: '[data-tour="add-metric-btn"]',
            popover: {
              title: "Add Your Own Metrics",
              description:
                "Click here to create a new metric. Choose a name, type (checkbox, number, score, count, duration, time-of-day, or text), and group.",
              side: "bottom",
              align: "end",
            },
          },
          {
            element: '[data-tour="show-advanced-btn"]',
            popover: {
              title: "Advanced Settings",
              description:
                "Toggle advanced columns to set value bounds, moving averages, parent metrics (conditional fields), streak direction, and more.",
              side: "bottom",
              align: "start",
            },
          },
          {
            popover: {
              title: "One More Stop",
              description:
                "Last up: the Log page — your full history in a spreadsheet, with inline editing, filters, and CSV export.",
              nextBtnText: "Next: Log →",
              onNextClick: () => {
                driverObj.destroy();
                window.location.href = "/log";
              },
            },
          },
        ],
      });
      driverObj.drive();
    });
  }, []);

  // Auto-launch the metrics tour when demo data exists and metrics have loaded
  useEffect(() => {
    if (tourStatus !== "seeded") return;
    if (loading || metrics.length === 0) return;
    if (tourLaunched.current) return;
    tourLaunched.current = true;
    setTimeout(launchMetricsTour, 400);
  }, [tourStatus, loading, metrics, launchMetricsTour]);

  // Focus new metric name input
  useEffect(() => {
    if (showNewMetric && newNameRef.current) {
      newNameRef.current.focus();
    }
  }, [showNewMetric]);

  // Update a single field on a metric (auto-save)
  const updateMetricField = useCallback(
    async (metricId: string, field: string, value: unknown) => {
      const key = `${metricId}:${field}`;
      setSavingFields((prev) => new Set(prev).add(key));

      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/metrics", {
          method: "PATCH",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ metric_id: metricId, [field]: value }),
        });

        if (!res.ok) {
          const j = await res.json().catch(() => null);
          setError(j?.error || `Failed to update ${field}`);
          return;
        }

        // Optimistic update
        setMetrics((prev) =>
          prev.map((m) =>
            m.metric_id === metricId ? { ...m, [field]: value } : m
          )
        );
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
      } finally {
        setSavingFields((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    []
  );

  // Handle group drag end
  const handleGroupDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = groups.findIndex((g) => (g.name || "_ungrouped") === active.id);
      const newIndex = groups.findIndex((g) => (g.name || "_ungrouped") === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(groups, oldIndex, newIndex);

      // Assign new group_order values
      const orderByGroup = new Map<string, number>();
      reordered.forEach((g, idx) => {
        orderByGroup.set(g.name, (idx + 1) * 10);
      });

      // Update all metrics with new group_order
      try {
        const headers = await getAuthHeaders();
        const updates = metrics.map((m) =>
          fetch("/api/metrics", {
            method: "PATCH",
            headers: { ...headers, "content-type": "application/json" },
            body: JSON.stringify({
              metric_id: m.metric_id,
              group_order: orderByGroup.get(m.group ?? "") ?? 0,
            }),
          })
        );

        await Promise.all(updates);
        await loadMetrics();
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
      }
    },
    [groups, metrics, loadMetrics]
  );

  // Handle metric drag end
  const handleMetricDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = sortedMetrics.findIndex((m) => m.metric_id === active.id);
      const newIndex = sortedMetrics.findIndex((m) => m.metric_id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const movedMetric = sortedMetrics[oldIndex];
      const targetMetric = sortedMetrics[newIndex];

      // Check if moving to different group
      const newGroup = targetMetric.group;
      const sameGroup = movedMetric.group === newGroup;

      // Reorder within group (or move to new group)
      const groupMetrics = sortedMetrics.filter((m) => m.group === newGroup);
      const reordered = sameGroup
        ? arrayMove(
            groupMetrics,
            groupMetrics.findIndex((m) => m.metric_id === active.id),
            groupMetrics.findIndex((m) => m.metric_id === over.id)
          )
        : [
            ...groupMetrics.slice(0, groupMetrics.findIndex((m) => m.metric_id === over.id)),
            movedMetric,
            ...groupMetrics.slice(groupMetrics.findIndex((m) => m.metric_id === over.id)),
          ];

      // Assign new metric_order values
      const updates: { metric_id: string; metric_order: number; group?: string | null }[] = [];
      reordered.forEach((m, idx) => {
        const newOrder = (idx + 1) * 10;
        if (m.metric_id === movedMetric.metric_id && !sameGroup) {
          updates.push({ metric_id: m.metric_id, metric_order: newOrder, group: newGroup });
        } else if (m.metric_order !== newOrder) {
          updates.push({ metric_id: m.metric_id, metric_order: newOrder });
        }
      });

      if (updates.length === 0) return;

      try {
        const headers = await getAuthHeaders();
        await Promise.all(
          updates.map((u) =>
            fetch("/api/metrics", {
              method: "PATCH",
              headers: { ...headers, "content-type": "application/json" },
              body: JSON.stringify(u),
            })
          )
        );
        await loadMetrics();
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
      }
    },
    [sortedMetrics, loadMetrics]
  );

  // Create new metric
  const createMetric = useCallback(async () => {
    if (!newMetric.metric_id.trim() || !newMetric.metric_name.trim()) {
      setError("metric_id and metric_name are required");
      return;
    }

    try {
      const headers = await getAuthHeaders();
      const payload: Record<string, unknown> = {
        metric_id: newMetric.metric_id.trim(),
        metric_name: newMetric.metric_name.trim(),
        type: newMetric.type,
        group: newMetric.group.trim() || null,
        metric_order: newMetric.metric_order ? Number(newMetric.metric_order) : 0,
        is_calculated: newMetric.is_calculated,
        calc_expr: newMetric.calc_expr.trim() || null,
        private: newMetric.private,
        required: newMetric.required,
        active: newMetric.active,
        show_ma: newMetric.show_ma,
        ma_periods_csv: newMetric.ma_periods_csv.trim() || null,
        start_date: newMetric.start_date || null,
        preset_values_csv: newMetric.preset_values_csv.trim() || null,
        stt_enabled: newMetric.stt_enabled,
      };

      // Only include validation fields if they have values
      if (newMetric.default_value !== "") {
        payload.default_value = Number(newMetric.default_value);
      }
      if (newMetric.min_value !== "") {
        payload.min_value = Number(newMetric.min_value);
      }
      if (newMetric.max_value !== "") {
        payload.max_value = Number(newMetric.max_value);
      }
      if (newMetric.disallowed_values.trim()) {
        payload.disallowed_values = newMetric.disallowed_values.trim();
      }

      const res = await fetch("/api/metrics", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(j?.error || "Failed to create metric");
        return;
      }

      setShowNewMetric(false);
      setNewMetric({
        metric_id: "",
        metric_name: "",
        type: "number",
        group: "",
        metric_order: "",
        is_calculated: false,
        calc_expr: "",
        default_value: "",
        min_value: "",
        max_value: "",
        disallowed_values: "",
        private: false,
        required: false,
        active: true,
        show_ma: false,
        ma_periods_csv: "",
        start_date: "",
        preset_values_csv: "",
        stt_enabled: false,
      });
      await loadMetrics();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  }, [newMetric, loadMetrics]);

  // Delete a metric
  const deleteMetric = useCallback(
    async (metricId: string) => {
      const metric = metrics.find((m) => m.metric_id === metricId);
      if (!metric) return;

      const confirmed = await confirm({
        message: `Delete "${metric.metric_name}" (${metricId})?\n\nThis will permanently delete:\n- The metric configuration\n- ALL historical log data for this metric\n\nThis cannot be undone.`,
        destructive: true,
        confirmLabel: "Delete",
      });
      if (!confirmed) return;

      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/metrics/${encodeURIComponent(metricId)}`, {
          method: "DELETE",
          headers,
        });

        const j = await res.json().catch(() => null);

        if (!res.ok) {
          setError(j?.error || "Failed to delete metric");
          console.error("Delete failed:", res.status, j);
          return;
        }

        // Reload from database to confirm deletion
        await loadMetrics();
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
        console.error("Delete exception:", e);
      }
    },
    [metrics, loadMetrics]
  );

  // Open notification config sheet
  const openNotificationConfig = useCallback((metric: Metric) => {
    setNotificationMetric(metric);
    const config = metric.notification_config?.streak_alerts;
    setNotificationEnabled(config?.enabled ?? false);
    setNegativeThresholds(config?.negative_thresholds?.join(", ") ?? "");
    setPositiveThresholds(config?.positive_thresholds?.join(", ") ?? "");
  }, []);

  // Save notification config
  const saveNotificationConfig = useCallback(async () => {
    if (!notificationMetric) return;

    setSavingNotification(true);
    try {
      // Parse thresholds from comma-separated strings
      const parseThresholds = (str: string): number[] => {
        return str
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n));
      };

      const negThresholds = parseThresholds(negativeThresholds).filter((n) => n <= 0);
      const posThresholds = parseThresholds(positiveThresholds).filter((n) => n >= 0);

      const newConfig: NotificationConfig = {
        streak_alerts: {
          enabled: notificationEnabled,
          negative_thresholds: negThresholds.length > 0 ? negThresholds : undefined,
          positive_thresholds: posThresholds.length > 0 ? posThresholds : undefined,
          // Preserve existing tracking fields
          last_notified_threshold: notificationMetric.notification_config?.streak_alerts?.last_notified_threshold,
          last_streak_sign: notificationMetric.notification_config?.streak_alerts?.last_streak_sign,
        },
      };

      const headers = await getAuthHeaders();
      const res = await fetch("/api/metrics", {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          metric_id: notificationMetric.metric_id,
          notification_config: newConfig,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error || "Failed to save notification config");
        return;
      }

      // Update local state
      setMetrics((prev) =>
        prev.map((m) =>
          m.metric_id === notificationMetric.metric_id
            ? { ...m, notification_config: newConfig }
            : m
        )
      );

      setNotificationMetric(null);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setSavingNotification(false);
    }
  }, [notificationMetric, notificationEnabled, negativeThresholds, positiveThresholds]);

  // Save goals config
  const saveGoalsConfig = useCallback(async (goals: Goal[]) => {
    if (!goalsMetric) return;

    try {
      const newConfig: GoalsConfig = { goals };

      const headers = await getAuthHeaders();
      const res = await fetch("/api/metrics", {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          metric_id: goalsMetric.metric_id,
          goals_config: newConfig,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error || "Failed to save goals config");
        return;
      }

      // Update local state
      setMetrics((prev) =>
        prev.map((m) =>
          m.metric_id === goalsMetric.metric_id
            ? { ...m, goals_config: newConfig }
            : m
        )
      );

      setGoalsMetric(null);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  }, [goalsMetric]);

  // Auto-generate metric_id from name
  const handleNewNameChange = (name: string) => {
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const currentSlug = newMetric.metric_name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    const userOverrodeId = newMetric.metric_id && newMetric.metric_id !== currentSlug;

    setNewMetric((prev) => ({
      ...prev,
      metric_name: name,
      metric_id: userOverrodeId ? prev.metric_id : slug,
    }));
  };

  if (loading) {
    return (
      <main className="p-6 max-w-7xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Metrics</h1>
        <div className="text-sm text-muted-foreground">Loading...</div>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Metrics</h1>
          <Badge variant="secondary">{metrics.length} total</Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            data-tour="show-advanced-btn"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? "Hide Advanced" : "Show Advanced"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFormulaHelp(true)}
          >
            Formula Help
          </Button>
          <Button
            size="sm"
            data-tour="add-metric-btn"
            onClick={() => setShowNewMetric(true)}
            disabled={showNewMetric}
          >
            + Add Metric
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 text-sm flex-wrap">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4"
          />
          Show archived
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showPrivate}
            onChange={(e) => setShowPrivate(e.target.checked)}
            className="h-4 w-4"
          />
          Show private
        </label>
        <select
          value={filterGroup}
          onChange={(e) => setFilterGroup(e.target.value)}
          className="h-8 rounded-md border border-input bg-background text-foreground px-2 text-sm"
        >
          <option value="all">All groups</option>
          <option value="__none__">Ungrouped</option>
          {groupNames.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="h-8 rounded-md border border-input bg-background text-foreground px-2 text-sm"
        >
          <option value="all">All types</option>
          {(["checkbox", "number", "score", "count", "time", "hhmm", "text"] as MetricType[]).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={filterRequired}
          onChange={(e) => setFilterRequired(e.target.value)}
          className="h-8 rounded-md border border-input bg-background text-foreground px-2 text-sm"
        >
          <option value="all">Required: any</option>
          <option value="yes">Required only</option>
          <option value="no">Not required</option>
        </select>
        <select
          value={filterCalculated}
          onChange={(e) => setFilterCalculated(e.target.value)}
          className="h-8 rounded-md border border-input bg-background text-foreground px-2 text-sm"
        >
          <option value="all">Calculated: any</option>
          <option value="yes">Calculated only</option>
          <option value="no">Not calculated</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
          {error}
          <Button
            variant="ghost"
            size="sm"
            className="ml-2 h-6 px-2"
            onClick={() => setError(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Groups section */}
      <Card>
        <CardHeader
          className="py-2 px-4 cursor-pointer hover:bg-muted/50"
          onClick={() => setGroupsExpanded(!groupsExpanded)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Groups ({groups.length})
            </CardTitle>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                groupsExpanded && "rotate-180"
              )}
            />
          </div>
        </CardHeader>
        {groupsExpanded && (
          <CardContent className="p-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleGroupDragEnd}
            >
              <SortableContext
                items={groups.map((g) => g.name || "_ungrouped")}
                strategy={verticalListSortingStrategy}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground text-xs">
                      <th className="w-8"></th>
                      <th className="text-left py-1 px-2">Group</th>
                      <th className="text-right py-1 px-2"><Hint text="Number of active metrics in this group">Metrics</Hint></th>
                      <th className="text-right py-1 px-2"><Hint text="Drag rows to set the display order on the Today page">Order</Hint></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g, idx) => (
                      <SortableGroupRow
                        key={g.name || "_ungrouped"}
                        group={g}
                        isFirst={idx === 0}
                        isLast={idx === groups.length - 1}
                      />
                    ))}
                  </tbody>
                </table>
              </SortableContext>
            </DndContext>
          </CardContent>
        )}
      </Card>

      {/* Metrics table */}
      <Card data-tour="metrics-table">
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Drag to reorder. Click any cell to edit (changes auto-save).
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[60vh]">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleMetricDragEnd}
            >
              <SortableContext
                items={sortedMetrics.map((m) => m.metric_id)}
                strategy={verticalListSortingStrategy}
              >
                <table className="w-full text-sm whitespace-nowrap border-collapse">
                  <thead className="sticky top-0 z-20 bg-muted">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left py-2 px-1 sticky left-0 z-20 bg-muted border-r">
                        <div className="flex items-center gap-1">
                          <span className="w-6"></span>
                          <span className="w-[120px]"><Hint text="Unique identifier used in formulas and exports. Cannot be changed after creation.">ID</Hint></span>
                        </div>
                      </th>
                      <th className="text-left py-2 px-2 min-w-[140px]">Name</th>
                      <th className="text-left py-2 px-2 min-w-[120px]"><Hint text="Metrics are grouped together on the Today page. Drag group rows above to reorder groups.">Group</Hint></th>
                      <th className="text-center py-2 px-2 min-w-[100px]"><Hint text="Display order within the group. Drag metric rows to reorder.">Order</Hint></th>
                      <th className="text-center py-2 px-2 min-w-[120px]"><Hint text="Input type: checkbox, number, count (integer), score (rated scale), text, time (duration h:mm), or hhmm (time of day)">Type</Hint></th>
                      <th className="text-center py-2 px-2 w-[40px]" data-tour="calc-col"><Hint text="Calculated — value is derived from a formula using other metrics rather than entered manually">Calc</Hint></th>
                      <th className="text-left py-2 px-2 min-w-[180px]"><Hint text="Formula for calculated metrics. Reference other metrics by their ID. Click the formula help button above for available functions.">Formula</Hint></th>
                      {showAdvanced && (
                        <>
                          <th className="text-center py-2 px-2 min-w-[90px]"><Hint text="Default value pre-filled on the Today page. Leave blank for no default.">Default</Hint></th>
                          <th className="text-center py-2 px-2 min-w-[90px]"><Hint text="Minimum allowed value. Entry is rejected if below this.">Min</Hint></th>
                          <th className="text-center py-2 px-2 min-w-[90px]"><Hint text="Maximum allowed value. Entry is rejected if above this.">Max</Hint></th>
                          <th className="text-center py-2 px-2 min-w-[110px]"><Hint text="Comma-separated list of values that are not permitted (e.g. 0,1 to block those specific entries).">Disallow</Hint></th>
                        </>
                      )}
                      <th className="text-center py-2 px-2 w-[40px]"><Hint text="Private — hidden from CSV exports and any shared views">Priv</Hint></th>
                      <th className="text-center py-2 px-2 w-[40px]"><Hint text="Required — you'll be reminded if this metric is missing when you save the day">Req</Hint></th>
                      <th className="text-center py-2 px-2 w-[40px]"><Hint text="Active — inactive metrics are hidden from the Today page but all historical data is preserved">Act</Hint></th>
                      {showAdvanced && (
                        <>
                          <th className="text-center py-2 px-2 w-[50px]"><Hint text="Moving Average — shows a rolling average line on this metric's chart">MA</Hint></th>
                          <th className="text-center py-2 px-2 min-w-[120px]"><Hint text="Number of days in the moving average window (e.g. 7 for a weekly average)">MA Periods</Hint></th>
                          <th className="text-center py-2 px-2 min-w-[140px]"><Hint text="Only show this metric on the Today page from this date onwards. Useful for metrics you started tracking mid-way.">Start Date</Hint></th>
                          <th className="text-center py-2 px-2 min-w-[150px]"><Hint text="Comma-separated quick-pick values shown as buttons on the Today page (e.g. 15,30,60 for reading minutes).">Presets</Hint></th>
                          <th className="text-center py-2 px-2 w-[50px]"><Hint text="No Trend — hides the trend arrow (↑↓) next to this metric on the Today page">No Trend</Hint></th>
                          <th className="text-center py-2 px-2 w-[50px]"><Hint text="Low Good — lower values are better. Reverses trend arrow colors so down = green (e.g. for weight, screen time, drinks).">Low Good</Hint></th>
                          <th className="text-center py-2 px-2 w-[50px]"><Hint text="Show a streak counter (🔥) on the Today page for this metric">Streak</Hint></th>
                          <th className="text-center py-2 px-2 w-[80px]"><Hint text="Increase: logging = streak. Decrease: not logging = streak. Neutral: no streak. Affects streak direction and color.">Direction</Hint></th>
                          <th className="text-center py-2 px-2 w-[50px]"><Hint text="Lifetime — tracks an all-time streak with no 365-day limit (default cap is 1 year)">Lifetime</Hint></th>
                          <th className="text-center py-2 px-2 w-[60px]"><Hint text="Seed days — pre-log days added to the streak when you first start tracking. Useful for metrics you've been doing a while.">Seed</Hint></th>
                          <th className="text-center py-2 px-2 w-[50px]"><Hint text="Enable speech-to-text mic button on the Today page input for this metric (text type only).">STT</Hint></th>
                        </>
                      )}
                      <th className="text-center py-2 px-2 w-[110px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* New metric row */}
                    {showNewMetric && (
                      <tr className="border-b bg-green-50 dark:bg-green-950/30">
                        <td className="py-2 px-1 sticky left-0 z-10 bg-green-50 dark:bg-green-950/30 border-r">
                          <div className="flex items-center gap-1">
                            <span className="w-6"></span>
                            <Input
                              value={newMetric.metric_id}
                              onChange={(e) =>
                                setNewMetric((p) => ({ ...p, metric_id: e.target.value }))
                              }
                              placeholder="metric_id"
                              className="h-8 text-xs font-mono w-[120px]"
                            />
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            ref={newNameRef}
                            value={newMetric.metric_name}
                            onChange={(e) => handleNewNameChange(e.target.value)}
                            placeholder="Metric Name"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Combobox
                            value={newMetric.group}
                            onChange={(v) => setNewMetric((p) => ({ ...p, group: v }))}
                            options={groupNames}
                            placeholder="(none)"
                          />
                        </td>
                        <td className="py-2 px-2 min-w-[100px]">
                          <Input
                            type="number"
                            value={newMetric.metric_order}
                            onChange={(e) =>
                              setNewMetric((p) => ({ ...p, metric_order: e.target.value }))
                            }
                            className="h-8 text-xs text-right"
                          />
                        </td>
                        <td className="py-2 px-2 min-w-[120px]">
                          <select
                            value={newMetric.type}
                            onChange={(e) =>
                              setNewMetric((p) => ({ ...p, type: e.target.value as MetricType }))
                            }
                            className="w-full h-8 text-xs border rounded-md px-2 bg-background text-foreground"
                          >
                            <option value="checkbox">checkbox</option>
                            <option value="score">score</option>
                            <option value="count">count</option>
                            <option value="number">number</option>
                            <option value="time">time</option>
                            <option value="hhmm">HH:MM</option>
                            <option value="text">text</option>
                          </select>
                        </td>
                        {/* Calculated */}
                        <td className="py-2 px-2 w-[40px] text-center">
                          <input
                            type="checkbox"
                            checked={newMetric.is_calculated}
                            onChange={(e) =>
                              setNewMetric((p) => ({ ...p, is_calculated: e.target.checked }))
                            }
                            className="h-4 w-4"
                          />
                        </td>
                        {/* Formula */}
                        <td className="py-2 px-2 min-w-[180px]">
                          {newMetric.is_calculated && (
                            <FormulaInput
                              value={newMetric.calc_expr}
                              onChange={(v) => setNewMetric((p) => ({ ...p, calc_expr: v }))}
                              metricIds={metrics.map((m) => m.metric_id)}
                              className="w-full"
                            />
                          )}
                        </td>
                        {/* Advanced fields */}
                        {showAdvanced && (
                          <>
                            <td className="py-2 px-2 min-w-[90px]">
                              <Input
                                type="number"
                                value={newMetric.default_value}
                                onChange={(e) =>
                                  setNewMetric((p) => ({ ...p, default_value: e.target.value }))
                                }
                                placeholder="Default"
                                className="h-8 text-xs text-right"
                              />
                            </td>
                            <td className="py-2 px-2 min-w-[90px]">
                              <Input
                                type="number"
                                value={newMetric.min_value}
                                onChange={(e) =>
                                  setNewMetric((p) => ({ ...p, min_value: e.target.value }))
                                }
                                placeholder="Min"
                                className="h-8 text-xs text-right"
                              />
                            </td>
                            <td className="py-2 px-2 min-w-[90px]">
                              <Input
                                type="number"
                                value={newMetric.max_value}
                                onChange={(e) =>
                                  setNewMetric((p) => ({ ...p, max_value: e.target.value }))
                                }
                                placeholder="Max"
                                className="h-8 text-xs text-right"
                              />
                            </td>
                            <td className="py-2 px-2 min-w-[110px]">
                              <Input
                                value={newMetric.disallowed_values}
                                onChange={(e) =>
                                  setNewMetric((p) => ({ ...p, disallowed_values: e.target.value }))
                                }
                                placeholder="1,2,3"
                                className="h-8 text-xs"
                              />
                            </td>
                          </>
                        )}
                        {/* Private */}
                        <td className="py-2 px-2 w-[40px] text-center">
                          <input
                            type="checkbox"
                            checked={newMetric.private}
                            onChange={(e) =>
                              setNewMetric((p) => ({ ...p, private: e.target.checked }))
                            }
                            className="h-4 w-4"
                          />
                        </td>
                        {/* Required */}
                        <td className="py-2 px-2 w-[40px] text-center">
                          <input
                            type="checkbox"
                            checked={newMetric.required}
                            onChange={(e) =>
                              setNewMetric((p) => ({ ...p, required: e.target.checked }))
                            }
                            className="h-4 w-4"
                          />
                        </td>
                        {/* Active */}
                        <td className="py-2 px-2 w-[40px] text-center">
                          <input
                            type="checkbox"
                            checked={newMetric.active}
                            onChange={(e) =>
                              setNewMetric((p) => ({ ...p, active: e.target.checked }))
                            }
                            className="h-4 w-4"
                          />
                        </td>
                        {/* More advanced fields */}
                        {showAdvanced && (
                          <>
                            <td className="py-2 px-2 w-[50px] text-center">
                              <input
                                type="checkbox"
                                checked={newMetric.show_ma}
                                onChange={(e) =>
                                  setNewMetric((p) => ({ ...p, show_ma: e.target.checked }))
                                }
                                className="h-4 w-4"
                              />
                            </td>
                            <td className="py-2 px-2 min-w-[120px]">
                              <Input
                                value={newMetric.ma_periods_csv}
                                onChange={(e) =>
                                  setNewMetric((p) => ({ ...p, ma_periods_csv: e.target.value }))
                                }
                                placeholder="7,30,90"
                                className="h-8 text-xs"
                              />
                            </td>
                            <td className="py-2 px-2 min-w-[140px]">
                              <Input
                                type="date"
                                value={newMetric.start_date}
                                onChange={(e) =>
                                  setNewMetric((p) => ({ ...p, start_date: e.target.value }))
                                }
                                className="h-8 text-xs"
                              />
                            </td>
                            <td className="py-2 px-2 min-w-[150px]">
                              <Input
                                value={newMetric.preset_values_csv}
                                onChange={(e) =>
                                  setNewMetric((p) => ({ ...p, preset_values_csv: e.target.value }))
                                }
                                placeholder="5,6,8"
                                className="h-8 text-xs"
                              />
                            </td>
                          </>
                        )}
                        {/* Actions */}
                        <td className="py-2 px-2 w-[80px]">
                          <div className="flex gap-1">
                            <Button size="sm" className="h-7 px-2 text-xs" onClick={createMetric}>
                              Save
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                setShowNewMetric(false);
                                setNewMetric({
                                  metric_id: "",
                                  metric_name: "",
                                  type: "number",
                                  group: "",
                                  metric_order: "",
                                  is_calculated: false,
                                  calc_expr: "",
                                  default_value: "",
                                  min_value: "",
                                  max_value: "",
                                  disallowed_values: "",
                                  private: false,
                                  required: false,
                                  active: true,
                                  show_ma: false,
                                  ma_periods_csv: "",
                                  start_date: "",
                                  preset_values_csv: "",
                                  stt_enabled: false,
                                });
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Existing metrics */}
                    {sortedMetrics.map((m) => (
                      <SortableMetricRow
                        key={m.metric_id}
                        metric={m}
                        metricIds={metricIds}
                        groupNames={groupNames}
                        showAdvanced={showAdvanced}
                        onFieldChange={updateMetricField}
                        savingFields={savingFields}
                        onDelete={deleteMetric}
                        onNotificationClick={openNotificationConfig}
                        onGoalsClick={setGoalsMetric}
                        onStatsClick={setStatsMetric}
                      />
                    ))}
                  </tbody>
                </table>
              </SortableContext>
            </DndContext>
          </div>
        </CardContent>
      </Card>

      {/* Formula help sheet */}
      <Sheet open={showFormulaHelp} onOpenChange={setShowFormulaHelp}>
        <SheetContent className="overflow-auto" storageKey="metrics_formula_sheet_width" defaultWidth={560}>
          <SheetHeader>
            <SheetTitle>Formula Reference</SheetTitle>
            <SheetDescription>
              Functions and syntax for calculated metrics
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-2 text-sm">
            <p className="text-muted-foreground">
              <strong>Notes:</strong>
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li><code className="text-xs">time</code> and <code className="text-xs">hhmm</code> are stored as minutes.</li>
              <li>Most functions return <code className="text-xs">null</code> if any input is null.</li>
              <li>Use <code className="text-xs">prev(x)</code> / <code className="text-xs">prev(x, n)</code> for lookbacks.</li>
            </ul>
          </div>

          <hr className="my-4" />

          <div className="space-y-4">
            {FORMULA_HELP.map((f) => (
              <details key={f.name} className="group">
                <summary className="cursor-pointer font-medium">
                  <span className="font-semibold">{f.name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{f.sig}</span>
                </summary>
                <div className="mt-2 ml-4 text-sm">
                  <p className="text-muted-foreground">{f.desc}</p>
                  {f.ex?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground mb-1">Examples:</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        {f.ex.map((e) => (
                          <li key={e}>
                            <code className="text-xs bg-muted px-1 rounded">{e}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Notification config sheet */}
      <Sheet
        open={notificationMetric !== null}
        onOpenChange={(open) => !open && setNotificationMetric(null)}
      >
        <SheetContent storageKey="metrics_notification_sheet_width" defaultWidth={480}>
          <SheetHeader>
            <SheetTitle>Notification Settings</SheetTitle>
            <SheetDescription>
              {notificationMetric?.metric_name} ({notificationMetric?.metric_id})
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {/* Enable toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notificationEnabled}
                onChange={(e) => setNotificationEnabled(e.target.checked)}
                className="h-5 w-5 rounded"
              />
              <div>
                <div className="font-medium">Enable streak alerts</div>
                <div className="text-sm text-muted-foreground">
                  Receive email notifications when streak thresholds are crossed
                </div>
              </div>
            </label>

            {notificationEnabled && (
              <>
                {/* Negative thresholds */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Negative streak thresholds
                  </label>
                  <Input
                    value={negativeThresholds}
                    onChange={(e) => setNegativeThresholds(e.target.value)}
                    placeholder="-20, -25, -26, -27, -28, -29, -30"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated negative numbers. You'll get an email when your streak
                    reaches each threshold (e.g., -20 means 20 days without logging).
                  </p>
                </div>

                {/* Positive thresholds */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Positive streak thresholds (milestones)
                  </label>
                  <Input
                    value={positiveThresholds}
                    onChange={(e) => setPositiveThresholds(e.target.value)}
                    placeholder="30, 60, 90, 180, 365"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated positive numbers. Celebrate milestones!
                  </p>
                </div>

                {/* Current tracking info */}
                {notificationMetric?.notification_config?.streak_alerts?.last_notified_threshold && (
                  <div className="p-3 bg-muted rounded-md text-sm">
                    <p className="text-muted-foreground">
                      Last notified at threshold:{" "}
                      <strong>{notificationMetric.notification_config.streak_alerts.last_notified_threshold}</strong>
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Save button */}
            <div className="flex gap-2 pt-4">
              <Button
                onClick={saveNotificationConfig}
                disabled={savingNotification}
              >
                {savingNotification ? "Saving..." : "Save"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setNotificationMetric(null)}
                disabled={savingNotification}
              >
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Metric stats sheet */}
      <MetricStatsSheet
        metricId={statsMetric?.metric_id ?? null}
        metricName={statsMetric?.metric_name ?? null}
        metricType={statsMetric?.type ?? null}
        open={statsMetric !== null}
        onOpenChange={(open) => !open && setStatsMetric(null)}
      />

      {/* Goals config sheet */}
      {/* Dev-only tour reset button */}
      {process.env.NODE_ENV === "development" && (
        <div className="fixed bottom-4 right-4 z-50">
          <Button
            variant="outline"
            size="sm"
            className="text-xs opacity-60 hover:opacity-100 bg-background"
            title={`Tour: ${tourStatus}`}
            onClick={async () => {
              await tourDevReset();
              window.location.reload();
            }}
          >
            Reset Tour ({tourStatus})
          </Button>
        </div>
      )}

      {goalsMetric && (
        <GoalConfigSheet
          open={goalsMetric !== null}
          onOpenChange={(open) => !open && setGoalsMetric(null)}
          metricId={goalsMetric.metric_id}
          metricName={goalsMetric.metric_name}
          metricType={goalsMetric.type}
          goalsConfig={goalsMetric.goals_config}
          onSave={async (goalsConfig) => {
            await saveGoalsConfig(goalsConfig.goals);
          }}
        />
      )}
    </main>
  );
}
