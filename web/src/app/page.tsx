"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import React from "react";
import { evaluateCalculatedMetricsV2 } from "@/lib/calc";
import { getLocalDateString } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ConfigRow = {
  metric_id: string;
  metric_name: string;
  type: "checkbox" | "number" | "time" | "hhmm" | "text";
  group?: string | null;
  default_value: number | null;
  min_value: number | null;
  max_value: number | null;
  disallowed_values: string | null;
  required: boolean;
  private: boolean;
  active: boolean;
  show_ma: boolean;
  ma_periods_csv: string | null;
  start_date: string | null;
  metric_order?: number | null;
  group_order?: number | null;
  preset_values_csv?: string | null;
  is_calculated: boolean;
  calc_expr: string | null;
  parent_metric_id: string | null;
};

// Inline styles removed - using Tailwind classes instead

type DateHints = {
  today: string;
  last_log_date: string | null;
  last_required_complete_date: string | null;
  suggested_date: string;
  missing_required_days: number;
  required_days_completed: number;
  required_days_possible: number;
};

// function daysBetween(a: string, b: string): number {
//   // a and b are "YYYY-MM-DD"
//   const da = new Date(a + "T00:00:00");
//   const db = new Date(b + "T00:00:00");
//   const ms = db.getTime() - da.getTime();
//   return Math.round(ms / 86400000); // 1000 * 60 * 60 * 24
// }


function sortMetricsForForm(list: ConfigRow[]): ConfigRow[] {
  // Build a group -> group_order map (using the smallest value per group)
  const groupOrderMap = new Map<string, number>();

  for (const m of list) {
    const key = m.group || ""; // Ungrouped becomes ""
    const existing = groupOrderMap.get(key);
    const candidate = m.group_order ?? 0;

    if (existing === undefined || candidate < existing) {
      groupOrderMap.set(key, candidate);
    }
  }

  return [...list].sort((a, b) => {
    const ga = a.group || "";
    const gb = b.group || "";

    const goa = groupOrderMap.get(ga) ?? 0;
    const gob = groupOrderMap.get(gb) ?? 0;

    // 1) group_order at the group level
    if (goa !== gob) return goa - gob;

    // 2) group name as a tie-breaker
    if (ga !== gb) return ga.localeCompare(gb);

    // 3) metric_order within the group
    const oa = a.metric_order ?? 0;
    const ob = b.metric_order ?? 0;
    if (oa !== ob) return oa - ob;

    // 4) stable fallback by ID
    return a.metric_id.localeCompare(b.metric_id);
  });
}

export default function Home() {
  const [authChecked, setAuthChecked] = useState(false);
  const todayISO = getLocalDateString();
  const [date, setDate] = useState<string>(() => getLocalDateString());
  const [initialDateLoaded, setInitialDateLoaded] = useState(false);
  const [metrics, setMetrics] = useState<ConfigRow[]>([]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<any[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});

  // Track which metrics have default values auto-populated (not from saved data)
  const [defaultPopulated, setDefaultPopulated] = useState<Set<string>>(new Set());
  // Track which metrics have been "touched" (focused or edited)
  const [touchedMetrics, setTouchedMetrics] = useState<Set<string>>(new Set());

  const [dateHints, setDateHints] = useState<DateHints | null>(null);
  const [dateInitializedFromHints, setDateInitializedFromHints] = useState(false);

  const hasRequired = metrics.some((m) => m.required);

  const [showCalcDebug, setShowCalcDebug] = useState(false);
  const [hasShownHeadsUp, setHasShownHeadsUp] = useState(false);

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  function toggleGroup(name: string) {
    setCollapsedGroups((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  }

  console.log("metrics for form", metrics);

  // Check if a metric is visible based on parent's value
  const isMetricVisible = React.useCallback((metric: ConfigRow): boolean => {
    if (!metric.parent_metric_id) return true;
    const parentValue = vals[metric.parent_metric_id];
    // Parent must have a non-empty value for child to be visible
    return parentValue != null && parentValue.trim() !== "";
  }, [vals]);

  const groupedMetrics = React.useMemo<
    { groupName: string; items: ConfigRow[] }[]
  >(() => {
    if (!metrics || metrics.length === 0) return [];

    const map = new Map<string, ConfigRow[]>();

    for (const m of metrics) {
      // Skip metrics whose parent is empty
      if (!isMetricVisible(m)) continue;

      const groupName = m.group || "Other";
      if (!map.has(groupName)) map.set(groupName, []);
      map.get(groupName)!.push(m);
    }

    return Array.from(map.entries()).map(([groupName, items]) => ({
      groupName,
      items,
    }));
  }, [metrics, isMetricVisible, vals]);

  const daysBetween = (d1: string, d2: string) => {
    const t1 = Date.parse(d1);
    const t2 = Date.parse(d2);
    if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 0;
    // difference in whole days
    return Math.floor((t2 - t1) / 86400000);
  };

  const gapMessage = (() => {
    if (metrics.length === 0) return null;
    if (!dateHints) return null;

    const anchor =
      dateHints.last_log_date || dateHints.last_required_complete_date;
    if (!anchor) return null;

    if (date <= anchor) return null;

    const diffDays = daysBetween(anchor, date);
    const missingWholeDays = diffDays - 1;

    if (missingWholeDays <= 0) return null;

    return `There ${missingWholeDays === 1 ? "is" : "are"} ${missingWholeDays} missing day${
      missingWholeDays === 1 ? "" : "s"
    } between your last recorded day (${anchor}) and this date.`;
  })();




  console.log("DateHints for gap check:", dateHints, "current date:", date);

  
  // Ref to hold current save function for keyboard shortcut
  const saveRef = useRef<() => void>(() => {});

  // auth check effect
  useEffect(() => {
    (async () => {
      const { data, error } = await supabaseBrowser.auth.getSession();
      console.log("session in Home:", data.session, error);
      if (!data.session) {
        // not logged in → go to login
        window.location.href = "/login";
        return;
      }
      // logged in
      setAuthChecked(true);
    })();
  }, []);

  // Ctrl+Enter keyboard shortcut to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!saving && metrics.length > 0) {
          saveRef.current();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [saving, metrics.length]);

  // Load metrics from /api/config
  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();

        const res = await fetch("/api/config", { headers });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load config");

        const rows = data as any[];

        const normalized: ConfigRow[] = rows.map((r) => ({
          metric_id: r.metric_id,
          metric_name: r.metric_name ?? r.metric_id,
          type: r.type,
          group: r.group ?? null,
          private: !!r.private,
          active: r.active ?? true,
          show_ma: !!r.show_ma,
          ma_periods_csv: r.ma_periods_csv ?? "",
          start_date: r.start_date ?? null,
          required: !!r.required,              // 👈 now wired up
          default_value: r.default_value ?? null,
          min_value: r.min_value ?? null,
          max_value: r.max_value ?? null,
          disallowed_values: r.disallowed_values ?? null,
          metric_order:
            typeof r.metric_order === "number" ? r.metric_order : null,
          group_order:
            typeof r.group_order === "number" ? r.group_order : null,
          preset_values_csv: r.preset_values_csv ?? null,
          is_calculated: !!r.is_calculated,
          calc_expr: r.calc_expr ?? null,
          parent_metric_id: r.parent_metric_id ?? null,
        }));

        const visible = normalized.filter(
          (r) => !r.private && r.active
        );

        setMetrics(sortMetricsForForm(visible));
      } catch (e: any) {
        setError(String(e?.message || e));
      }
    })();
  }, []);

  // type GroupedMetrics = {
  //   groupName: string;
  //   metrics: ConfigRow[];
  // };

  useEffect(() => {
    if (!authChecked) return;
    reloadDateHints();
  }, [authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    if (!dateHints) return;
    if (dateInitializedFromHints) return;

    const nextDate = dateHints.suggested_date || dateHints.today;
    if (nextDate) setDate(nextDate);

    // Decide Heads Up exactly once, at initial auto-jump
    // if (!hasShownHeadsUp && dateHints.missing_required_days > 0) {
    //   setShowHeadsUp(true);
    //   setHasShownHeadsUp(true);
    // } else {
    //   setShowHeadsUp(false);
    //   setHasShownHeadsUp(true); // lock it off so it never reappears this page load
    // }

    setDateInitializedFromHints(true);
  }, [authChecked, dateHints, dateInitializedFromHints, hasShownHeadsUp]);

  // Initial load of the date's data
  useEffect(() => {
    if (!authChecked) return;
    if (!date) return;
    if (metrics.length === 0) return;

    loadDayValues(date);
  }, [authChecked, date, metrics]);

  
  const setVal = (id: string, v: string) => {
    setVals(s => ({ ...s, [id]: v }));
    setDirty(true);
  };

  // Mark a metric as "touched" (user interacted with it)
  const markAsTouched = (id: string) => {
    setTouchedMetrics(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  // Clear child values when parent becomes empty
  React.useEffect(() => {
    const childrenToClear: string[] = [];

    for (const m of metrics) {
      if (!m.parent_metric_id) continue;

      const parentValue = vals[m.parent_metric_id];
      const parentIsEmpty = parentValue == null || parentValue.trim() === "";
      const childHasValue = vals[m.metric_id] && vals[m.metric_id].trim() !== "";

      if (parentIsEmpty && childHasValue) {
        childrenToClear.push(m.metric_id);
      }
    }

    if (childrenToClear.length > 0) {
      setVals(prev => {
        const next = { ...prev };
        for (const id of childrenToClear) {
          next[id] = "";
        }
        return next;
      });
    }
  }, [vals, metrics]);

  const [prevByN, setPrevByN] = useState<Record<number, Record<string, number | null>>>({});

  const metricsById = React.useMemo<Record<string, ConfigRow>>(() => {
    const m: Record<string, ConfigRow> = {};
    for (const metric of metrics) {
      m[metric.metric_id] = metric;
    }
    return m;
  }, [metrics]);

  type SaveEntry = {
    metric_id: string;
    value: number | null;
    value_text?: string | null;
  };

  function getMaxPrevDays(metrics: ConfigRow[]): number {
    let maxN = 1;
    const re = /prev\(\s*[a-zA-Z0-9_]+\s*(?:,\s*(\d+)\s*)?\)/g;

    for (const m of metrics) {
      if (!m.is_calculated || !m.calc_expr) continue;
      let match: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((match = re.exec(m.calc_expr)) !== null) {
        const n = match[1] ? Number(match[1]) : 1;
        if (Number.isFinite(n) && n > maxN) maxN = n;
      }
    }

    return Math.max(1, Math.min(365, Math.floor(maxN))); // clamp to keep sane
  }


  function buildEntries(): SaveEntry[] {
    const entries: SaveEntry[] = [];

    for (const m of metrics) {
      // Skip untouched default-populated fields (don't save them)
      if (defaultPopulated.has(m.metric_id) && !touchedMetrics.has(m.metric_id)) {
        continue;
      }

      // Calculated metrics → use calculatedValues
      if (m.is_calculated) {
        const v = calculatedValues[m.metric_id];
        const num = v != null && Number.isFinite(v) ? (v as number) : null;

        // If it's a checkbox metric, enforce row/no-row semantics
        const coerced =
          m.type === "checkbox"
            ? (num != null && num >= 0.5 ? 1 : null)
            : num;

        entries.push({ metric_id: m.metric_id, value: coerced });
        continue;
      }

      // console.log("calc sample", {
      //   date,
      //   total_sleep: calculatedValues["total_sleep"],
      //   fasting_window: calculatedValues["fasting_window"],
      // });

      // Non-calculated metrics → use user input
      const raw = vals[m.metric_id];
      const trimmed = raw?.trim() ?? "";

      let value: number | null = null;

      if (m.type === "text") {
        // raw multi-line allowed; blank => delete row
        const t = raw ?? "";
        entries.push({
          metric_id: m.metric_id,
          value: null,
          value_text: t.trim() === "" ? null : t, // keep raw text, only trim to decide empty vs not
        });
        continue;
      }

      if (m.type === "checkbox") {
        // checkbox: checked => 1, unchecked => null (delete row)
        value = trimmed ? 1 : null;
      } else if (m.type === "hhmm") {
        if (trimmed !== "") {
          const mins = parseHHMM(trimmed);
          value = mins != null ? mins : null;
        } else {
          value = null; // delete row
        }
      } else {
        // number / time
        if (trimmed !== "") {
          const num = Number(trimmed);
          value = Number.isFinite(num) ? num : null;
        } else {
          value = null;
        }
      }

      entries.push({
        metric_id: m.metric_id,
        value,
      });
    }

    return entries;
  }



  function parseHHMM(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const m = /^(\d{1,2}):([0-5]\d)$/.exec(trimmed);
    if (!m) return null;

    const hours = Number(m[1]);
    const minutes = Number(m[2]);
    if (hours < 0 || hours > 23) return null;

    return hours * 60 + minutes;
  }

  function formatHHMM(totalMinutes: number | null): string {
    if (totalMinutes == null || !Number.isFinite(totalMinutes)) return "";
    const minutes = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function formatDurationHHMM(totalMinutes: number | null): string {
    if (totalMinutes == null || !Number.isFinite(totalMinutes)) return "";
    const minutes = Math.max(0, Math.round(totalMinutes));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }


  function validateField(m: ConfigRow, raw: string): string | null {
    // Checkboxes: no numeric validation
    if (m.type === "checkbox") return null;
    
    // Text: always valid here (required-on-past-days handled elsewhere)
    if (m.type === "text") return null;

    // Empty → treat as delete, no error
    if (raw === "" || raw == null) return null;

    // HH:MM type
    if (m.type === "hhmm") {
      const minutes = parseHHMM(raw);
      if (minutes == null) {
        return `${m.metric_name}: must be HH:MM (00–23:59)`;
      }
      // If you later want min/max for hhmm, you can reuse the numeric block below
      return null;
    }

    // NUMBER / TIME: parse
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      return `${m.metric_name}: not a valid number`;
    }

    // Range checks
    if (m.min_value != null && num < m.min_value) {
      return `${m.metric_name}: must be ≥ ${m.min_value}`;
    }
    if (m.max_value != null && num > m.max_value) {
      return `${m.metric_name}: must be ≤ ${m.max_value}`;
    }

    // Disallowed values (comma-separated in config)
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

  function getNumericValue(m: ConfigRow, vals: Record<string, string>): number | null {
    const raw = vals[m.metric_id];
    if (raw == null || raw.trim() === "") return null;

    switch (m.type) {
      case "number": {
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      }
      case "checkbox": {
        // checkbox stored as "on" or "" in vals
        return raw === "on" || raw === "1" ? 1 : 0;
      }
      case "time": {
        // time = minutes (plain number)
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      }

      case "hhmm": {
        // hhmm = clock time "HH:MM" -> minutes since midnight
        const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return null;

        const hours = Number(match[1]);
        const minutes = Number(match[2]);

        if (
          !Number.isFinite(hours) ||
          !Number.isFinite(minutes) ||
          hours < 0 ||
          hours > 23 ||
          minutes < 0 ||
          minutes > 59
        ) {
          return null;
        }

        return hours * 60 + minutes;
      }

      default:
        return null;
    }
  }

  type NumericContext = {
    [metricId: string]: number | null;
  };

  function buildNumericContext(metrics: ConfigRow[], vals: Record<string, string>): NumericContext {
    const ctx: NumericContext = {};
    for (const m of metrics) {
      ctx[m.metric_id] = getNumericValue(m, vals);
    }
    return ctx;
  }

  function buildNumericContextFromLogRows(
    metrics: ConfigRow[],
    rows: { metric_id: string; value: any }[]
  ): Record<string, number | null> {
    const map = new Map(rows.map((r) => [r.metric_id, r.value]));
    const ctx: Record<string, number | null> = {};
    console.log("DEBUG buildNumericContextFromLogRows called", rows.length);

    for (const m of metrics) {
      const v = map.get(m.metric_id);

      if (v == null) {
        ctx[m.metric_id] = null;
        continue;
      }

      if (m.type === "checkbox") {
        const num = typeof v === "number" ? v : Number(v);
        ctx[m.metric_id] = Number.isFinite(num) && num >= 0.5 ? 1 : 0;
      } else {
        const num = typeof v === "number" ? v : Number(v);
        ctx[m.metric_id] = Number.isFinite(num) ? num : null;
      }
    }
    console.log(
      "DEBUG lazy_time row",
      rows.find(r => r.metric_id === "lazy_time")
    );

    return ctx;
  }


  useEffect(() => {
    if (!authChecked) return;
    if (!date) return;
    if (metrics.length === 0) return;

    const maxN = getMaxPrevDays(metrics);

    // If no calculated metrics use prev(), keep empty
    const needsPrev = metrics.some(
      (m) => m.is_calculated && (m.calc_expr ?? "").includes("prev(")
    );
    if (!needsPrev) {
      setPrevByN({});
      return;
    }

    (async () => {
      try {
        // Build [start, end] = [date - maxN, date - 1]
        const dtEnd = new Date(date + "T00:00:00");
        dtEnd.setDate(dtEnd.getDate() - 1);
        const end = dtEnd.toISOString().slice(0, 10);

        const dtStart = new Date(date + "T00:00:00");
        dtStart.setDate(dtStart.getDate() - maxN);
        const start = dtStart.toISOString().slice(0, 10);

        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/log?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
          { headers }
        );

        const rows = (await res.json()) as { date: string; metric_id: string; value: any }[];
        if (!res.ok) {
          setPrevByN({});
          return;
        }

        // Group rows by date
        const rowsByDate = new Map<string, { metric_id: string; value: any }[]>();
        for (const r of rows) {
          if (!rowsByDate.has(r.date)) rowsByDate.set(r.date, []);
          rowsByDate.get(r.date)!.push({ metric_id: r.metric_id, value: r.value });
        }

        // Build prevByN contexts for 1..maxN
        const out: Record<number, Record<string, number | null>> = {};

        for (let n = 1; n <= maxN; n++) {
          const dt = new Date(date + "T00:00:00");
          dt.setDate(dt.getDate() - n);
          const d = dt.toISOString().slice(0, 10);

          const dayRows = rowsByDate.get(d) ?? [];
          out[n] = buildNumericContextFromLogRows(metrics, dayRows);
        }

        setPrevByN(out);
      } catch {
        setPrevByN({});
      }
    })();
  }, [authChecked, date, metrics]);


  // type Token =
  //   | { kind: "number"; value: number }
  //   | { kind: "ident"; name: string }
  //   | { kind: "op"; op: "+" | "-" | "*" | "/" }
  //   | { kind: "paren"; value: "(" | ")" };

  // function tokenizeExpr(expr: string): Token[] | null {
  //   const tokens: Token[] = [];
  //   let i = 0;

  //   while (i < expr.length) {
  //     const ch = expr[i];

  //     if (ch === " " || ch === "\t") {
  //       i++;
  //       continue;
  //     }

  //     if (/[0-9.]/.test(ch)) {
  //       let j = i;
  //       while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
  //       const numStr = expr.slice(i, j);
  //       const n = Number(numStr);
  //       if (!Number.isFinite(n)) return null;
  //       tokens.push({ kind: "number", value: n });
  //       i = j;
  //       continue;
  //     }

  //     if (/[a-zA-Z_]/.test(ch)) {
  //       let j = i;
  //       while (j < expr.length && /[a-zA-Z0-9_]/.test(expr[j])) j++;
  //       const name = expr.slice(i, j);
  //       tokens.push({ kind: "ident", name });
  //       i = j;
  //       continue;
  //     }

  //     if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
  //       tokens.push({ kind: "op", op: ch });
  //       i++;
  //       continue;
  //     }

  //     if (ch === "(" || ch === ")") {
  //       tokens.push({ kind: "paren", value: ch });
  //       i++;
  //       continue;
  //     }

  //     // unsupported character
  //     return null;
  //   }

  //   return tokens;
  // }

  // function toRpn(tokens: Token[]): (Token & { kind: "number" | "ident" | "op" })[] | null {
  //   const output: (Token & { kind: "number" | "ident" | "op" })[] = [];
  //   const ops: ("+" | "-" | "*" | "/" | "(")[] = [];

  //   const precedence: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

  //   for (const t of tokens) {
  //     if (t.kind === "number" || t.kind === "ident") {
  //       output.push(t as any);
  //     } else if (t.kind === "op") {
  //       while (ops.length > 0) {
  //         const top = ops[ops.length - 1];
  //         if (top === "(") break;
  //         if (precedence[top] >= precedence[t.op]) {
  //           output.push({ kind: "op", op: ops.pop()! } as any);
  //         } else break;
  //       }
  //       ops.push(t.op);
  //     } else if (t.kind === "paren" && t.value === "(") {
  //       ops.push("(");
  //     } else if (t.kind === "paren" && t.value === ")") {
  //       let found = false;
  //       while (ops.length > 0) {
  //         const top = ops.pop()!;
  //         if (top === "(") {
  //           found = true;
  //           break;
  //         }
  //         output.push({ kind: "op", op: top } as any);
  //       }
  //       if (!found) return null; // mismatched parens
  //     }
  //   }

  //   while (ops.length > 0) {
  //     const top = ops.pop()!;
  //     if (top === "(") return null;
  //     output.push({ kind: "op", op: top } as any);
  //   }

  //   return output;
  // }

  // function evalRpn(
  //   rpn: (Token & { kind: "number" | "ident" | "op" })[],
  //   ctx: NumericContext
  // ): number | null {
  //   const stack: number[] = [];

  //   for (const t of rpn) {
  //     if (t.kind === "number") {
  //       stack.push(t.value);
  //     } else if (t.kind === "ident") {
  //       const metric = metricsById[t.name]; // ConfigRow | undefined
  //       const v = ctx[t.name];

  //       // Treat missing checkbox as 0 for arithmetic
  //       if (metric?.type === "checkbox") {
  //         stack.push(v ?? 0);
  //         continue;
  //       }

  //       // For all other types, missing propagates to null
  //       if (v == null) return null;
  //       stack.push(v);
  //     } else if (t.kind === "op") {
  //       if (stack.length < 2) return null;
  //       const b = stack.pop()!;
  //       const a = stack.pop()!;
  //       if (a == null || b == null) return null;
  //       let res: number;
  //       switch (t.op) {
  //         case "+":
  //           res = a + b;
  //           break;
  //         case "-":
  //           res = a - b;
  //           break;
  //         case "*":
  //           res = a * b;
  //           break;
  //         case "/":
  //           if (b === 0) return null;
  //           res = a / b;
  //           break;
  //         default:
  //           return null;
  //       }
  //       if (!Number.isFinite(res)) return null;
  //       stack.push(res);
  //     }
  //   }


  //   if (stack.length !== 1) return null;
  //   return stack[0];
  // }

  // function evalCalcExpr(
  //   expr: string,
  //   ctx: Record<string, number | null>,
  //   metricsById: Record<string, ConfigRow>
  // ): number | null{
  //   const trimmed = expr.trim();
  //   if (!trimmed) return null;

  //   const tokens = tokenizeExpr(trimmed);
  //   if (!tokens) return null;

  //   const rpn = toRpn(tokens);
  //   if (!rpn) return null;

  //   return evalRpn(rpn, ctx);
  // }

  // function splitTopLevelArgs(s: string): string[] {
  //   // splits "a, b, prev(x)" at commas, respecting parentheses depth
  //   const out: string[] = [];
  //   let depth = 0;
  //   let start = 0;
  //   for (let i = 0; i < s.length; i++) {
  //     const ch = s[i];
  //     if (ch === "(") depth++;
  //     else if (ch === ")") depth--;
  //     else if (ch === "," && depth === 0) {
  //       out.push(s.slice(start, i).trim());
  //       start = i + 1;
  //     }
  //   }
  //   out.push(s.slice(start).trim());
  //   return out.filter(Boolean);
  // }

  // function diffMinutes(a: number, b: number): number {
  //   // wraparound: minutes from b to a
  //   const d = a - b;
  //   return d >= 0 ? d : d + 1440;
  // }

  // function evalCalcExprV1(
  //   expr: string,
  //   ctxToday: Record<string, number | null>,
  //   ctxPrev: Record<string, number | null>
  // ): number | null {
  //   const s = expr.trim();
  //   if (!s) return null;

  //   // prev(x)
  //   const prevMatch = /^prev\(\s*([a-zA-Z0-9_]+)\s*\)$/.exec(s);
  //   if (prevMatch) {
  //     const id = prevMatch[1];
  //     return ctxPrev[id] ?? null;
  //   }

  //   // or(a,b,c...)
  //   const orMatch = /^or\((.*)\)$/.exec(s);
  //   if (orMatch) {
  //     const args = splitTopLevelArgs(orMatch[1]);
  //     for (const a of args) {
  //       const v = evalCalcExprV1(a, ctxToday, ctxPrev);
  //       // treat null as 0 for OR (your preference)
  //       if ((v ?? 0) !== 0) return 1;
  //     }
  //     return 0;
  //   }

  //   // diff(a,b)
  //   const diffMatch = /^diff\((.*)\)$/.exec(s);
  //   if (diffMatch) {
  //     const args = splitTopLevelArgs(diffMatch[1]);
  //     if (args.length !== 2) return null;
  //     const a = evalCalcExprV1(args[0], ctxToday, ctxPrev);
  //     const b = evalCalcExprV1(args[1], ctxToday, ctxPrev);
  //     if (a == null || b == null) return null;
  //     return diffMinutes(a, b);
  //   }

  //   // identifier
  //   if (/^[a-zA-Z0-9_]+$/.test(s)) {
  //     return ctxToday[s] ?? null;
  //   }

  //   // fallback: arithmetic via your existing RPN path
  //   return evalCalcExpr(s, ctxToday, metricsById);
  // }


  const numericContext = React.useMemo(
    () => buildNumericContext(metrics, vals),
    [metrics, vals]
  );

  const { values: calculatedValues, errors: calcErrors, missing: calcMissing } = React.useMemo(() => {
    return evaluateCalculatedMetricsV2(
      metrics.map((m) => ({
        metric_id: m.metric_id,
        type: m.type,
        is_calculated: m.is_calculated,
        calc_expr: m.calc_expr,
      })),
      numericContext,
      prevByN
    );
  }, [metrics, numericContext, prevByN]);


  // Optional: debugging (remove later)
  useEffect(() => {
    const anyErr = Object.entries(calcErrors).filter(([, v]) => v);
    if (anyErr.length) console.warn("Calc errors:", anyErr);
  }, [calcErrors]);



  type PresetValue = { raw: string; display: string };

  function parsePresets(metric: ConfigRow): PresetValue[] {
    const csv = metric.preset_values_csv;
    if (!csv) return [];

    const values = csv
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (metric.type === "text") {
      // Text type: pass through as-is
      return values.map((v) => ({ raw: v, display: v }));
    }

    if (metric.type === "hhmm") {
      // HH:MM format - validate and pass through
      return values
        .map((s) => {
          // Accept HH:MM format
          const match = s.match(/^(\d{1,2}):(\d{2})$/);
          if (!match) return null;
          const h = parseInt(match[1], 10);
          const m = parseInt(match[2], 10);
          if (h < 0 || h > 23 || m < 0 || m > 59) return null;
          // Normalize display to HH:MM
          const display = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          return { raw: display, display };
        })
        .filter((v): v is PresetValue => v !== null);
    }

    if (metric.type === "time") {
      // Time in minutes - can be entered as minutes or HH:MM
      return values
        .map((s) => {
          // Try HH:MM format first
          const match = s.match(/^(\d{1,2}):(\d{2})$/);
          if (match) {
            const h = parseInt(match[1], 10);
            const m = parseInt(match[2], 10);
            const totalMinutes = h * 60 + m;
            return { raw: String(totalMinutes), display: `${h}:${String(m).padStart(2, "0")}` };
          }
          // Otherwise treat as minutes
          const n = Number(s);
          if (!Number.isFinite(n) || n < 0) return null;
          const hours = Math.floor(n / 60);
          const mins = n % 60;
          return { raw: String(n), display: hours > 0 ? `${hours}:${String(mins).padStart(2, "0")}` : `${mins}m` };
        })
        .filter((v): v is PresetValue => v !== null);
    }

    // Numeric types (number): parse as numbers, filter invalid
    return values
      .map((s) => {
        const n = Number(s);
        if (!Number.isFinite(n)) return null;
        return { raw: String(n), display: String(n) };
      })
      .filter((v): v is PresetValue => v !== null);
  }

  function applyPresetValue(metric: ConfigRow, preset: PresetValue) {
    markAsTouched(metric.metric_id);

    // reuse existing validation
    const msg = validateField(metric, preset.raw);

    setVals((prev) => ({
      ...prev,
      [metric.metric_id]: preset.raw,
    }));

    setFieldErrors((prev) => ({
      ...prev,
      [metric.metric_id]: msg,
    }));

    setDirty(true);
  }



  async function reloadDateHints() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/date_hints", { headers });

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        // non-JSON, bail quietly
        return;
      }

      const j = await res.json();
      if (!res.ok || j?.error) {
        console.error("date-hints error:", j?.error || j);
        return;
      }

      setDateHints(j as DateHints);
    } catch (e) {
      console.error("date-hints fetch failed:", e);
    }
  }



  async function save() {
    setSaving(true);
    setError(null);

    try {
      // -----------------------------
      // 1) Numeric / format validation
      // -----------------------------
      const newErrors: Record<string, string | null> = {};
      let hasAnyError = false;

      for (const m of metrics) {
        const raw = vals[m.metric_id] ?? "";

        // No validation for checkboxes or calculated metrics
        if (m.type === "checkbox" || m.is_calculated) {
          newErrors[m.metric_id] = null;
          continue;
        }

        const msg = validateField(m, raw);
        if (msg) {
          hasAnyError = true;
          newErrors[m.metric_id] = msg;
        } else {
          newErrors[m.metric_id] = null;
        }
      }

      if (hasAnyError) {
        setFieldErrors((prev) => ({ ...prev, ...newErrors }));
        setError("Please fix the highlighted fields before saving.");
        setSaving(false);
        return;
      }

      // -----------------------------------------
      // 2) Required guard ONLY for past dates (< today)
      // -----------------------------------------
      if (date < todayISO) {
        const missingLabels: string[] = [];
        const requiredErrors: Record<string, string | null> = {};

        for (const m of metrics) {
          // Skip non-required OR calculated metrics
          if (!m.required || m.is_calculated) continue;

          const raw = vals[m.metric_id];

          let missing = false;


          if (m.type === "checkbox") {
            // For checkboxes:
            //   - undefined  => user hasn't touched it => treat as missing
            //   - "on" or "" => explicitly logged (true/false) => OK
            if (raw === undefined) {
              missing = true;
            }
          } else {
            // For numeric / time / hhmm:
            //   - undefined or "" => missing
            //   - anything else   => logged (we already validated format above)
            if (raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
              missing = true;
            }
          }

          if (missing) {
            const label = m.metric_name || m.metric_id;
            missingLabels.push(label);
            requiredErrors[m.metric_id] = `${label} is required for this date`;
          } else {
            requiredErrors[m.metric_id] = null;
          }
        }

        if (missingLabels.length > 0) {
          setFieldErrors((prev) => ({ ...prev, ...requiredErrors }));
          setError(
            `Please fill these required metrics before saving this past day: ${missingLabels.join(
              ", "
            )}.`
          );
          setSaving(false);
          return;
        }
      }

      // -----------------------------
      // -----------------------------
      // 3) Build entries + POST
      // -----------------------------
      const entries = buildEntries();

      const headers = await getAuthHeaders();
      console.log("CLIENT save payload:", {
        date,
        metricsCount: metrics.length,
        entriesCount: entries.length,
        sample: entries.slice(0, 5),
      });

      const res = await fetch("/api/save-log", {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
        },
        body: JSON.stringify({ date, entries }),
      });


      if (!res.ok) {
        const text = await res.text();
        console.error("save-log failed:", res.status, text);
        alert(`Save failed (${res.status}). Check console/network for details.`);
        return;
      }

      await loadDayValues(date);

      await loadSummary();
      setDirty(false);
      await reloadDateHints();
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  // Update ref so keyboard shortcut always has current save function
  saveRef.current = save;

  async function loadSummary() {
    setError(null);
    const headers = await getAuthHeaders();
    const res = await fetch("/api/summary_7d", { headers });
    const data = await res.json();
    if (!res.ok) {
      setError(data?.error || "Failed to load summary");
      return;
    }
    setSummary(data);
  }

  async function loadDayValues(d: string) {
    setError(null);
    // Reset touched state when loading a new day
    setTouchedMetrics(new Set());

    const headers = await getAuthHeaders();
    const res = await fetch(`/api/log?date=${encodeURIComponent(d)}`, {
      headers,
    });

    const rows: { metric_id: string; value: number | null; value_text?: string | null }[] = await res.json();
    if (!res.ok) {
      setError((rows as any)?.error || "Failed to load day");
      return;
    }

    const valueMap = new Map<string, number | null>();
    const textMap = new Map<string, string | null>();

    for (const r of rows) {
      valueMap.set(r.metric_id, r.value);
      textMap.set(r.metric_id, r.value_text ?? null);
    }

    const next: Record<string, string> = {};
    const newDefaultPopulated = new Set<string>();

    for (const def of metrics) {
      const existing = valueMap.get(def.metric_id);
      const hasExistingValue = existing != null;
      const hasExistingText = textMap.get(def.metric_id) != null;

      if (def.type === "checkbox") {
        if (hasExistingValue) {
          next[def.metric_id] = existing >= 0.5 ? "on" : "";
        } else if (def.default_value != null) {
          next[def.metric_id] = def.default_value >= 0.5 ? "on" : "";
          newDefaultPopulated.add(def.metric_id);
        } else {
          next[def.metric_id] = "";
        }
      } else if (def.type === "text") {
        const existingText = textMap.get(def.metric_id);
        next[def.metric_id] = existingText ?? "";
        // Text type doesn't use default_value
      } else if (def.type === "hhmm") {
        if (hasExistingValue) {
          next[def.metric_id] = formatHHMM(existing);
        } else if (def.default_value != null) {
          next[def.metric_id] = formatHHMM(def.default_value);
          newDefaultPopulated.add(def.metric_id);
        } else {
          next[def.metric_id] = "";
        }
      } else {
        // number, time
        if (hasExistingValue) {
          next[def.metric_id] = String(existing);
        } else if (def.default_value != null) {
          next[def.metric_id] = String(def.default_value);
          newDefaultPopulated.add(def.metric_id);
        } else {
          next[def.metric_id] = "";
        }
      }
    }

    setVals(next);
    setDefaultPopulated(newDefaultPopulated);
    setFieldErrors({}); // clear per-field errors
    setDirty(false);
  }


  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newDate = e.target.value;

    if (dirty) {
      const ok = window.confirm(
        "You have unsaved changes.\nDiscard them and switch date?"
      );
      if (!ok) {
        e.target.value = date; // revert
        return;
      }
    }

    setDate(newDate);
    //setShowHeadsUp(false); // user navigated -> hide global heads up
    loadDayValues(newDate); // if/when you want immediate load
  }  

  if (!authChecked) {
    return (
      <main className="p-6">
        <div className="text-sm text-gray-600">Checking session…</div>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Sticky Header with Date & Save */}
      <header className="sticky top-0 z-40 bg-white border-b shadow-sm">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <input
              type="date"
              value={date}
              max={todayISO}
              onChange={handleDateChange}
              className="border rounded px-3 py-1.5 text-sm"
            />
            {dirty && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                Unsaved changes
              </span>
            )}
            {dateHints && dateHints.required_days_possible > 0 && (
              <span className="text-xs text-gray-500">
                {dateHints.required_days_completed}/{dateHints.required_days_possible} days
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Show Accept All Defaults button if there are untouched defaults */}
            {defaultPopulated.size > 0 && (() => {
              const untouchedCount = Array.from(defaultPopulated).filter(id => !touchedMetrics.has(id)).length;
              return untouchedCount > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTouchedMetrics(prev => {
                      const next = new Set(prev);
                      defaultPopulated.forEach(id => next.add(id));
                      return next;
                    });
                  }}
                >
                  Accept Defaults ({untouchedCount})
                </Button>
              ) : null;
            })()}
            <Button
              onClick={save}
              disabled={saving || metrics.length === 0}
            >
              {saving ? "Saving..." : "Save Day"}
            </Button>
            <span className="text-xs text-muted-foreground">Ctrl+Enter</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-3xl mx-auto w-full space-y-6">
        <h1 className="text-2xl font-semibold">Daily Tracker</h1>

        <div className="space-y-2">
          {gapMessage && (
            <div
              style={{
                display: "inline-block",
                padding: "2px 6px",
                fontSize: "0.75rem",
                borderRadius: 4,
                backgroundColor: "#FEF9C3",
                border: "1px solid #FACC15",
                color: "#78350F",
              }}
            >
              {gapMessage}
            </div>
          )}

          <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={showCalcDebug}
              onChange={(e) => setShowCalcDebug(e.target.checked)}
            />
            <span className="text-sm">Show calc debug</span>
          </label>
        </div>
    {/*
      {dateHints &&
        dateHints.missing_required_days > 0 &&
        showHeadsUp && (
          <div
            style={{
              marginTop: 8,
              padding: "6px 8px",
              fontSize: "0.8rem",
              borderRadius: 4,
              backgroundColor: "#FEF9C3",
              border: "1px solid #FACC15",
              color: "#78350F",
              maxWidth: 520,
            }}
          >
            <strong>Heads up</strong>
            <div style={{ marginTop: 2 }}>
              Required metrics were last fully completed on{" "}
              {dateHints.last_required_complete_date}. There may be{" "}
              {dateHints.missing_required_days} missing day
              {dateHints.missing_required_days === 1 ? "" : "s"} between then and
              today. We’ve jumped you to {dateHints.suggested_date}.
            </div> 
          </div>
        )}*/}

      {metrics.length === 0 ? (
        <div>{error ? `Error: ${error}` : "Loading metrics…"}</div>
      ) : (
        <div>
          {groupedMetrics.map((group) => {
            const isCollapsed = collapsedGroups[group.groupName] ?? false;

            return (
              <Card key={group.groupName} className="mt-4 max-w-md overflow-hidden">
                {/* Group header bar */}
                <CardHeader
                  className="bg-amber-50 py-2 px-3 cursor-pointer border-b"
                  onClick={() => toggleGroup(group.groupName)}
                >
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">
                      {group.groupName}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {group.items.length}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {isCollapsed ? "▸" : "▾"}
                      </span>
                    </div>
                  </div>
                </CardHeader>

                {/* Group body */}
                {!isCollapsed && (
                  <CardContent className="p-4">
                    {group.items.map((m) => {
                      const isCalculated = m.is_calculated;

                      const calcValue = isCalculated ? calculatedValues[m.metric_id] : null;

                      // current raw value + error for this metric
                      const raw = vals[m.metric_id] ?? "";
                      const err = fieldErrors[m.metric_id] ?? null;

                      let calcDisplay: string | null = null;
                      if (isCalculated) {
                        if (calcValue == null) {
                          calcDisplay = "—";
                        } else if (m.type === "hhmm") {
                          calcDisplay = formatDurationHHMM(calcValue);
                        // } else if (m.type === "checkbox") {
                        //   calcDisplay = calcValue >= 0.5 ? "✓" : "";
                        } else {
                          calcDisplay = String(calcValue);
                        }
                      }

                      return (
                        <div key={m.metric_id} className="mb-3">
                          {/* LABEL */}
                          <label className="flex items-center gap-2 font-medium mb-1">
                            {m.metric_name}
                            {m.required && !isCalculated && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                required
                              </Badge>
                            )}
                            {isCalculated && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                calc
                              </Badge>
                            )}
                          </label>

                          {isCalculated ? (
                            m.type === "checkbox" ? (
                              <div className="mt-0.5">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={(calcValue ?? 0) >= 0.5}
                                    disabled
                                    className="h-5 w-5 opacity-60 cursor-not-allowed"
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    (calculated)
                                  </span>
                                </div>

                                {showCalcDebug && (
                                  <div className="mt-1 text-xs text-muted-foreground w-72">
                                    <div className="font-mono whitespace-pre-wrap">
                                      {m.calc_expr || "(no expr)"}
                                    </div>
                                    {calcErrors?.[m.metric_id] ? (
                                      <div className="mt-0.5 text-destructive">⚠️ {calcErrors[m.metric_id]}</div>
                                    ) : (
                                      <div className="mt-0.5">
                                        {calcValue == null ? "Value is null" : "Value computed"}
                                        {calcMissing?.[m.metric_id]?.length ? (
                                          <div className="mt-0.5">
                                            Missing: {calcMissing[m.metric_id].join(", ")}
                                          </div>
                                        ) : null}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <div className="mt-0.5 border border-gray-200 bg-gray-50 min-h-[22px] w-72 px-2 py-1 flex items-center rounded-md text-sm">
                                  {calcDisplay}
                                </div>

                                {showCalcDebug && (
                                  <div className="mt-1 text-xs text-muted-foreground w-72">
                                    <div className="font-mono whitespace-pre-wrap">
                                      {m.calc_expr || "(no expr)"}
                                    </div>
                                    {calcErrors?.[m.metric_id] ? (
                                      <div className="mt-0.5 text-destructive">⚠️ {calcErrors[m.metric_id]}</div>
                                    ) : (
                                      <div className="mt-0.5">
                                        {calcValue == null ? "Value is null" : "Value computed"}
                                      </div>
                                    )}
                                    {calcMissing?.[m.metric_id]?.length ? (
                                      <div className="mt-0.5">
                                        Missing: {calcMissing[m.metric_id].join(", ")}
                                      </div>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            )

                          ) : m.type === "checkbox" ? (
                            <>
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={raw === "on"}
                                  onFocus={() => markAsTouched(m.metric_id)}
                                  onChange={(e) => {
                                    markAsTouched(m.metric_id);
                                    const v = e.target.checked ? "on" : "";
                                    setVal(m.metric_id, v);
                                    setDirty(true);
                                    setFieldErrors((prev) => ({
                                      ...prev,
                                      [m.metric_id]: null,
                                    }));
                                  }}
                                  className={cn(
                                    "h-5 w-5 rounded border-gray-300",
                                    defaultPopulated.has(m.metric_id) && !touchedMetrics.has(m.metric_id) && "accent-amber-500"
                                  )}
                                />
                                {defaultPopulated.has(m.metric_id) && !touchedMetrics.has(m.metric_id) && (
                                  <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                                    default
                                  </Badge>
                                )}
                              </div>
                              {err && <p className="text-xs text-destructive mt-1">{err}</p>}
                            </>
                          ) : m.type === "text" ? (
                            <div>
                              <Textarea
                                value={raw}
                                rows={4}
                                onFocus={() => markAsTouched(m.metric_id)}
                                onChange={(e) => {
                                  markAsTouched(m.metric_id);
                                  const v = e.target.value;
                                  setVal(m.metric_id, v);
                                  setDirty(true);
                                  setFieldErrors((prev) => ({ ...prev, [m.metric_id]: null }));
                                }}
                                className={cn(
                                  "w-72",
                                  err && "border-destructive bg-destructive/10"
                                )}
                              />

                              {parsePresets(m).length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {parsePresets(m).map((p) => (
                                    <Button
                                      key={p.raw}
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => applyPresetValue(m, p)}
                                      title={p.display}
                                      className={cn(
                                        "h-7 px-2 text-xs max-w-[150px] truncate",
                                        p.raw === raw && "bg-amber-100 border-amber-300"
                                      )}
                                    >
                                      {p.display}
                                    </Button>
                                  ))}
                                </div>
                              )}

                              {err && <p className="text-xs text-destructive mt-1 px-1">{err}</p>}
                            </div>
                          ) : (
                            <div>
                              {defaultPopulated.has(m.metric_id) && !touchedMetrics.has(m.metric_id) && (
                                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 mb-1">
                                  default
                                </Badge>
                              )}
                              <Input
                                value={raw}
                                onFocus={() => markAsTouched(m.metric_id)}
                                onChange={(e) => {
                                  markAsTouched(m.metric_id);
                                  const v = e.target.value;
                                  setVal(m.metric_id, v);
                                  setDirty(true);
                                  const msg = validateField(m, v);
                                  setFieldErrors((prev) => ({
                                    ...prev,
                                    [m.metric_id]: msg,
                                  }));
                                }}
                                onBlur={(e) => {
                                  const v = e.target.value;
                                  const msg = validateField(m, v);
                                  setFieldErrors((prev) => ({
                                    ...prev,
                                    [m.metric_id]: msg,
                                  }));
                                }}
                                className={cn(
                                  "w-72",
                                  err && "border-destructive bg-destructive/10",
                                  defaultPopulated.has(m.metric_id) && !touchedMetrics.has(m.metric_id) && "border-amber-500 bg-amber-50"
                                )}
                              />

                              {parsePresets(m).length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {parsePresets(m).map((p) => (
                                    <Button
                                      key={p.raw}
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => applyPresetValue(m, p)}
                                      title={p.display}
                                      className={cn(
                                        "h-7 px-2 text-xs max-w-[100px] truncate",
                                        p.raw === raw && "bg-amber-100 border-amber-300"
                                      )}
                                    >
                                      {p.display}
                                    </Button>
                                  ))}
                                </div>
                              )}

                              {err && <p className="text-xs text-destructive mt-1 px-1">{err}</p>}
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}

        </div>
      )}


      
      {error && <div className="text-red-600 text-sm">Error: {error}</div>}

      <div className="border rounded p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium">7-day Summary</span>
          <Button variant="outline" size="sm" onClick={loadSummary}>
            Refresh
          </Button>
        </div>
        {!summary ? (
          <div className="text-sm text-gray-600">Click "Refresh" to load summary.</div>
        ) : summary.length === 0 ? (
          <div className="text-sm text-gray-600">No data yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1 pr-2">metric_id</th>
                <th className="py-1 pr-2">type</th>
                <th className="py-1 pr-2">n_rows</th>
                <th className="py-1 pr-2">sum_7d</th>
                <th className="py-1 pr-2">count_true_7d</th>
                <th className="py-1 pr-2">avg_7d</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((row: any) => (
                <tr key={row.metric_id} className="border-b">
                  <td className="py-1 pr-2">{row.metric_id}</td>
                  <td className="py-1 pr-2">{row.type}</td>
                  <td className="py-1 pr-2">{row.n_rows ?? ""}</td>
                  <td className="py-1 pr-2">{row.sum_7d ?? ""}</td>
                  <td className="py-1 pr-2">{row.count_true_7d ?? ""}</td>
                  <td className="py-1 pr-2">{row.avg_7d ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </main>
    </div>
  );
}
