"use client";
import { useEffect, useState, useCallback } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import React from "react";


type ConfigRow = {
  metric_id: string;
  metric_name: string;
  type: "checkbox" | "number" | "time" | "hhmm";
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

};

const errorInputStyle: React.CSSProperties = {
  backgroundColor: "#fecaca", // Tailwind-ish red-200
  borderColor: "#dc2626",     // red-600
  borderWidth: 1,
};

const errorBoxStyle: React.CSSProperties = {
  marginTop: 4,
  backgroundColor: "#dc2626",
  color: "white",
  fontSize: "0.75rem",
  padding: "4px 8px",      // a bit of side padding
  borderRadius: 4,
  display: "inline-block", // 🔹 only as wide as content
};

type DateHints = {
  today: string;
  last_log_date: string | null;
  last_required_complete_date: string | null;
  suggested_date: string;
  missing_required_days: number;
  required_days_completed: number;
  required_days_possible: number;
};

type Summary7dRow = Record<string, unknown>;


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
  const todayISO = new Date().toISOString().slice(0, 10);
  // const [date, setDate] = useState<string>(() => {
  //   const now = new Date();
  //   // Shift by timezone offset to get local date in ISO format
  //   const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  //   return local.toISOString().slice(0, 10); // "YYYY-MM-DD" in local time
  // });
  const [date, setDate] = useState<string>(() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  });
  const [metrics, setMetrics] = useState<ConfigRow[]>([]);
  const [vals, setVals] = useState<Record<string, string>>({});
  //type Summary7dRow = Record<string, unknown>;
  const [summary, setSummary] = useState<Summary7dRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});

  const [dateHints, setDateHints] = useState<DateHints | null>(null);
  const [dateInitializedFromHints, setDateInitializedFromHints] = useState(false);
  const [jumpedFromHints, setJumpedFromHints] = useState<string | null>(null);


  //const hasRequired = metrics.some((m) => m.required);

  const [showHeadsUp, setShowHeadsUp] = useState(false);
  const [hasShownHeadsUp, setHasShownHeadsUp] = useState(false);

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  

  function toggleGroup(name: string) {
    setCollapsedGroups((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  }

  console.log("metrics for form", metrics);

  const groupedMetrics = React.useMemo<
    { groupName: string; items: ConfigRow[] }[]
  >(() => {
    if (!metrics || metrics.length === 0) return [];

    const map = new Map<string, ConfigRow[]>();

    for (const m of metrics) {
      const groupName = m.group || "Other";
      if (!map.has(groupName)) map.set(groupName, []);
      map.get(groupName)!.push(m);
    }

    return Array.from(map.entries()).map(([groupName, items]) => ({
      groupName,
      items,
    }));
  }, [metrics]);

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

  // const missingRequiredDaysClient = (() => {
  //   if (!dateHints?.last_required_complete_date) return 0;
  //   const diff = daysBetween(dateHints.last_required_complete_date, dateHints.today);
  //   return Math.max(0, diff - 1);
  // })();

  const missingRequiredDaysClient = React.useMemo(() => {
    if (!dateHints?.last_required_complete_date) return 0;
    const diff = daysBetween(dateHints.last_required_complete_date, dateHints.today);
    return Math.max(0, diff - 1);
  }, [dateHints]);

  console.log("DateHints for gap check:", dateHints, "current date:", date);

  
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

  // Load metrics from /api/config
  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();

        const res = await fetch("/api/config", { headers });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load config");

        const rows = data as ConfigRow[];

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
        }));

        const visible = normalized.filter(
          (r) => !r.private && r.active
        );

        setMetrics(sortMetricsForForm(visible));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setSaving(false);
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

    // Record the "jump" message only if we changed the date away from today (or away from whatever it currently is)
    // More robust: compare to current `date` if it exists.
    const prevDate = date || null;

    setDate(nextDate);

    // Heads-up is ONLY about the initial auto-jump, not date changes later
    if (!hasShownHeadsUp) {
      if (nextDate && prevDate && nextDate !== prevDate) {
        setJumpedFromHints(nextDate);
        setShowHeadsUp(true);
      } else if (!prevDate) {
        // first ever load: we still consider this a "jump" to nextDate if it's not today
        if (nextDate !== dateHints.today) {
          setJumpedFromHints(nextDate);
          setShowHeadsUp(true);
        } else {
          setShowHeadsUp(false);
        }
      } else {
        setShowHeadsUp(false);
      }
      setHasShownHeadsUp(true);
    }

    setDateInitializedFromHints(true);
  }, [authChecked, dateHints, dateInitializedFromHints, hasShownHeadsUp, date]);


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

  function buildEntries(): { metric_id: string; value: number | null }[] {
    const entries: { metric_id: string; value: number | null }[] = [];

    for (const m of metrics) {
      // Calculated metrics → use calculatedValues
      if (m.is_calculated) {
        const v = calculatedValues[m.metric_id];
        const num =
          v != null && Number.isFinite(v) ? (v as number) : null;

        entries.push({
          metric_id: m.metric_id,
          value: num,
        });

        continue;
      }

      // Non-calculated metrics → use user input
      const raw = vals[m.metric_id];
      const trimmed = raw?.trim() ?? "";

      let value: number | null = null;

      if (m.type === "checkbox") {
        // checkbox: presence → 1, else 0
        value = trimmed ? 1 : 0;
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

  function validateField(m: ConfigRow, raw: string): string | null {
    // Checkboxes: no numeric validation
    if (m.type === "checkbox") return null;

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
      case "time":
      case "hhmm": {
        // expect HH:MM → convert to minutes since midnight
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

  type Token =
    | { kind: "number"; value: number }
    | { kind: "ident"; name: string }
    | { kind: "op"; op: "+" | "-" | "*" | "/" }
    | { kind: "paren"; value: "(" | ")" };

  function tokenizeExpr(expr: string): Token[] | null {
    const tokens: Token[] = [];
    let i = 0;

    while (i < expr.length) {
      const ch = expr[i];

      if (ch === " " || ch === "\t") {
        i++;
        continue;
      }

      if (/[0-9.]/.test(ch)) {
        let j = i;
        while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
        const numStr = expr.slice(i, j);
        const n = Number(numStr);
        if (!Number.isFinite(n)) return null;
        tokens.push({ kind: "number", value: n });
        i = j;
        continue;
      }

      if (/[a-zA-Z_]/.test(ch)) {
        let j = i;
        while (j < expr.length && /[a-zA-Z0-9_]/.test(expr[j])) j++;
        const name = expr.slice(i, j);
        tokens.push({ kind: "ident", name });
        i = j;
        continue;
      }

      if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
        tokens.push({ kind: "op", op: ch });
        i++;
        continue;
      }

      if (ch === "(" || ch === ")") {
        tokens.push({ kind: "paren", value: ch });
        i++;
        continue;
      }

      // unsupported character
      return null;
    }

    return tokens;
  }

  function toRpn(tokens: Token[]): (Token & { kind: "number" | "ident" | "op" })[] | null {
    const output: (Token & { kind: "number" | "ident" | "op" })[] = [];
    const ops: ("+" | "-" | "*" | "/" | "(")[] = [];

    const precedence: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

    for (const t of tokens) {
      if (t.kind === "number" || t.kind === "ident") {
        output.push(t as any);
      } else if (t.kind === "op") {
        while (ops.length > 0) {
          const top = ops[ops.length - 1];
          if (top === "(") break;
          if (precedence[top] >= precedence[t.op]) {
            output.push({ kind: "op", op: ops.pop()! } as any);
          } else break;
        }
        ops.push(t.op);
      } else if (t.kind === "paren" && t.value === "(") {
        ops.push("(");
      } else if (t.kind === "paren" && t.value === ")") {
        let found = false;
        while (ops.length > 0) {
          const top = ops.pop()!;
          if (top === "(") {
            found = true;
            break;
          }
          output.push({ kind: "op", op: top } as any);
        }
        if (!found) return null; // mismatched parens
      }
    }

    while (ops.length > 0) {
      const top = ops.pop()!;
      if (top === "(") return null;
      output.push({ kind: "op", op: top } as any);
    }

    return output;
  }

  function evalRpn(
    rpn: (Token & { kind: "number" | "ident" | "op" })[],
    ctx: NumericContext
  ): number | null {
    const stack: number[] = [];

    for (const t of rpn) {
      if (t.kind === "number") {
        stack.push(t.value);
      } else if (t.kind === "ident") {
        const v = ctx[t.name];
        if (v == null) return null;
        stack.push(v);
      } else if (t.kind === "op") {
        if (stack.length < 2) return null;
        const b = stack.pop()!;
        const a = stack.pop()!;
        if (a == null || b == null) return null;
        let res: number;
        switch (t.op) {
          case "+":
            res = a + b;
            break;
          case "-":
            res = a - b;
            break;
          case "*":
            res = a * b;
            break;
          case "/":
            if (b === 0) return null;
            res = a / b;
            break;
          default:
            return null;
        }
        if (!Number.isFinite(res)) return null;
        stack.push(res);
      }
    }

    if (stack.length !== 1) return null;
    return stack[0];
  }

  function evalCalcExpr(expr: string, ctx: NumericContext): number | null {
    const trimmed = expr.trim();
    if (!trimmed) return null;

    const tokens = tokenizeExpr(trimmed);
    if (!tokens) return null;

    const rpn = toRpn(tokens);
    if (!rpn) return null;

    return evalRpn(rpn, ctx);
  }



  const numericContext = React.useMemo(
    () => buildNumericContext(metrics, vals),
    [metrics, vals]
  );

  const calculatedValues = React.useMemo<Record<string, number | null>>(() => {
    const result: Record<string, number | null> = {};
    for (const m of metrics) {
      if (!m.is_calculated || !m.calc_expr) {
        result[m.metric_id] = null;
        continue;
      }

      const v = evalCalcExpr(m.calc_expr, numericContext);
      result[m.metric_id] = v;
    }
    return result;
  }, [metrics, numericContext]);

  function parsePresets(metric: ConfigRow): number[] {
    const raw = (metric as any).preset_values_csv as string | null | undefined;
    if (!raw) return [];

    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
  }

  function applyPresetValue(metric: ConfigRow, preset: number) {
    const raw = String(preset);

    // reuse your existing validation
    const msg = validateField(metric, raw);

    setVals((prev) => ({
      ...prev,
      [metric.metric_id]: raw,
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
      // 3) Build entries + POST
      // -----------------------------
      const entries = buildEntries();


      const headers = await getAuthHeaders();

      const res = await fetch("/api/save-log", {
        method: "POST",
        headers: {
          ...headers,
          "content-type": "application/json",
        },
        body: JSON.stringify({ date, entries }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(j?.error || "Save failed");
      }

      await loadSummary();
      setDirty(false);
      await reloadDateHints();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSaving(false);
    }
  }


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

  const loadDayValues = useCallback(async (day: string) => {
    setError(null);

    const headers = await getAuthHeaders();
    const res = await fetch(`/api/log?date=${encodeURIComponent(d)}`, {
      [headers]);
    });

    const rows: { metric_id: string; value: number | null }[] = await res.json();
    if (!res.ok) {
      setError((rows as any)?.error || "Failed to load day");
      return;
    }

    const valueMap = new Map<string, number | null>();
    for (const r of rows) {
      valueMap.set(r.metric_id, r.value);
    }

    const next: Record<string, string> = {};

    for (const def of metrics) {
      const existing = valueMap.get(def.metric_id);

      if (def.type === "checkbox") {
        if (existing != null) {
          next[def.metric_id] = existing >= 0.5 ? "on" : "";
        } else if (def.default_value != null) {
          next[def.metric_id] =
            def.default_value >= 0.5 ? "on" : "";
        } else {
          next[def.metric_id] = "";
        }
      } else if (def.type === "hhmm") {
        if (existing != null) {
          next[def.metric_id] = formatHHMM(existing);
        } else if (def.default_value != null) {
          next[def.metric_id] = formatHHMM(def.default_value);
        } else {
          next[def.metric_id] = "";
        }
      } else {
        if (existing != null) {
          next[def.metric_id] = String(existing);
        } else if (def.default_value != null) {
          next[def.metric_id] = String(def.default_value);
        } else {
          next[def.metric_id] = "";
        }
      }
    }

    setVals(next);
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
    setShowHeadsUp(false); // user navigated -> hide global heads up
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
    <main className="p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Daily Tracker v2</h1>

      <div className="space-y-2">
        <label className="block text-sm">Date</label>
        <input
          className="border p-2 rounded w-full"
          type="date"
          value={date}
          max={todayISO} // prevents from selecting future dates
          onChange={handleDateChange}
        />
        {dateHints && showHeadsUp && jumpedFromHints && (
          <div style={{
                marginTop: 4,
                display: "inline-block",
                padding: "2px 6px",
                fontSize: "0.75rem",
                borderRadius: 4,
                backgroundColor: "#FEF9C3",
                border: "1px solid #FACC15",
                color: "#78350F",
              }}
            >
            <strong>Heads up</strong>
            <div style={{ marginTop: 2 }}>
              We’ve jumped you to {jumpedFromHints}.
            </div>
            {dateHints.last_required_complete_date && (
              <div style={{ marginTop: 2 }}>
                Required metrics were last fully completed on {dateHints.last_required_complete_date}.
              </div>
            )}
          </div>
        )}


        {gapMessage && (
          <div
            style={{
              marginTop: 4,
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

      </div>

      {dateHints &&
        missingRequiredDaysClient > 0 &&
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
              {missingRequiredDaysClient} missing day
              {missingRequiredDaysClient === 1 ? "" : "s"} between then and
              today. We’ve jumped you to {dateHints.suggested_date}.
            </div>
          </div>
        )}

      {metrics.length === 0 ? (
        <div>{error ? `Error: ${error}` : "Loading metrics…"}</div>
      ) : (
        <div>
          {groupedMetrics.map((group) => {
            const isCollapsed = collapsedGroups[group.groupName] ?? false;

            return (
              <section
                key={group.groupName}
                style={{
                  marginTop: 16,
                  borderRadius: 4,
                  border: "1px solid #e5e7eb",        // light gray border
                  padding: 0,
                  overflow: "hidden",
                  maxWidth: 480,                       // match your input width-ish
                }}
              >
                {/* Group header bar */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.groupName)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 8px",
                    backgroundColor: "#FEF9C3",        // soft yellow
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  <span>{group.groupName}</span>
                  <span style={{ fontSize: "0.8rem" }}>
                    {isCollapsed ? "▸" : "▾"}
                  </span>
                </button>

                {/* Group body */}
                {!isCollapsed && (
                  <div style={{ padding: "6px 8px" }}>
                    {group.items.map((m) => {
                      const isCalculated = m.is_calculated;

                      const calcValue = isCalculated ? calculatedValues[m.metric_id] : null;

                      // current raw value + error for this metric
                      const raw = vals[m.metric_id] ?? "";
                      const err = fieldErrors[m.metric_id] ?? null;

                      let calcDisplay: string | null = null;
                      if (isCalculated) {
                        if (calcValue == null) {
                          calcDisplay = "—"; // waiting for inputs / invalid
                        } else {
                          calcDisplay = String(calcValue);
                        }
                      }

                      return (
                        <div key={m.metric_id} style={{ marginBottom: 8 }}>
                          {/* LABEL */}
                          <label style={{ display: "block", fontWeight: 500 }}>
                            {m.metric_name}
                            {m.required && !isCalculated && (
                              <span style={{ marginLeft: 4, fontSize: "0.7rem" }}>*required</span>
                            )}
                            {isCalculated && (
                              <span
                                style={{
                                  marginLeft: 4,
                                  fontSize: "0.7rem",
                                  opacity: 0.7,
                                }}
                              >
                                calc
                              </span>
                            )}
                          </label>

                          {isCalculated ? (
                            <div
                              style={{
                                marginTop: 2,
                                padding: "2px 4px",
                                border: "1px solid #ddd",
                                background: "#f5f5f5",
                                minHeight: 22,
                                display: "flex",
                                alignItems: "center",
                              }}
                            >
                              {calcDisplay}
                            </div>
                          ) : m.type === "checkbox" ? (
                            <>
                              <input
                                type="checkbox"
                                checked={raw === "on"}
                                onChange={(e) => {
                                  const v = e.target.checked ? "on" : "";
                                  setVal(m.metric_id, v);
                                  setDirty(true);
                                  setFieldErrors((prev) => ({
                                    ...prev,
                                    [m.metric_id]: null,
                                  }));
                                }}
                              />
                              {err && <div style={errorBoxStyle}>{err}</div>}
                            </>
                          ) : (
                            <div>
                              <input
                                value={raw}
                                onChange={(e) => {
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
                                style={err ? errorInputStyle : undefined}
                              />

                              {parsePresets(m).length > 0 && (
                                <div
                                  style={{
                                    marginTop: 4,
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 4,
                                  }}
                                >
                                  {parsePresets(m).map((p) => (
                                    <button
                                      key={p}
                                      type="button"
                                      onClick={() => applyPresetValue(m, p)}
                                      style={{
                                        padding: "2px 6px",
                                        borderRadius: 4,
                                        border: "1px solid #ccc",
                                        fontSize: "0.75rem",
                                        cursor: "pointer",
                                        background:
                                          String(p) === String(raw) ? "#FFE9A3" : "#f9fafb",
                                      }}
                                    >
                                      {p}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {err && <div style={errorBoxStyle}>{err}</div>}
                            </div>
                          )}
                        </div>
                      );
                    })}

                  </div>
                )}
              </section>
            );
          })}

        </div>
      )}


      
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || metrics.length === 0}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Day"}
        </button>

        <button
          onClick={loadSummary}
          className="px-4 py-2 rounded border"
        >
          Refresh 7-day Summary
        </button>

        {dirty && (
          <span className="text-xs text-red-600">
            Unsaved changes
          </span>
        )}
      </div>

      {error && <div className="text-red-600 text-sm">Error: {error}</div>}

      <div className="border rounded p-3">
        <div className="font-medium mb-2">7-day Summary</div>
        {!summary ? (
          <div className="text-sm text-gray-600">Click “Refresh 7-day Summary”.</div>
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
  );
}
