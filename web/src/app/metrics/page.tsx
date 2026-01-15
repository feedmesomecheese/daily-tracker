"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
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

type MetricType = "checkbox" | "number" | "time" | "hhmm" | "text";

type AnalyticsConfig = {
  hide_trend?: boolean;
  hide_streak?: boolean; // deprecated
  show_streak?: boolean; // default: true
  avoid?: boolean; // if true, negative streaks are good (avoiding bad thing)
  lifetime_streak?: boolean; // if true, load all-time data for streak calc
  streak_seed?: number; // pre-log days to add to streak display
  trend_period?: number;
  higher_is_better?: boolean; // true = up is good (green), false = down is good (green)
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
  parent_metric_id: string | null;
  preset_values_csv: string | null;
  analytics_config: AnalyticsConfig | null;
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
function SortableMetricRow({
  metric,
  metrics,
  groupNames,
  showAdvanced,
  onFieldChange,
  savingFields,
  onDelete,
}: {
  metric: Metric;
  metrics: Metric[];
  groupNames: string[];
  showAdvanced: boolean;
  onFieldChange: (metricId: string, field: string, value: unknown) => Promise<void>;
  savingFields: Set<string>;
  onDelete: (metricId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: metric.metric_id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const metricIds = metrics.map((m) => m.metric_id);
  const isSaving = (field: string) => savingFields.has(`${metric.metric_id}:${field}`);

  return (
    <tr ref={setNodeRef} style={style} className="border-b hover:bg-muted/30">
      {/* Drag handle - sticky */}
      <td className="py-2 px-1 w-10 sticky left-0 z-10 bg-background">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab hover:bg-muted rounded p-1"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </td>

      {/* ID */}
      <td className="py-2 px-2 font-mono text-xs text-muted-foreground w-[130px] truncate">
        {metric.metric_id}
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
          className="w-full h-8 text-xs border rounded-md px-2 bg-transparent"
        >
          <option value="checkbox">checkbox</option>
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
          <td className="py-2 px-2 min-w-[180px]">
            <select
              value={metric.parent_metric_id || ""}
              onChange={(e) => onFieldChange(metric.metric_id, "parent_metric_id", e.target.value || null)}
              className="w-full h-8 text-xs border rounded-md px-2 bg-transparent"
            >
              <option value="">(none)</option>
              {metrics
                .filter((m) => m.metric_id !== metric.metric_id)
                .map((m) => (
                  <option key={m.metric_id} value={m.metric_id}>
                    {m.metric_name}
                  </option>
                ))}
            </select>
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
            {["number", "time", "hhmm"].includes(metric.type) && (
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
            {["number", "time", "hhmm"].includes(metric.type) && (
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
          {/* Avoid - for all non-text types */}
          <td className="py-2 px-2 w-[50px] text-center">
            {metric.type !== "text" && (
              <input
                type="checkbox"
                checked={metric.analytics_config?.avoid ?? false}
                onChange={(e) => {
                  const newConfig = {
                    ...(metric.analytics_config || {}),
                    avoid: e.target.checked,
                  };
                  onFieldChange(metric.metric_id, "analytics_config", newConfig);
                }}
                className="h-4 w-4"
                title="Negative streaks are good (avoiding bad behavior)"
              />
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
        </>
      )}

      {/* Actions */}
      <td className="py-2 px-2 w-[80px]">
        <div className="flex gap-1">
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
}

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

// Main page component
export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showPrivate, setShowPrivate] = useState(true);
  const [showFormulaHelp, setShowFormulaHelp] = useState(false);
  const [groupsExpanded, setGroupsExpanded] = useState(false);

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
    parent_metric_id: "",
    preset_values_csv: "",
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

  // Filter visible metrics
  const visibleMetrics = useMemo(() => {
    return metrics.filter((m) => {
      if (!showArchived && !m.active) return false;
      if (!showPrivate && m.private) return false;
      return true;
    });
  }, [metrics, showArchived, showPrivate]);

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
        metric_name: (r.metric_name ?? r.metric_id) as string,
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
        parent_metric_id: (r.parent_metric_id ?? null) as string | null,
        preset_values_csv: (r.preset_values_csv ?? null) as string | null,
        analytics_config: (r.analytics_config ?? null) as AnalyticsConfig | null,
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
        parent_metric_id: newMetric.parent_metric_id || null,
        preset_values_csv: newMetric.preset_values_csv.trim() || null,
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
        parent_metric_id: "",
        preset_values_csv: "",
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

      const confirmed = window.confirm(
        `Delete "${metric.metric_name}" (${metricId})?\n\nThis cannot be undone.`
      );
      if (!confirmed) return;

      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/metrics/${encodeURIComponent(metricId)}`, {
          method: "DELETE",
          headers,
        });

        if (!res.ok) {
          const j = await res.json().catch(() => null);
          setError(j?.error || "Failed to delete metric");
          return;
        }

        // Remove from local state
        setMetrics((prev) => prev.filter((m) => m.metric_id !== metricId));
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
      }
    },
    [metrics]
  );

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
            onClick={() => setShowNewMetric(true)}
            disabled={showNewMetric}
          >
            + Add Metric
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 text-sm">
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
                      <th className="text-right py-1 px-2">Metrics</th>
                      <th className="text-right py-1 px-2">Order</th>
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
      <Card>
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
                <table className="w-full text-sm whitespace-nowrap">
                  <thead className="sticky top-0 z-20 bg-muted">
                    <tr className="text-xs text-muted-foreground">
                      <th className="w-10 sticky left-0 z-20 bg-muted"></th>
                      <th className="text-left py-2 px-2 min-w-[130px]">ID</th>
                      <th className="text-left py-2 px-2 min-w-[140px]">Name</th>
                      <th className="text-left py-2 px-2 min-w-[120px]">Group</th>
                      <th className="text-center py-2 px-2 min-w-[100px]">Order</th>
                      <th className="text-center py-2 px-2 min-w-[120px]">Type</th>
                      <th className="text-center py-2 px-2 w-[40px]" title="Calculated">Calc</th>
                      <th className="text-left py-2 px-2 min-w-[180px]">Formula</th>
                      {showAdvanced && (
                        <>
                          <th className="text-center py-2 px-2 min-w-[90px]">Default</th>
                          <th className="text-center py-2 px-2 min-w-[90px]">Min</th>
                          <th className="text-center py-2 px-2 min-w-[90px]">Max</th>
                          <th className="text-center py-2 px-2 min-w-[110px]">Disallow</th>
                        </>
                      )}
                      <th className="text-center py-2 px-2 w-[40px]" title="Private">Priv</th>
                      <th className="text-center py-2 px-2 w-[40px]" title="Required">Req</th>
                      <th className="text-center py-2 px-2 w-[40px]" title="Active">Act</th>
                      {showAdvanced && (
                        <>
                          <th className="text-center py-2 px-2 w-[50px]" title="Show Moving Average">MA</th>
                          <th className="text-center py-2 px-2 min-w-[120px]">MA Periods</th>
                          <th className="text-center py-2 px-2 min-w-[140px]">Start Date</th>
                          <th className="text-center py-2 px-2 min-w-[180px]">Parent</th>
                          <th className="text-center py-2 px-2 min-w-[150px]">Presets</th>
                          <th className="text-center py-2 px-2 w-[50px]" title="Hide trend indicator on main page">No Trend</th>
                          <th className="text-center py-2 px-2 w-[50px]" title="Lower values are better (green when down)">Low Good</th>
                          <th className="text-center py-2 px-2 w-[50px]" title="Show streak indicator">Streak</th>
                          <th className="text-center py-2 px-2 w-[50px]" title="Negative streaks are good (avoiding bad behavior)">Avoid</th>
                          <th className="text-center py-2 px-2 w-[50px]" title="Track all-time streak (no 365-day limit)">Lifetime</th>
                          <th className="text-center py-2 px-2 w-[60px]" title="Pre-log days to add to streak">Seed</th>
                        </>
                      )}
                      <th className="text-center py-2 px-2 w-[80px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* New metric row */}
                    {showNewMetric && (
                      <tr className="border-b bg-green-50 dark:bg-green-950/30">
                        <td className="py-2 px-1 sticky left-0 z-10 bg-green-50 dark:bg-green-950/30"></td>
                        <td className="py-2 px-2">
                          <Input
                            value={newMetric.metric_id}
                            onChange={(e) =>
                              setNewMetric((p) => ({ ...p, metric_id: e.target.value }))
                            }
                            placeholder="metric_id"
                            className="h-8 text-xs font-mono"
                          />
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
                            className="w-full h-8 text-xs border rounded-md px-2 bg-transparent"
                          >
                            <option value="checkbox">checkbox</option>
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
                            <td className="py-2 px-2 min-w-[180px]">
                              <select
                                value={newMetric.parent_metric_id}
                                onChange={(e) =>
                                  setNewMetric((p) => ({ ...p, parent_metric_id: e.target.value }))
                                }
                                className="w-full h-8 text-xs border rounded-md px-2 bg-transparent"
                              >
                                <option value="">(none)</option>
                                {metrics.map((m) => (
                                  <option key={m.metric_id} value={m.metric_id}>
                                    {m.metric_name}
                                  </option>
                                ))}
                              </select>
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
                                  parent_metric_id: "",
                                  preset_values_csv: "",
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
                        metrics={metrics}
                        groupNames={groupNames}
                        showAdvanced={showAdvanced}
                        onFieldChange={updateMetricField}
                        savingFields={savingFields}
                        onDelete={deleteMetric}
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
        <SheetContent className="overflow-auto">
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
    </main>
  );
}
