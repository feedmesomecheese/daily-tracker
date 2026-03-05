"use client";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTour } from "@/hooks/useTour";
import { getLocalDateString } from "@/lib/dateUtils";
import "driver.js/dist/driver.css";

type LogRow = { date: string; metric_id: string; value: number | null; value_text?: string | null };
type ConfigRow = {
  metric_id: string;
  metric_name?: string | null;
  type: "number" | "integer" | "checkbox" | "time" | "hhmm" | "text" | "score" | "count";
  private?: boolean | null;
  active?: boolean | null;
  min_value?: number | null;
  max_value?: number | null;
  disallowed_values?: string | null;
  group?: string | null;
  group_order?: number | null;
  metric_order?: number | null;
};

type GroupInfo = {
  name: string;       // raw value — "" means ungrouped
  displayName: string;
  order: number;
  metricIds: string[];
};

// --- Column filter types ---
type CheckboxColFilter = { kind: "checkbox"; value: "checked" | "unchecked" };
type NumericColFilter  = { kind: "numeric";  op: "eq" | "gte" | "lte" | "between"; a: string; b: string };
type HhmmColFilter     = { kind: "hhmm";     op: "eq" | "before" | "after"; value: string };
type TimeColFilter     = { kind: "time";     op: "eq" | "gte" | "lte"; value: string };
type TextColFilter     = { kind: "text";     value: string };
type ColumnFilter = CheckboxColFilter | NumericColFilter | HhmmColFilter | TimeColFilter | TextColFilter;
type FilterPopoverAnchor = { metricId: string; rect: DOMRect } | null;

const PAGE_SIZE_OPTIONS = [7, 14, 30, 90] as const;

type DatePreset = "30d" | "60d" | "90d" | "1y" | "all";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "30d", label: "30d" },
  { value: "60d", label: "60d" },
  { value: "90d", label: "90d" },
  { value: "1y", label: "1y" },
  { value: "all", label: "All" },
];

function getPresetDates(preset: DatePreset): { start: string; end: string } {
  if (preset === "all") return { start: "", end: "" };
  const d = new Date();
  if (preset === "30d") d.setDate(d.getDate() - 30);
  else if (preset === "60d") d.setDate(d.getDate() - 60);
  else if (preset === "90d") d.setDate(d.getDate() - 90);
  else if (preset === "1y") d.setFullYear(d.getFullYear() - 1);
  return { start: getLocalDateString(d), end: getLocalDateString() };
}

function csvEscape(val: string): string {
  if (/[,"\n\r]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
  return val;
}

// --- Utility functions for parsing/formatting ---
function parseHHMM(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const colonMatch = /^(\d{1,2}):([0-5]\d)$/.exec(trimmed);
  if (colonMatch) {
    const hours = Number(colonMatch[1]);
    const minutes = Number(colonMatch[2]);
    if (hours < 0 || hours > 23) return null;
    return hours * 60 + minutes;
  }

  const numMatch = /^(\d{3,4})$/.exec(trimmed);
  if (numMatch) {
    const num = trimmed;
    let hours: number;
    let minutes: number;
    if (num.length === 3) {
      hours = Number(num.slice(0, 1));
      minutes = Number(num.slice(1));
    } else {
      hours = Number(num.slice(0, 2));
      minutes = Number(num.slice(2));
    }
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  return null;
}

function formatHHMM(totalMinutes: number | null): string {
  if (totalMinutes == null || !Number.isFinite(totalMinutes)) return "";
  const minutes = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDuration(totalMinutes: number | null): string {
  if (totalMinutes == null || !Number.isFinite(totalMinutes)) return "";
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function parseTimeInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (match) {
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h >= 0 && m >= 0 && m < 60) {
      return h * 60 + m;
    }
  }

  const num = Number(trimmed);
  if (Number.isFinite(num) && num >= 0) {
    return num;
  }

  return null;
}

function validateField(m: ConfigRow, raw: string): string | null {
  if (m.type === "checkbox") return null;
  if (m.type === "text") return null;
  if (raw === "" || raw == null) return null;

  if (m.type === "hhmm") {
    const minutes = parseHHMM(raw);
    if (minutes == null) {
      return `${m.metric_name}: use HH:MM or numeric (705, 1930)`;
    }
    return null;
  }

  if (m.type === "time") {
    const mins = parseTimeInput(raw);
    if (mins == null) {
      return `${m.metric_name}: enter minutes (e.g., 90) or h:mm (e.g., 1:30)`;
    }
    if (m.min_value != null && mins < m.min_value) {
      return `${m.metric_name}: must be ≥ ${m.min_value} minutes`;
    }
    if (m.max_value != null && mins > m.max_value) {
      return `${m.metric_name}: must be ≤ ${m.max_value} minutes`;
    }
    return null;
  }

  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return `${m.metric_name}: not a valid number`;
  }

  if (m.min_value != null && num < m.min_value) {
    return `${m.metric_name}: must be ≥ ${m.min_value}`;
  }
  if (m.max_value != null && num > m.max_value) {
    return `${m.metric_name}: must be ≤ ${m.max_value}`;
  }

  if (m.disallowed_values) {
    const banned = m.disallowed_values
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n));

    if (banned.includes(num)) {
      return `${m.metric_name}: ${num} is not an allowed value`;
    }
  }

  return null;
}

function getNumericValue(m: ConfigRow, raw: string): number | null {
  if (raw == null || raw.trim() === "") return null;

  switch (m.type) {
    case "number":
    case "score":
    case "count":
    case "integer": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case "checkbox": {
      return raw === "1" ? 1 : 0;
    }
    case "time": {
      return parseTimeInput(raw);
    }
    case "hhmm": {
      return parseHHMM(raw);
    }
    default:
      return null;
  }
}

// --- EditableCell component ---
type EditingCell = { date: string; metric_id: string } | null;

function EditableCell({
  date,
  metricConfig,
  value,
  valueText,
  isEditing,
  isSaving,
  error,
  onStartEdit,
  onSave,
  onCancel,
}: {
  date: string;
  metricConfig: ConfigRow;
  value: number | null;
  valueText?: string | null;
  isEditing: boolean;
  isSaving: boolean;
  error: string | null;
  onStartEdit: () => void;
  onSave: (newValue: string, isText?: boolean) => void;
  onCancel: () => void;
}) {
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [showTextModal, setShowTextModal] = useState(false);
  const [textModalValue, setTextModalValue] = useState("");

  // Format displayed value based on type
  const displayValue = useMemo(() => {
    if (metricConfig.type === "text") {
      return valueText ?? "";
    }
    if (value == null) return "";
    if (metricConfig.type === "checkbox") return value >= 0.5 ? "✓" : "";
    if (metricConfig.type === "hhmm") return formatHHMM(value);
    if (metricConfig.type === "time") return formatDuration(value);
    return String(value);
  }, [value, valueText, metricConfig.type]);

  // Initialize edit value when entering edit mode
  useEffect(() => {
    if (isEditing) {
      if (metricConfig.type === "text") {
        setEditValue(valueText ?? "");
      } else if (metricConfig.type === "checkbox") {
        // Don't set edit value for checkbox, handle separately
      } else if (metricConfig.type === "hhmm") {
        setEditValue(value != null ? formatHHMM(value) : "");
      } else if (metricConfig.type === "time") {
        setEditValue(value != null ? String(value) : "");
      } else {
        setEditValue(value != null ? String(value) : "");
      }
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isEditing, value, valueText, metricConfig.type]);

  // Handle checkbox click (toggle immediately)
  const handleCheckboxClick = useCallback(() => {
    if (isSaving) return;
    const newValue = value != null && value >= 0.5 ? "0" : "1";
    onSave(newValue);
  }, [value, isSaving, onSave]);

  // Handle text type (open modal for long content)
  const handleTextClick = useCallback(() => {
    if (isSaving) return;
    setTextModalValue(valueText ?? "");
    setShowTextModal(true);
  }, [valueText, isSaving]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSave(editValue, metricConfig.type === "text");
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Tab") {
        // Allow default tab behavior to move to next cell
        onSave(editValue, metricConfig.type === "text");
      }
    },
    [editValue, onSave, onCancel, metricConfig.type]
  );

  const handleBlur = useCallback(() => {
    // Don't save on blur if we're canceling or already saved
    if (!isEditing) return;
    onSave(editValue, metricConfig.type === "text");
  }, [isEditing, editValue, onSave, metricConfig.type]);

  // Checkbox type: toggle on click
  if (metricConfig.type === "checkbox") {
    return (
      <td
        className={`p-2 border-l text-center cursor-pointer transition-colors ${
          isSaving ? "bg-blue-50" : "hover:bg-muted"
        } ${error ? "bg-red-50" : ""}`}
        onClick={handleCheckboxClick}
        title={error ?? undefined}
      >
        {isSaving ? (
          <span className="text-blue-400">...</span>
        ) : (
          <span className={value != null && value >= 0.5 ? "text-green-600" : "text-gray-300"}>
            {value != null && value >= 0.5 ? "✓" : "○"}
          </span>
        )}
      </td>
    );
  }

  // Text type: open modal
  if (metricConfig.type === "text") {
    return (
      <>
        <td
          className={`p-2 border-l text-left cursor-pointer transition-colors max-w-[150px] truncate ${
            isSaving ? "bg-blue-50" : "hover:bg-muted"
          } ${error ? "bg-red-50" : ""}`}
          onClick={handleTextClick}
          title={valueText ?? undefined}
        >
          {isSaving ? (
            <span className="text-blue-400">...</span>
          ) : valueText ? (
            <span className="text-sm">{valueText}</span>
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </td>
        <Dialog open={showTextModal} onOpenChange={setShowTextModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {metricConfig.metric_name} - {date}
              </DialogTitle>
            </DialogHeader>
            <Textarea
              value={textModalValue}
              onChange={(e) => setTextModalValue(e.target.value)}
              rows={6}
              className="mt-2"
              placeholder="Enter text..."
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowTextModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  onSave(textModalValue, true);
                  setShowTextModal(false);
                }}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Numeric types: inline editing
  if (isEditing) {
    return (
      <td className={`p-0 border-l ${error ? "bg-red-50" : ""}`}>
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className={`w-full h-full px-2 py-1.5 text-xs text-right tabular-nums bg-blue-50 border-2 border-blue-400 focus:outline-none ${
            error ? "border-red-400 bg-red-50" : ""
          }`}
          disabled={isSaving}
        />
      </td>
    );
  }

  return (
    <td
      className={`p-2 border-l text-right tabular-nums cursor-pointer transition-colors ${
        isSaving ? "bg-blue-50" : "hover:bg-muted"
      } ${error ? "bg-red-50" : ""}`}
      onClick={onStartEdit}
      title={error ?? undefined}
    >
      {isSaving ? (
        <span className="text-blue-400">...</span>
      ) : value == null ? (
        <span className="text-gray-300">—</span>
      ) : (
        displayValue
      )}
    </td>
  );
}

// ─── Column Picker ────────────────────────────────────────────────────────────

function GroupCheckbox({
  checked,
  indeterminate,
  onChange,
  onClick,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  onClick: (e: React.MouseEvent) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={onClick}
      className="h-4 w-4 cursor-pointer"
    />
  );
}

function ColumnPickerDialog({
  open,
  onClose,
  groups,
  allMetricIds,
  nameMap,
  selectedMetricIds,
  onSelectionChange,
  collapsedGroups,
  onToggleCollapse,
}: {
  open: boolean;
  onClose: () => void;
  groups: GroupInfo[];
  allMetricIds: string[];
  nameMap: Map<string, string>;
  selectedMetricIds: Set<string> | null;
  onSelectionChange: (ids: Set<string> | null) => void;
  collapsedGroups: Set<string>;
  onToggleCollapse: (name: string) => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(allMetricIds));

  // Reset draft each time dialog opens
  useEffect(() => {
    if (open) setDraft(selectedMetricIds ? new Set(selectedMetricIds) : new Set(allMetricIds));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMetric = (id: string) => {
    setDraft(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleGroup = (group: GroupInfo) => {
    const allOn = group.metricIds.every(id => draft.has(id));
    setDraft(prev => {
      const next = new Set(prev);
      if (allOn) group.metricIds.forEach(id => next.delete(id));
      else group.metricIds.forEach(id => next.add(id));
      return next;
    });
  };

  const handleApply = () => {
    onSelectionChange(draft.size === allMetricIds.length ? null : new Set(draft));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm flex flex-col" style={{ maxHeight: "80vh" }}>
        <DialogHeader>
          <DialogTitle>Select Columns</DialogTitle>
        </DialogHeader>

        {/* Select all / none */}
        <div className="flex items-center justify-between pb-2 border-b shrink-0">
          <span className="text-sm text-muted-foreground">
            {draft.size} of {allMetricIds.length} selected
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setDraft(new Set(allMetricIds))}
              className="text-xs text-primary hover:underline"
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setDraft(new Set())}
              className="text-xs text-primary hover:underline"
            >
              None
            </button>
          </div>
        </div>

        {/* Scrollable group list */}
        <div className="overflow-y-auto flex-1 space-y-1.5 py-1">
          {groups.map(group => {
            const collapsed = collapsedGroups.has(group.name);
            const allOn = group.metricIds.every(id => draft.has(id));
            const someOn = group.metricIds.some(id => draft.has(id));
            const selectedCount = group.metricIds.filter(id => draft.has(id)).length;

            return (
              <div key={group.name} className="border rounded-md overflow-hidden">
                {/* Group header row */}
                <div
                  className="flex items-center gap-2 px-3 py-2 bg-muted/50 cursor-pointer select-none"
                  onClick={() => onToggleCollapse(group.name)}
                >
                  <span className="text-[10px] text-muted-foreground w-3">
                    {collapsed ? "▶" : "▼"}
                  </span>
                  <GroupCheckbox
                    checked={allOn}
                    indeterminate={someOn && !allOn}
                    onChange={() => toggleGroup(group)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="text-sm font-medium flex-1 truncate">{group.displayName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {selectedCount}/{group.metricIds.length}
                  </span>
                </div>

                {/* Individual metrics */}
                {!collapsed && (
                  <div className="divide-y">
                    {group.metricIds.map(id => (
                      <label
                        key={id}
                        className="flex items-center gap-2 px-4 py-1.5 cursor-pointer hover:bg-muted/30"
                      >
                        <input
                          type="checkbox"
                          checked={draft.has(id)}
                          onChange={() => toggleMetric(id)}
                          className="h-4 w-4 cursor-pointer"
                        />
                        <span className="text-sm truncate">{nameMap.get(id) ?? id}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 pt-2 border-t shrink-0">
          <Button onClick={handleApply} className="flex-1">Apply</Button>
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Column filter popover ────────────────────────────────────────────────────

function initColFilter(cfg: ConfigRow, current: ColumnFilter | undefined): ColumnFilter {
  if (current) return { ...current } as ColumnFilter;
  switch (cfg.type) {
    case "checkbox": return { kind: "checkbox", value: "checked" };
    case "hhmm":     return { kind: "hhmm",    op: "before", value: "" };
    case "time":     return { kind: "time",    op: "gte",    value: "" };
    case "text":     return { kind: "text",    value: "" };
    default:         return { kind: "numeric", op: "gte",   a: "",    b: "" };
  }
}

function isColFilterActive(f: ColumnFilter): boolean {
  switch (f.kind) {
    case "checkbox": return true;
    case "numeric":  return f.a !== "" || f.b !== "";
    case "hhmm":     return f.value !== "";
    case "time":     return f.value !== "";
    case "text":     return f.value.trim() !== "";
  }
}

function ColumnFilterPopover({
  metricId,
  cfg,
  anchor,
  current,
  onApply,
  onClose,
}: {
  metricId: string;
  cfg: ConfigRow;
  anchor: DOMRect;
  current: ColumnFilter | undefined;
  onApply: (id: string, filter: ColumnFilter | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<ColumnFilter>(() => initColFilter(cfg, current));

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const style: React.CSSProperties = {
    position: "fixed",
    top: anchor.bottom + 4,
    left: anchor.left,
    zIndex: 9999,
  };

  const btnClass = (active: boolean) =>
    `px-2 py-1 text-xs rounded border transition-colors ${
      active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input hover:bg-accent"
    }`;

  let controls: React.ReactNode;

  if (draft.kind === "checkbox") {
    controls = (
      <div className="flex gap-2">
        <button type="button" className={btnClass(draft.value === "checked")}
          onClick={() => setDraft({ kind: "checkbox", value: "checked" })}>Checked</button>
        <button type="button" className={btnClass(draft.value === "unchecked")}
          onClick={() => setDraft({ kind: "checkbox", value: "unchecked" })}>Unchecked</button>
      </div>
    );
  } else if (draft.kind === "numeric") {
    controls = (
      <div className="space-y-2">
        <div className="flex gap-1 flex-wrap">
          {(["eq", "gte", "lte", "between"] as const).map(op => (
            <button key={op} type="button" className={btnClass(draft.op === op)}
              onClick={() => setDraft(d => ({ ...d as NumericColFilter, op }))}>
              {op === "eq" ? "=" : op === "gte" ? "≥" : op === "lte" ? "≤" : "between"}
            </button>
          ))}
        </div>
        <Input type="number" placeholder={draft.op === "between" ? "Min" : "Value"}
          value={(draft as NumericColFilter).a}
          onChange={e => setDraft(d => ({ ...d as NumericColFilter, a: e.target.value }))}
          className="h-7 text-xs" />
        {draft.op === "between" && (
          <Input type="number" placeholder="Max"
            value={(draft as NumericColFilter).b}
            onChange={e => setDraft(d => ({ ...d as NumericColFilter, b: e.target.value }))}
            className="h-7 text-xs" />
        )}
      </div>
    );
  } else if (draft.kind === "hhmm") {
    controls = (
      <div className="space-y-2">
        <div className="flex gap-1">
          {(["eq", "before", "after"] as const).map(op => (
            <button key={op} type="button" className={btnClass(draft.op === op)}
              onClick={() => setDraft(d => ({ ...d as HhmmColFilter, op }))}>
              {op === "eq" ? "=" : op}
            </button>
          ))}
        </div>
        <Input type="text" placeholder="HH:MM"
          value={(draft as HhmmColFilter).value}
          onChange={e => setDraft(d => ({ ...d as HhmmColFilter, value: e.target.value }))}
          className="h-7 text-xs w-24" />
      </div>
    );
  } else if (draft.kind === "time") {
    controls = (
      <div className="space-y-2">
        <div className="flex gap-1">
          {(["eq", "gte", "lte"] as const).map(op => (
            <button key={op} type="button" className={btnClass(draft.op === op)}
              onClick={() => setDraft(d => ({ ...d as TimeColFilter, op }))}>
              {op === "eq" ? "=" : op === "gte" ? "≥" : "≤"}
            </button>
          ))}
        </div>
        <Input type="text" placeholder="h:mm or minutes"
          value={(draft as TimeColFilter).value}
          onChange={e => setDraft(d => ({ ...d as TimeColFilter, value: e.target.value }))}
          className="h-7 text-xs w-32" />
      </div>
    );
  } else {
    controls = (
      <Input type="text" placeholder="Contains..."
        value={(draft as TextColFilter).value}
        onChange={e => setDraft({ kind: "text", value: e.target.value })}
        className="h-7 text-xs" autoFocus />
    );
  }

  return ReactDOM.createPortal(
    <div ref={ref} style={style} className="bg-popover border rounded-lg shadow-lg p-3 w-52 space-y-3">
      <p className="text-xs font-medium text-muted-foreground truncate">{cfg.metric_name ?? metricId}</p>
      {controls}
      <div className="flex gap-2 pt-1 border-t">
        <Button size="sm" className="h-7 text-xs flex-1"
          onClick={() => onApply(metricId, isColFilterActive(draft) ? draft : null)}>
          Apply
        </Button>
        {current && (
          <Button variant="ghost" size="sm" className="h-7 text-xs"
            onClick={() => onApply(metricId, null)}>
            Clear
          </Button>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DailyLogPage() {
  const [allConfig, setAllConfig] = useState<ConfigRow[]>([]);
  const [logRows, setLogRows] = useState<LogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Visibility toggles
  const [showArchived, setShowArchived] = useState(false);
  const [showPrivate, setShowPrivate] = useState(false);

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(30);
  const [currentPage, setCurrentPage] = useState(1);

  // Date range filter
  const [datePreset, setDatePreset] = useState<DatePreset | null>("all");
  const [showCustomDates, setShowCustomDates] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exporting, setExporting] = useState(false);

  // Text search
  const [textSearch, setTextSearch] = useState("");

  // Column filters
  const [columnFilters, setColumnFilters] = useState<Map<string, ColumnFilter>>(new Map());
  const [filterPopover, setFilterPopover] = useState<FilterPopoverAnchor>(null);

  // Column picker state
  const [selectedMetricIds, setSelectedMetricIds] = useState<Set<string> | null>(null); // null = all
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const groupsInitialized = useRef(false);

  const handleDatePreset = (preset: DatePreset) => {
    const { start, end } = getPresetDates(preset);
    setDatePreset(preset);
    setStartDate(start);
    setEndDate(end);
  };

  // Editing state
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [cellErrors, setCellErrors] = useState<Map<string, string>>(new Map());

  // Tour
  const { status: tourStatus, cleanup: tourCleanup, devReset: tourDevReset } = useTour();
  const tourLaunched = useRef(false);

  // Filtered config based on visibility toggles
  const config = useMemo(() => {
    return allConfig.filter((c) => {
      if (!showArchived && !(c.active ?? true)) return false;
      if (!showPrivate && c.private) return false;
      return true;
    });
  }, [allConfig, showArchived, showPrivate]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const headers = await getAuthHeaders();

        const [cfgRes, logRes] = await Promise.all([
          fetch("/api/config", { headers }),
          fetch("/api/log", { headers }),
        ]);

        const [cfgData, logData] = await Promise.all([cfgRes.json(), logRes.json()]);

        if (!cfgRes.ok) throw new Error(cfgData?.error || "Failed to load config");
        if (!logRes.ok) throw new Error(logData?.error || "Failed to load log");

        setAllConfig(cfgData);
        setLogRows(logData);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Derive distinct dates (most recent first)
  const allDates = useMemo(
    () => Array.from(new Set(logRows.map(r => r.date))).sort().reverse(),
    [logRows]
  );

  // Filter dates by custom range if set
  const filteredDates = useMemo(() => {
    if (!startDate && !endDate) return allDates;
    return allDates.filter(d => {
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }, [allDates, startDate, endDate]);

  // Pagination reset — kept here; pagination calculations moved below cellMap
  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, startDate, endDate, textSearch, columnFilters]);

  // Metric ids in config order (no sorting - preserves group/order from API)
  const metricIds = useMemo(
    () => config.map(c => c.metric_id),
    [config]
  );

  // Groups derived from config (preserves API sort order)
  const groups = useMemo<GroupInfo[]>(() => {
    const map = new Map<string, GroupInfo>();
    config.forEach(c => {
      const name = c.group ?? "";
      const displayName = name || "Ungrouped";
      const order = c.group_order ?? 9999;
      if (!map.has(name)) map.set(name, { name, displayName, order, metricIds: [] });
      map.get(name)!.metricIds.push(c.metric_id);
    });
    return Array.from(map.values()).sort((a, b) =>
      a.order !== b.order ? a.order - b.order : a.displayName.localeCompare(b.displayName)
    );
  }, [config]);

  // Collapse all groups on first load (compact by default)
  useEffect(() => {
    if (groups.length > 0 && !groupsInitialized.current) {
      groupsInitialized.current = true;
      setCollapsedGroups(new Set(groups.map(g => g.name)));
    }
  }, [groups]);

  // Metrics actually shown in the table (filtered by column picker)
  const visibleMetricIds = useMemo(() => {
    if (selectedMetricIds === null) return metricIds;
    return metricIds.filter(id => selectedMetricIds.has(id));
  }, [metricIds, selectedMetricIds]);

  const toggleGroupCollapse = (name: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    config.forEach(c => {
      const raw = c.metric_name || c.metric_id;
      m.set(c.metric_id, raw.replace(/\s*\[[0-9a-f]{8}\]$/, ""));
    });
    return m;
  }, [config]);

  const configMap = useMemo(() => {
    const m = new Map<string, ConfigRow>();
    config.forEach(c => {
      m.set(c.metric_id, c);
    });
    return m;
  }, [config]);

  // Build a lookup: key = date|metric_id → {value, value_text}
  const cellMap = useMemo(() => {
    const m = new Map<string, { value: number | null; value_text?: string | null }>();
    for (const r of logRows) {
      m.set(`${r.date}|${r.metric_id}`, { value: r.value, value_text: r.value_text });
    }
    return m;
  }, [logRows]);

  // Text search: filter dates to those with matching text-type entries
  const searchFilteredDates = useMemo(() => {
    const q = textSearch.trim().toLowerCase();
    if (!q) return filteredDates;
    const textMetricIds = config.filter(c => c.type === "text").map(c => c.metric_id);
    return filteredDates.filter(date =>
      textMetricIds.some(mid => {
        const cell = cellMap.get(`${date}|${mid}`);
        return cell?.value_text?.toLowerCase().includes(q);
      })
    );
  }, [filteredDates, textSearch, config, cellMap]);

  // Column-filter dates: apply per-column filters on top of text search
  const columnFilteredDates = useMemo(() => {
    if (columnFilters.size === 0) return searchFilteredDates;
    return searchFilteredDates.filter(date => {
      for (const [metricId, filter] of columnFilters) {
        const cell = cellMap.get(`${date}|${metricId}`);
        switch (filter.kind) {
          case "checkbox": {
            const checked = cell?.value != null && cell.value >= 0.5;
            if (filter.value === "checked"   && !checked) return false;
            if (filter.value === "unchecked" &&  checked) return false;
            break;
          }
          case "numeric": {
            if (cell?.value == null) return false;
            const v = cell.value;
            const a = Number(filter.a);
            const b = Number(filter.b);
            if (filter.op === "eq"      && !(v === a))           return false;
            if (filter.op === "gte"     && !(v >= a))            return false;
            if (filter.op === "lte"     && !(v <= a))            return false;
            if (filter.op === "between" && !(v >= a && v <= b))  return false;
            break;
          }
          case "hhmm": {
            if (cell?.value == null) return false;
            const t = parseHHMM(filter.value);
            if (t == null) break;
            if (filter.op === "eq"     && !(cell.value === t)) return false;
            if (filter.op === "before" && !(cell.value <   t)) return false;
            if (filter.op === "after"  && !(cell.value >   t)) return false;
            break;
          }
          case "time": {
            if (cell?.value == null) return false;
            const t = parseTimeInput(filter.value);
            if (t == null) break;
            if (filter.op === "eq"  && !(cell.value === t)) return false;
            if (filter.op === "gte" && !(cell.value >= t))  return false;
            if (filter.op === "lte" && !(cell.value <= t))  return false;
            break;
          }
          case "text": {
            const q = filter.value.trim().toLowerCase();
            if (!q) break;
            if (!cell?.value_text?.toLowerCase().includes(q)) return false;
            break;
          }
        }
      }
      return true;
    });
  }, [searchFilteredDates, columnFilters, cellMap]);

  // Pagination calculations
  const totalPages = Math.ceil(columnFilteredDates.length / pageSize);
  const paginatedDates = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return columnFilteredDates.slice(start, start + pageSize);
  }, [columnFilteredDates, currentPage, pageSize]);

  // Handle saving a cell
  const handleSaveCell = useCallback(
    async (date: string, metric_id: string, rawValue: string, isText: boolean = false) => {
      const key = `${date}|${metric_id}`;
      const metricConfig = configMap.get(metric_id);
      if (!metricConfig) return;

      // Validate
      if (!isText) {
        const validationError = validateField(metricConfig, rawValue);
        if (validationError) {
          setCellErrors(prev => new Map(prev).set(key, validationError));
          setEditingCell(null);
          return;
        }
      }

      // Clear any previous error
      setCellErrors(prev => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });

      setEditingCell(null);
      setSavingCells(prev => new Set(prev).add(key));

      try {
        const headers = await getAuthHeaders();

        let entry: { metric_id: string; value: number | null; value_text?: string | null };

        if (isText) {
          entry = {
            metric_id,
            value: null,
            value_text: rawValue.trim() === "" ? null : rawValue,
          };
        } else {
          const numericValue = getNumericValue(metricConfig, rawValue);
          entry = {
            metric_id,
            value: numericValue,
          };
        }

        const res = await fetch("/api/save-log", {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            date,
            entries: [entry],
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data?.error || "Failed to save");
        }

        // Update local state
        setLogRows(prev => {
          const existing = prev.find(r => r.date === date && r.metric_id === metric_id);
          if (existing) {
            return prev.map(r =>
              r.date === date && r.metric_id === metric_id
                ? { ...r, value: entry.value, value_text: entry.value_text }
                : r
            );
          } else if (entry.value !== null || entry.value_text) {
            return [...prev, { date, metric_id, value: entry.value, value_text: entry.value_text }];
          }
          return prev;
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setCellErrors(prev => new Map(prev).set(key, message));
      } finally {
        setSavingCells(prev => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [configMap]
  );

  // --- Log Tour ---
  const launchLogTour = useCallback(() => {
    import("driver.js").then(({ driver }) => {
      const driverObj = driver({
        animate: true,
        showProgress: true,
        allowClose: false,
        steps: [
          {
            popover: {
              title: "Your Complete History",
              description:
                "The Log is a full spreadsheet of every day you've logged. All your metrics, side by side — great for spotting patterns or making quick corrections.",
              nextBtnText: "Next →",
            },
          },
          {
            element: "[data-tour='log-table']",
            popover: {
              title: "Inline Editing",
              description:
                "Click any cell to edit it in place. Tab moves to the next cell, Enter saves, Escape cancels. Changes sync instantly — no save button needed.",
              side: "top",
              align: "start",
              nextBtnText: "Next →",
            },
          },
          {
            element: "[data-tour='log-filters']",
            popover: {
              title: "Filters & Pagination",
              description:
                "Change the date range, show archived or private metrics, adjust how many days appear per page, or jump to a specific page.",
              side: "bottom",
              align: "start",
              nextBtnText: "Next →",
            },
          },
          {
            element: "[data-tour='log-export-btn']",
            popover: {
              title: "Export & Finish",
              description:
                "Download your data as a CSV for use in Excel, Google Sheets, or any other tool. When you're ready, remove the demo data and start with your own metrics.",
              nextBtnText: "Finish & Remove Demo →",
              onNextClick: () => {
                driverObj.destroy();
                tourCleanup("/");
              },
            },
          },
        ],
      });
      driverObj.drive();
    });
  }, [tourCleanup]);

  // Auto-launch log tour when demo data exists and log has loaded
  useEffect(() => {
    if (tourStatus !== "seeded") return;
    if (loading || logRows.length === 0) return;
    if (tourLaunched.current) return;
    tourLaunched.current = true;
    setTimeout(launchLogTour, 400);
  }, [tourStatus, loading, logRows, launchLogTour]);

  if (loading) {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Daily Log</h1>
        <div className="text-sm text-gray-600">Loading...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Daily Log</h1>
        <div className="text-sm text-red-600">Error: {error}</div>
      </main>
    );
  }

  if (allDates.length === 0 || metricIds.length === 0) {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Daily Log</h1>
        <div className="text-sm text-gray-600">No data yet.</div>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-full mx-auto space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Daily Log</h1>
          <Badge variant="secondary">{columnFilteredDates.length} days</Badge>
          <Badge
            variant={selectedMetricIds !== null ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setColumnPickerOpen(true)}
          >
            {selectedMetricIds !== null
              ? `${visibleMetricIds.length} / ${metricIds.length} metrics`
              : `${metricIds.length} metrics`}
          </Badge>
          <Badge variant="outline" className="text-blue-600">Click cells to edit</Badge>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {columnFilteredDates.length} {columnFilteredDates.length === 1 ? "day" : "days"}
            {startDate || endDate ? " in range" : " total"}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setColumnPickerOpen(true)}
          >
            Columns{selectedMetricIds !== null ? ` (${visibleMetricIds.length}/${metricIds.length})` : ""}
          </Button>
          <Button
            data-tour="log-export-btn"
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={() => {
              setExporting(true);
              try {
                const cols = visibleMetricIds;
                const header = ["date", ...cols.map(id => nameMap.get(id) ?? id)].map(csvEscape).join(",");
                const lines = filteredDates.map(date => {
                  const cells = [date];
                  for (const mid of cols) {
                    const cell = cellMap.get(`${date}|${mid}`);
                    const cfg = configMap.get(mid);
                    if (!cell) { cells.push(""); }
                    else if (cfg?.type === "text") { cells.push(csvEscape(cell.value_text ?? "")); }
                    else { cells.push(cell.value == null ? "" : String(cell.value)); }
                  }
                  return cells.map(csvEscape).join(",");
                });
                const csv = [header, ...lines].join("\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `daily-tracker${startDate ? `_${startDate}` : ""}${endDate ? `_to_${endDate}` : ""}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              } catch (e: unknown) {
                alert(e instanceof Error ? e.message : String(e));
              } finally {
                setExporting(false);
              }
            }}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Controls row */}
      <div data-tour="log-filters" className="flex items-center gap-4 flex-wrap">
        {/* Visibility toggles */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4"
            />
            Archived
          </label>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showPrivate}
              onChange={(e) => setShowPrivate(e.target.checked)}
              className="h-4 w-4"
            />
            Private
          </label>
        </div>

        <div className="h-5 w-px bg-border" />

        {/* Text search */}
        <div className="relative">
          <Input
            type="text"
            value={textSearch}
            onChange={(e) => setTextSearch(e.target.value)}
            placeholder="Search notes..."
            className="h-9 w-44 pl-3 pr-7 text-sm"
          />
          {textSearch && (
            <button
              onClick={() => setTextSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {columnFilters.size > 0 && (
          <button
            type="button"
            onClick={() => setColumnFilters(new Map())}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md px-2 h-9 bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            <span>{columnFilters.size} col filter{columnFilters.size > 1 ? "s" : ""}</span>
            <span className="text-blue-400">✕</span>
          </button>
        )}

        <div className="h-5 w-px bg-border" />

        {/* Page size selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="pageSize" className="text-sm text-muted-foreground">
            Days per page:
          </label>
          <select
            id="pageSize"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {PAGE_SIZE_OPTIONS.map(size => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>

        {/* Date range preset buttons */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Range:</label>
          <div className="flex">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => handleDatePreset(p.value)}
                className={`px-2.5 py-1.5 text-xs font-medium border transition-colors first:rounded-l-md last:rounded-r-md ${
                  datePreset === p.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-input hover:bg-accent"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCustomDates((v) => !v)}
            className={`h-8 px-2 border rounded-md text-xs transition-colors ${
              showCustomDates
                ? "bg-accent border-primary/50"
                : "bg-background border-input hover:bg-accent"
            }`}
          >
            Custom
          </button>
        </div>

        {/* Custom date inputs (collapsible) */}
        {showCustomDates && (
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">From:</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setDatePreset(null); }}
              className="w-36 h-9"
            />
            <label className="text-sm text-muted-foreground">To:</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setDatePreset(null); }}
              className="w-36 h-9"
            />
            {(startDate || endDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setStartDate(""); setEndDate(""); setDatePreset("all"); }}
              >
                Clear
              </Button>
            )}
          </div>
        )}

        {/* Pagination controls */}
        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            Prev
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums flex items-center gap-1">
            Page
            <Input
              type="number"
              min={1}
              max={totalPages || 1}
              value={currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (val >= 1 && val <= totalPages) {
                  setCurrentPage(val);
                }
              }}
              onBlur={(e) => {
                // Clamp value on blur if out of range
                const val = parseInt(e.target.value, 10);
                if (isNaN(val) || val < 1) {
                  setCurrentPage(1);
                } else if (val > totalPages) {
                  setCurrentPage(totalPages || 1);
                }
              }}
              className="w-16 h-8 text-center tabular-nums"
            />
            of {totalPages || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Error summary */}
      {cellErrors.size > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-sm text-red-700 font-medium">Validation errors:</p>
          <ul className="text-xs text-red-600 mt-1 list-disc list-inside">
            {Array.from(cellErrors.entries()).map(([key, err]) => (
              <li key={key}>{err}</li>
            ))}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-red-600"
            onClick={() => setCellErrors(new Map())}
          >
            Clear errors
          </Button>
        </div>
      )}

      <Card data-tour="log-table">
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Showing {paginatedDates.length} of {columnFilteredDates.length} days
            {columnFilters.size > 0 ? ` (${columnFilters.size} column filter${columnFilters.size > 1 ? "s" : ""} active)` : ""}
            . Click any cell to edit.
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[70vh]">
            <table className="text-xs border-collapse min-w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-muted border-b">
                  <th className="sticky left-0 z-20 bg-muted p-2 text-left font-semibold border-r shadow-sm">
                    Date
                  </th>
                  {visibleMetricIds.map(mid => {
                    const hasFilter = columnFilters.has(mid);
                    return (
                      <th key={mid} className={`p-0 border-l whitespace-nowrap ${hasFilter ? "bg-blue-50" : ""}`}>
                        <button
                          type="button"
                          onClick={(e) => {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setFilterPopover(prev => prev?.metricId === mid ? null : { metricId: mid, rect });
                          }}
                          className={`w-full h-full px-2 py-1.5 text-left font-semibold flex items-center gap-1 hover:bg-muted/70 transition-colors ${hasFilter ? "text-blue-700" : ""}`}
                        >
                          <span className="truncate">{nameMap.get(mid) ?? mid}</span>
                          <span className={`text-[10px] ml-auto shrink-0 ${hasFilter ? "text-blue-500" : "text-muted-foreground/40"}`}>▼</span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {paginatedDates.map((d, idx) => (
                  <tr key={d} className={idx % 2 === 0 ? "bg-background" : "bg-muted/50"}>
                    <td className="sticky left-0 z-10 bg-inherit p-2 border-r font-medium shadow-sm">
                      {d}
                    </td>
                    {visibleMetricIds.map(mid => {
                      const key = `${d}|${mid}`;
                      const cellData = cellMap.get(key);
                      const metricConfig = configMap.get(mid);
                      if (!metricConfig) {
                        return (
                          <td key={mid} className="p-2 border-l text-right tabular-nums">
                            <span className="text-gray-300">—</span>
                          </td>
                        );
                      }

                      return (
                        <EditableCell
                          key={mid}
                          date={d}
                          metricConfig={metricConfig}
                          value={cellData?.value ?? null}
                          valueText={cellData?.value_text}
                          isEditing={editingCell?.date === d && editingCell?.metric_id === mid}
                          isSaving={savingCells.has(key)}
                          error={cellErrors.get(key) ?? null}
                          onStartEdit={() => setEditingCell({ date: d, metric_id: mid })}
                          onSave={(val, isText) => handleSaveCell(d, mid, val, isText)}
                          onCancel={() => setEditingCell(null)}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ColumnPickerDialog
        open={columnPickerOpen}
        onClose={() => setColumnPickerOpen(false)}
        groups={groups}
        allMetricIds={metricIds}
        nameMap={nameMap}
        selectedMetricIds={selectedMetricIds}
        onSelectionChange={setSelectedMetricIds}
        collapsedGroups={collapsedGroups}
        onToggleCollapse={toggleGroupCollapse}
      />

      {filterPopover && configMap.get(filterPopover.metricId) && (
        <ColumnFilterPopover
          metricId={filterPopover.metricId}
          cfg={configMap.get(filterPopover.metricId)!}
          anchor={filterPopover.rect}
          current={columnFilters.get(filterPopover.metricId)}
          onApply={(id, filter) => {
            setColumnFilters(prev => {
              const next = new Map(prev);
              if (filter == null) next.delete(id); else next.set(id, filter);
              return next;
            });
            setFilterPopover(null);
          }}
          onClose={() => setFilterPopover(null)}
        />
      )}

      {process.env.NODE_ENV === "development" && (
        <div className="fixed bottom-4 right-4 z-50">
          <Button
            onClick={async () => {
              await tourDevReset();
              window.location.reload();
            }}
          >
            Reset Tour ({tourStatus})
          </Button>
        </div>
      )}
    </main>
  );
}
