"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

// ---------------------------
// Types
// ---------------------------
type MetricType = "checkbox" | "number" | "time" | "hhmm";

type ConfigRow = {
  metric_id: string;
  metric_name: string;
  type: MetricType;
  private: boolean;
  active: boolean;

  required: boolean;
  required_since: string | null;

  default_value: number | null;
  min_value: number | null;
  max_value: number | null;
  disallowed_values: string | null;

  group: string | null;
  group_order: number | null;
  metric_order: number | null;

  // presets
  preset_values_csv?: string | null;

  // calculated
  is_calculated?: boolean | null;
  calc_expr?: string | null;
};

type DateHints = {
  today: string; // YYYY-MM-DD
  last_log_date: string | null;
  last_required_complete_date: string | null;
  suggested_date: string | null;
  missing_required_days: number;
  required_days_completed: number;
  required_days_possible: number;
};

type LogRow = { metric_id: string; value: number | null };

type SummaryRow = {
  metric_id: string;
  type: MetricType;
  n_rows?: number | null;
  sum_7d?: number | null;
  count_true_7d?: number | null;
  avg_7d?: number | null;
};

// ---------------------------
// Small helpers
// ---------------------------
function isoTodayLocal(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenISO(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.floor((db - da) / 86_400_000);
}

function formatHHMM(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseHHMM(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function parseNumberLike(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDisallowedSet(csv: string | null): Set<number> {
  if (!csv) return new Set();
  const out = new Set<number>();
  for (const part of csv.split(",")) {
    const n = Number(part.trim());
    if (Number.isFinite(n)) out.add(n);
  }
  return out;
}

function validateField(m: ConfigRow, raw: string): string | null {
  // checkboxes are special; we treat as valid
  if (m.type === "checkbox") return null;

  let n: number | null;
  if (m.type === "hhmm") {
    n = parseHHMM(raw);
    if (raw.trim() !== "" && n == null) return "Use HH:MM (00:00–23:59).";
  } else {
    n = parseNumberLike(raw);
    if (raw.trim() !== "" && n == null) return "Enter a valid number.";
  }

  // empty is allowed unless required (required logic handled elsewhere)
  if (raw.trim() === "") return null;
  if (n == null) return "Invalid value.";

  if (m.min_value != null && n < m.min_value) return `Min ${m.min_value}`;
  if (m.max_value != null && n > m.max_value) return `Max ${m.max_value}`;

  const disallowed = parseDisallowedSet(m.disallowed_values);
  if (disallowed.has(n)) return "Value not allowed.";

  return null;
}

function parsePresets(metric: ConfigRow): number[] {
  const raw = metric.preset_values_csv ?? null;
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
}

// ---------------------------
// Expression evaluator (tokenize -> RPN -> eval)
// supports: numbers, identifiers (metric_id), + - * / and parentheses
// ---------------------------
type NumericContext = Record<string, number | null>;

type TokNumber = { kind: "number"; value: number };
type TokIdent = { kind: "ident"; name: string };
type TokOp = { kind: "op"; op: "+" | "-" | "*" | "/" };
type TokParen = { kind: "paren"; value: "(" | ")" };
type Token = TokNumber | TokIdent | TokOp | TokParen;

function tokenizeExpr(input: string): Token[] | null {
  const s = input.trim();
  if (!s) return null;

  const out: Token[] = [];
  let i = 0;

  const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
  const isIdent = (c: string) => /[A-Za-z0-9_]/.test(c);

  while (i < s.length) {
    const c = s[i];

    if (c === " " || c === "\t" || c === "\n") {
      i++;
      continue;
    }

    if (c === "(" || c === ")") {
      out.push({ kind: "paren", value: c });
      i++;
      continue;
    }

    if (c === "+" || c === "-" || c === "*" || c === "/") {
      out.push({ kind: "op", op: c });
      i++;
      continue;
    }

    // number
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const raw = s.slice(i, j);
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      out.push({ kind: "number", value: n });
      i = j;
      continue;
    }

    // identifier (metric_id)
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < s.length && isIdent(s[j])) j++;
      const name = s.slice(i, j);
      out.push({ kind: "ident", name });
      i = j;
      continue;
    }

    return null;
  }

  return out;
}

function precedence(op: TokOp["op"]): number {
  return op === "*" || op === "/" ? 2 : 1;
}

type RpnToken = TokNumber | TokIdent | TokOp;

function toRpn(tokens: Token[]): RpnToken[] | null {
  const output: RpnToken[] = [];
  const ops: Array<TokOp["op"] | "("> = [];

  for (const t of tokens) {
    if (t.kind === "number" || t.kind === "ident") {
      output.push(t);
      continue;
    }

    if (t.kind === "op") {
      while (ops.length > 0) {
        const top = ops[ops.length - 1];
        if (top === "(") break;
        if (precedence(top) >= precedence(t.op)) {
          ops.pop();
          output.push({ kind: "op", op: top });
        } else break;
      }
      ops.push(t.op);
      continue;
    }

    // parens
    if (t.kind === "paren" && t.value === "(") {
      ops.push("(");
      continue;
    }
    if (t.kind === "paren" && t.value === ")") {
      let found = false;
      while (ops.length > 0) {
        const top = ops.pop()!;
        if (top === "(") {
          found = true;
          break;
        }
        output.push({ kind: "op", op: top });
      }
      if (!found) return null;
      continue;
    }
  }

  while (ops.length > 0) {
    const top = ops.pop()!;
    if (top === "(") return null;
    output.push({ kind: "op", op: top });
  }

  return output;
}

function evalRpn(rpn: RpnToken[], ctx: NumericContext): number | null {
  const stack: number[] = [];

  for (const t of rpn) {
    if (t.kind === "number") {
      stack.push(t.value);
      continue;
    }
    if (t.kind === "ident") {
      const v = ctx[t.name];
      if (v == null) return null;
      stack.push(v);
      continue;
    }

    // op
    if (stack.length < 2) return null;
    const b = stack.pop()!;
    const a = stack.pop()!;
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

  if (stack.length !== 1) return null;
  return stack[0];
}

function evalCalcExpr(expr: string, ctx: NumericContext): number | null {
  const tokens = tokenizeExpr(expr);
  if (!tokens) return null;
  const rpn = toRpn(tokens);
  if (!rpn) return null;
  return evalRpn(rpn, ctx);
}

function buildNumericContext(metrics: ConfigRow[], vals: Record<string, string>): NumericContext {
  const ctx: NumericContext = {};
  for (const m of metrics) {
    const raw = vals[m.metric_id] ?? "";

    // checkbox: treat "on" as 1, otherwise null
    if (m.type === "checkbox") {
      ctx[m.metric_id] = raw ? 1 : 0;
      continue;
    }

    // hhmm -> minutes
    if (m.type === "hhmm") {
      ctx[m.metric_id] = raw.trim() ? parseHHMM(raw) : null;
      continue;
    }

    // number/time
    ctx[m.metric_id] = raw.trim() ? parseNumberLike(raw) : null;
  }
  return ctx;
}

function sortMetricsForForm(rows: ConfigRow[]): ConfigRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    const ga = a.group_order ?? 0;
    const gb = b.group_order ?? 0;
    if (ga !== gb) return ga - gb;

    const na = (a.group ?? "").toLowerCase();
    const nb = (b.group ?? "").toLowerCase();
    if (na !== nb) return na.localeCompare(nb);

    const oa = a.metric_order ?? 0;
    const ob = b.metric_order ?? 0;
    if (oa !== ob) return oa - ob;

    return a.metric_name.localeCompare(b.metric_name);
  });
  return copy;
}

type GroupBucket = { groupName: string; items: ConfigRow[] };

function groupMetrics(metrics: ConfigRow[]): GroupBucket[] {
  const map = new Map<string, ConfigRow[]>();
  for (const m of metrics) {
    const name = m.group?.trim() || "Ungrouped";
    if (!map.has(name)) map.set(name, []);
    map.get(name)!.push(m);
  }
  return Array.from(map.entries()).map(([groupName, items]) => ({
    groupName,
    items,
  }));
}

// ---------------------------
// Component
// ---------------------------
export default function Home() {
  const todayISO = isoTodayLocal();

  const [authChecked, setAuthChecked] = useState(false);

  const [date, setDate] = useState(todayISO);
  const [metrics, setMetrics] = useState<ConfigRow[]>([]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dateHints, setDateHints] = useState<DateHints | null>(null);
  const [dateInitializedFromHints, setDateInitializedFromHints] = useState(false);
  const [showHeadsUp, setShowHeadsUp] = useState(false);

  const [summary, setSummary] = useState<SummaryRow[] | null>(null);

  // Collapsible groups
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = useCallback((groupName: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupName]: !(prev[groupName] ?? false) }));
  }, []);

  // --------- numeric context + calculated values ---------
  const numericContext = useMemo(() => buildNumericContext(metrics, vals), [metrics, vals]);

  const calculatedValues = useMemo<Record<string, number | null>>(() => {
    const result: Record<string, number | null> = {};
    for (const m of metrics) {
      if (!m.is_calculated || !m.calc_expr?.trim()) {
        result[m.metric_id] = null;
        continue;
      }
      result[m.metric_id] = evalCalcExpr(m.calc_expr, numericContext);
    }
    return result;
  }, [metrics, numericContext]);

  // --------- API loaders ---------
  const loadConfig = useCallback(async () => {
    setError(null);

    const headers = await getAuthHeaders();
    const res = await fetch("/api/config", { headers });
    const data: unknown = await res.json();

    if (!res.ok) {
      const msg =
        typeof data === "object" && data !== null && "error" in data
          ? String((data as { error?: unknown }).error ?? "Failed to load config")
          : "Failed to load config";
      setError(msg);
      return;
    }

    const rows = data as ConfigRow[];
    const visible = rows.filter((r) => !r.private && r.active);
    setMetrics(sortMetricsForForm(visible));
  }, []);

  const reloadDateHints = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/date_hints", { headers });
      const data: unknown = await res.json();

      if (!res.ok) return;
      if (typeof data !== "object" || data == null) return;

      setDateHints(data as DateHints);
    } catch {
      // ignore
    }
  }, []);

  const loadDayValues = useCallback(
    async (d: string) => {
      setError(null);

      const headers = await getAuthHeaders();
      const res = await fetch(`/api/log?date=${encodeURIComponent(d)}`, { headers });
      const data: unknown = await res.json();

      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: unknown }).error ?? "Failed to load day")
            : "Failed to load day";
        setError(msg);
        return;
      }

      const rows = data as LogRow[];
      const valueMap = new Map<string, number | null>();
      for (const r of rows) valueMap.set(r.metric_id, r.value);

      const next: Record<string, string> = {};
      for (const def of metrics) {
        const existing = valueMap.get(def.metric_id);

        if (def.type === "checkbox") {
          if (existing != null) next[def.metric_id] = existing >= 0.5 ? "on" : "";
          else if (def.default_value != null) next[def.metric_id] = def.default_value >= 0.5 ? "on" : "";
          else next[def.metric_id] = "";
        } else if (def.type === "hhmm") {
          if (existing != null) next[def.metric_id] = formatHHMM(existing);
          else if (def.default_value != null) next[def.metric_id] = formatHHMM(def.default_value);
          else next[def.metric_id] = "";
        } else {
          if (existing != null) next[def.metric_id] = String(existing);
          else if (def.default_value != null) next[def.metric_id] = String(def.default_value);
          else next[def.metric_id] = "";
        }
      }

      setVals(next);
      setFieldErrors({});
      setDirty(false);
    },
    [metrics]
  );

  // --------- initial bootstrap ---------
  useEffect(() => {
    (async () => {
      await loadConfig();
      await reloadDateHints();
      setAuthChecked(true);
    })();
  }, [loadConfig, reloadDateHints]);

  // initialize date from hints once
  useEffect(() => {
    if (!authChecked) return;
    if (dateInitializedFromHints) return;
    if (!dateHints) return;

    const suggested = dateHints.suggested_date ?? todayISO;
    const clamped = suggested > todayISO ? todayISO : suggested;

    setDate(clamped);
    setDateInitializedFromHints(true);

    // show heads up ONLY when we auto-jump and there are missing required days
    if ((dateHints.missing_required_days ?? 0) > 0) setShowHeadsUp(true);
  }, [authChecked, dateInitializedFromHints, dateHints, todayISO]);

  // whenever date changes (and metrics loaded), load values
  useEffect(() => {
    if (!authChecked) return;
    if (!date) return;
    if (metrics.length === 0) return;
    loadDayValues(date);
  }, [authChecked, date, metrics, loadDayValues]);

  // --------- messaging ---------
  const lastLogDate = dateHints?.last_log_date ?? null;

  const gapMessage = useMemo(() => {
    if (!lastLogDate) return null;
    if (date <= lastLogDate) return null;
    const gap = daysBetweenISO(lastLogDate, date);
    if (gap <= 0) return null;
    return `There ${gap === 1 ? "is" : "are"} ${gap} missing day${gap === 1 ? "" : "s"} between your last recorded day (${lastLogDate}) and this date.`;
  }, [date, lastLogDate]);

  // --------- group rendering ---------
  const groupedMetrics = useMemo(() => groupMetrics(metrics), [metrics]);

  // --------- UI handlers ---------
  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newDate = e.target.value;

    if (dirty) {
      const ok = window.confirm("You have unsaved changes.\nDiscard them and switch date?");
      if (!ok) {
        e.target.value = date;
        return;
      }
    }

    setDate(newDate);
    setShowHeadsUp(false); // user navigated => hide auto-jump heads up
  }

  function applyPresetValue(metric: ConfigRow, preset: number) {
    const raw = String(preset);
    const msg = validateField(metric, raw);

    setVals((prev) => ({ ...prev, [metric.metric_id]: raw }));
    setFieldErrors((prev) => ({ ...prev, [metric.metric_id]: msg }));
    setDirty(true);
  }

  async function refreshSummary() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/summary_7d", { headers });
      const data: unknown = await res.json();
      if (!res.ok) return;
      setSummary(data as SummaryRow[]);
    } catch {
      // ignore
    }
  }

  // ---------------------------
  // Render
  // ---------------------------
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
          max={todayISO}
          onChange={handleDateChange}
        />

        {dateHints && dateHints.required_days_possible > 0 && (
          <div className="mt-1 text-xs text-gray-600">
            Required days completed:{" "}
            <span className="font-mono">
              {dateHints.required_days_completed} / {dateHints.required_days_possible}
            </span>{" "}
            ({Math.round((dateHints.required_days_completed / dateHints.required_days_possible) * 100)}%)
            {dateHints.last_required_complete_date && (
              <>
                {" "}
                since <span className="font-mono">{dateHints.last_required_complete_date}</span>
              </>
            )}
          </div>
        )}

        {gapMessage && (
          <div className="mt-1 inline-block rounded border border-yellow-400 bg-yellow-100 px-2 py-1 text-xs text-yellow-900">
            {gapMessage}
          </div>
        )}
      </div>

      {dateHints && dateHints.missing_required_days > 0 && showHeadsUp && (
        <div className="rounded border border-yellow-400 bg-yellow-100 px-3 py-2 text-sm text-yellow-900">
          <strong>Heads up</strong>
          <div className="mt-1">
            Required metrics were last fully completed on{" "}
            <span className="font-mono">{dateHints.last_required_complete_date}</span>. There may be{" "}
            {dateHints.missing_required_days} missing day{dateHints.missing_required_days === 1 ? "" : "s"} between then and today.
            {dateHints.suggested_date && (
              <>
                {" "}
                We’ve jumped you to <span className="font-mono">{dateHints.suggested_date}</span>.
              </>
            )}
          </div>
        </div>
      )}

      {error && <div className="text-sm text-red-600">Error: {error}</div>}

      {/* Metrics */}
      {metrics.length === 0 ? (
        <div>Loading metrics…</div>
      ) : (
        <div>
          {groupedMetrics.map((group) => {
            const isCollapsed = collapsedGroups[group.groupName] ?? false;

            return (
              <section key={group.groupName} className="mt-4 overflow-hidden rounded border border-gray-200">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.groupName)}
                  className="flex w-full items-center justify-between bg-yellow-100 px-3 py-2 text-left text-sm font-semibold"
                >
                  <span>{group.groupName}</span>
                  <span className="text-xs">{isCollapsed ? "▸" : "▾"}</span>
                </button>

                {!isCollapsed && (
                  <div className="p-3 space-y-4">
                    {group.items.map((m) => {
                      const raw = vals[m.metric_id] ?? "";
                      const err = fieldErrors[m.metric_id] ?? null;

                      const isCalc = !!m.is_calculated;
                      const calcVal = calculatedValues[m.metric_id];

                      const presets = parsePresets(m);

                      return (
                        <div key={m.metric_id} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <label className="font-medium">{m.metric_name}</label>
                            {m.required && <span className="text-xs text-gray-500">*required</span>}
                            {isCalc && <span className="text-xs text-gray-500">(calculated)</span>}
                          </div>

                          {/* Input */}
                          {m.type === "checkbox" ? (
                            <input
                              type="checkbox"
                              checked={raw === "on"}
                              disabled={isCalc}
                              onChange={(e) => {
                                if (isCalc) return;
                                setVals((prev) => ({ ...prev, [m.metric_id]: e.target.checked ? "on" : "" }));
                                setDirty(true);
                              }}
                            />
                          ) : (
                            <input
                              className={`border p-2 rounded w-full ${isCalc ? "bg-gray-100" : ""} ${err ? "border-red-500" : ""}`}
                              value={isCalc ? (calcVal == null ? "" : m.type === "hhmm" ? formatHHMM(calcVal) : String(calcVal)) : raw}
                              disabled={isCalc}
                              onChange={(e) => {
                                if (isCalc) return;
                                const v = e.target.value;
                                const msg = validateField(m, v);
                                setVals((prev) => ({ ...prev, [m.metric_id]: v }));
                                setFieldErrors((prev) => ({ ...prev, [m.metric_id]: msg }));
                                setDirty(true);
                              }}
                            />
                          )}

                          {/* Error chip */}
                          {err && <div className="inline-block rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">{err}</div>}

                          {/* Presets */}
                          {!isCalc && presets.length > 0 && m.type !== "checkbox" && (
                            <div className="flex gap-2 flex-wrap">
                              {presets.map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  className="rounded border px-2 py-0.5 text-xs"
                                  onClick={() => applyPresetValue(m, p)}
                                >
                                  {p}
                                </button>
                              ))}
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

      {/* Summary */}
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
              {summary.map((row) => (
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

        <div className="mt-2 flex gap-2">
          <button className="border rounded px-2 py-1 text-sm" onClick={refreshSummary}>
            Refresh 7-day Summary
          </button>
        </div>
      </div>
    </main>
  );
}
