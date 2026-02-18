"use client";
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
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
};

const PAGE_SIZE_OPTIONS = [7, 14, 30, 90] as const;

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

  // Date range filter (optional custom range)
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Editing state
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [cellErrors, setCellErrors] = useState<Map<string, string>>(new Map());

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

  // Pagination calculations
  const totalPages = Math.ceil(filteredDates.length / pageSize);
  const paginatedDates = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDates.slice(start, start + pageSize);
  }, [filteredDates, currentPage, pageSize]);

  // Reset to page 1 when filters or page size change
  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, startDate, endDate]);

  // Metric ids in config order (no sorting - preserves group/order from API)
  const metricIds = useMemo(
    () => config.map(c => c.metric_id),
    [config]
  );

  const nameMap = useMemo(() => {
    const m = new Map<string, string>();
    config.forEach(c => {
      m.set(c.metric_id, c.metric_name || c.metric_id);
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
          <Badge variant="secondary">{filteredDates.length} days</Badge>
          <Badge variant="outline">{metricIds.length} metrics</Badge>
          <Badge variant="outline" className="text-blue-600">Click cells to edit</Badge>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              const headers = await getAuthHeaders();
              const params = new URLSearchParams();
              if (showArchived) params.set("archived", "1");
              if (showPrivate) params.set("private", "1");
              const queryStr = params.toString();

              const res = await fetch(`/api/export/daily-log.csv${queryStr ? `?${queryStr}` : ""}`, { headers });
              if (!res.ok) {
                let msg = `Export failed (${res.status})`;
                try {
                  const j = await res.json();
                  msg = j?.error || msg;
                } catch {}
                throw new Error(msg);
              }

              const blob = await res.blob();
              const url = window.URL.createObjectURL(blob);

              const a = document.createElement("a");
              a.href = url;
              a.download = "daily-tracker-log.csv";
              document.body.appendChild(a);
              a.click();
              a.remove();

              window.URL.revokeObjectURL(url);
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : String(e);
              alert(message);
            }
          }}
        >
          Download CSV
        </Button>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-4 flex-wrap">
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

        {/* Date range filter */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">From:</label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-36 h-9"
          />
          <label className="text-sm text-muted-foreground">To:</label>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-36 h-9"
          />
          {(startDate || endDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
            >
              Clear
            </Button>
          )}
        </div>

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

      <Card>
        <CardHeader className="py-3 px-4 border-b">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Showing {paginatedDates.length} of {filteredDates.length} days. Click any cell to edit.
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
                  {metricIds.map(mid => (
                    <th key={mid} className="p-2 text-left font-semibold border-l whitespace-nowrap">
                      {nameMap.get(mid) ?? mid}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedDates.map((d, idx) => (
                  <tr key={d} className={idx % 2 === 0 ? "bg-background" : "bg-muted/50"}>
                    <td className="sticky left-0 z-10 bg-inherit p-2 border-r font-medium shadow-sm">
                      {d}
                    </td>
                    {metricIds.map(mid => {
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
    </main>
  );
}
