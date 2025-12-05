"use client";
import { useEffect, useState } from "react";
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

// function daysBetween(a: string, b: string): number {
//   // a and b are "YYYY-MM-DD"
//   const da = new Date(a + "T00:00:00");
//   const db = new Date(b + "T00:00:00");
//   const ms = db.getTime() - da.getTime();
//   return Math.round(ms / 86400000); // 1000 * 60 * 60 * 24
// }



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
  const [initialDateLoaded, setInitialDateLoaded] = useState(false);
  const [metrics, setMetrics] = useState<ConfigRow[]>([]);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState<any[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});

  const [dateHints, setDateHints] = useState<DateHints | null>(null);
  const [dateInitializedFromHints, setDateInitializedFromHints] = useState(false);

  const hasRequired = metrics.some((m) => m.required);

  const [showHeadsUp, setShowHeadsUp] = useState(true);
  const [hasShownHeadsUp, setHasShownHeadsUp] = useState(false);


  // function computeGapMessage(
  //   currentDate: string,
  //   lastRecordedDate: string | null,
  //   todayISO: string
  // ): string | null {
  //   if (!currentDate || !lastRecordedDate) return null;

  //   // 1) Don’t warn for today or future dates
  //   if (currentDate >= todayISO) return null;

  //   // 2) Don’t warn if you’re on/before the last recorded day
  //   if (currentDate <= lastRecordedDate) return null;

  //   // 3) How many days strictly *between* lastRecordedDate and currentDate?
  //   const daysBetween = (d1: string, d2: string) => {
  //     const t1 = Date.parse(d1);
  //     const t2 = Date.parse(d2);
  //     if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 0;
  //     // pure difference in days (no +1 here)
  //     return Math.round((t2 - t1) / 86400000);
  //   };

  //   const diff = daysBetween(lastRecordedDate, currentDate);
  //   // Example: last = 2025-12-03, current = 2025-12-04 -> diff = 1
  //   const missing = diff - 1;

  //   if (missing <= 0) return null;

  //   if (missing === 1) {
  //     return `There is 1 day between your last recorded day (${lastRecordedDate}) and this date.`;
  //   }

  //   return `There are ${missing} days between your last recorded day (${lastRecordedDate}) and this date.`;
  // }
  
  // helper near the top of the component (outside gapMessage):
const daysBetween = (d1: string, d2: string) => {
  const t1 = Date.parse(d1);
  const t2 = Date.parse(d2);
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 0;
  // difference in whole days
  return Math.floor((t2 - t1) / 86400000);
};

const gapMessage = (() => {
  if (!hasRequired) return null;
  if (!dateHints) return null;

  // Prefer last_log_date; fall back to last_required_complete_date
  const anchor =
    dateHints.last_log_date || dateHints.last_required_complete_date;

  if (!anchor) return null;

  // Only warn when the chosen date is AFTER the anchor
  if (date <= anchor) return null;

  // We want whole days *between* anchor and selected date
  const diffDays = daysBetween(anchor, date);
  const missingWholeDays = diffDays - 1;

  // Example:
  // anchor=2025-12-03, date=2025-12-04
  // diffDays=1 => missingWholeDays=0 => no banner
  if (missingWholeDays <= 0) return null;

  return `There ${missingWholeDays === 1 ? "is" : "are"} ${missingWholeDays} missing day${
    missingWholeDays === 1 ? "" : "s"
  } between your last recorded day (${anchor}) and this date.`;
})();


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

  useEffect(() => {
    // Don’t do anything until auth is known
    if (!authChecked) return;

    // Need hints from the server
    if (!dateHints) return;

    // Only auto-set the date once per page load
    if (dateInitializedFromHints) return;

    const nextDate = dateHints.suggested_date || dateHints.today;
    if (nextDate) {
      setDate(nextDate);
    }

    setDateInitializedFromHints(true);
  }, [authChecked, dateHints, dateInitializedFromHints, setDate]);



  useEffect(() => {
    async function initDate() {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/date_hints", { headers });
        const j = await res.json().catch(() => null);

        if (!res.ok || !j?.suggested_date) {
          // fallback to local today
          const now = new Date();
          const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
          const todayISO = local.toISOString().slice(0, 10);
          setDate(todayISO);
        } else {
          setDate(j.suggested_date);
        }
      } catch {
        const now = new Date();
        const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        const todayISO = local.toISOString().slice(0, 10);
        setDate(todayISO);
      } finally {
        setInitialDateLoaded(true);
      }
    }

    initDate();
  }, []);


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
        }));

        const visible = normalized.filter(
          (r) => !r.private && r.active
        );

        setMetrics(visible);
      } catch (e: any) {
        setError(String(e?.message || e));
      }
    })();
  }, []);

  // useEffect(() => {
  //   // Only run once, after auth + metrics are ready
  //   if (!authChecked) return;
  //   if (metrics.length === 0) return;
  //   if (dateInitializedFromHints) return;

  //   (async () => {
  //     try {
  //       const headers = await getAuthHeaders();
  //       const res = await fetch("/api/date_hints", { headers });

  //       const ct = res.headers.get("content-type") || "";
  //       if (!ct.includes("application/json")) {
  //         // Non-JSON (e.g., HTML dev error page) – just bail quietly
  //         // If we ever need to debug again, we can temporarily log here.
  //         return;
  //       }

  //       let j: any;
  //       try {
  //         j = await res.json();
  //       } catch {
  //         // JSON parse failed – bail quietly
  //         return;
  //       }

  //       if (!res.ok || j?.error) {
  //         // API returned an error payload – also bail quietly
  //         return;
  //       }

  //       const hints = j as DateHints;
  //       setDateHints(hints);

  //       if (!dateInitializedFromHints && hints.suggested_date) {
  //         setDate(hints.suggested_date);
  //       }
  //       setDateInitializedFromHints(true);
  //     } catch (e) {
  //       console.error("date_hints fetch failed:", e);
  //     }
  //   })();
  // }, [authChecked, metrics.length, dateInitializedFromHints]);

  useEffect(() => {
    if (!authChecked) return;
    reloadDateHints();
  }, [authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    if (!dateHints) return;
    if (dateInitializedFromHints) return;

    // Pick initial date: suggested_date if present, otherwise 'today'
    const initial = dateHints.suggested_date || dateHints.today;
    if (initial) {
      setDate(initial);
    }
    setDateInitializedFromHints(true);
  }, [authChecked, dateHints, dateInitializedFromHints]);



  // Initial load of the date's data
  useEffect(() => {
    if (!authChecked) return;
    if (!initialDateLoaded) return;
    if (!date) return;
    if (metrics.length === 0) return;

    loadDayValues(date);
  }, [authChecked, initialDateLoaded, date, metrics]);

  useEffect(() => {
    if (!dateHints) {
      setShowHeadsUp(false);
      return;
    }

    // If we've already shown it once this page load, never show again
    if (hasShownHeadsUp) return;

    const initial = dateHints.suggested_date || dateHints.today;

    if (
      dateHints.missing_required_days > 0 &&
      date === initial
    ) {
      setShowHeadsUp(true);
      setHasShownHeadsUp(true); // lock it so it won't turn back on later
    }
  }, [dateHints, date, hasShownHeadsUp]);



  // const gapMessage = (() => {
  //   if (!dateHints) return null;

  //   const anchor =
  //     dateHints.last_log_date || dateHints.last_required_complete_date;
  //   if (!anchor) return null;

  //   return computeGapMessage(date, anchor, dateHints.today);
  // })();
  
  //const setVal = (id: string, v: string) => setVals(s => ({ ...s, [id]: v }));

  //mark the form dirty if any changes were made
  const setVal = (id: string, v: string) => {
    setVals(s => ({ ...s, [id]: v }));
    setDirty(true);
  };

  function buildEntries(metrics: ConfigRow[], vals: Record<string, any>) {
    const result: { metric_id: string; value: number | null }[] = [];

    for (const m of metrics) {
      const raw = vals[m.metric_id];

      if (m.type === "checkbox") {
        // Always log 0/1 for visible checkbox metrics
        const v =
          raw === 1 ||
          raw === "1" ||
          raw === true ||
          raw === "true"
            ? 1
            : 0;
        result.push({ metric_id: m.metric_id, value: v });
      } else {
        // numeric / integer / time
        if (raw === "" || raw == null) {
          // user left it blank → no row
          continue;
        }
        const num = typeof raw === "number" ? raw : parseFloat(String(raw));
        if (Number.isNaN(num)) continue;
        result.push({ metric_id: m.metric_id, value: num });
      }
    }

    return result;
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

  function validateNumeric(m: ConfigRow, num: number): string | null {
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
        .filter((s) => s !== "")
        .map(Number)
        .filter((n) => Number.isFinite(n));

      if (banned.includes(num)) {
        return `${m.metric_name}: ${num} is not an allowed value`;
      }
    }
    return null;
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

        // We don't do numeric validation for checkboxes
        if (m.type === "checkbox") {
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
          if (!m.required) continue;

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
      const entries = metrics.map((m) => {
        const raw = vals[m.metric_id] ?? "";
        let value: number | null = null;

        if (m.type === "checkbox") {
          // Checkbox: checked => 1, otherwise 0
          value = raw ? 1 : 0;
        } else {
          // number / time / hhmm: blank => null (delete), otherwise parse
          if (raw !== "") {
            const num = Number(raw);
            value = Number.isFinite(num) ? num : null;
          } else {
            value = null; // signals delete
          }
        }

        return { metric_id: m.metric_id, value };
      });

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
    } catch (e: any) {
      setError(String(e?.message || e));
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

  async function loadDayValues(d: string) {
    setError(null);

    const headers = await getAuthHeaders();
    const res = await fetch(`/api/log?date=${encodeURIComponent(d)}`, {
      headers,
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
        {dateHints && dateHints.required_days_possible > 0 && (
          <div className="mt-1 text-xs text-gray-600">
            Required days completed:{" "}
            <span className="font-mono">
              {dateHints.required_days_completed} / {dateHints.required_days_possible}
            </span>{" "}
            (
            {Math.round(
              (dateHints.required_days_completed / dateHints.required_days_possible) *
                100
            )}
            %)
            {dateHints.last_required_complete_date && (
              <>
                {" "}
                since{" "}
                <span className="font-mono">
                  {dateHints.last_required_complete_date}
                </span>
              </>
            )}
          </div>
        )}

        {hasRequired && gapMessage && (
          <div //className="mt-1 inline-block rounded border border-yellow-400 bg-yellow-100 px-2 py-1 text-xs text-yellow-900">
            style={{
              marginTop: 4,
              display: "inline-block",
              padding: "2px 6px",
              fontSize: "0.75rem",
              borderRadius: 4,
              backgroundColor: "#FEF9C3", // light yellow
              border: "1px solid #FACC15", // amber border
              color: "#78350F", // dark amber text
            }}
          >
            {gapMessage}
          </div>
        )}
      </div>

      {hasRequired &&
        dateHints &&
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
              {dateHints.last_required_complete_date}.{" "}
              There may be{" "}
              {dateHints.missing_required_days} missing day
              {dateHints.missing_required_days === 1 ? "" : "s"}{" "}
              between then and today. We’ve jumped you to{" "}
              {dateHints.suggested_date}.
            </div>
          </div>
        )}




      {metrics.length === 0 ? (
        <div className="text-sm text-gray-600">
          {error ? `Error: ${error}` : "Loading metrics…"}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {metrics.map((m) => {
            const raw = vals[m.metric_id] ?? "";
            const err = fieldErrors[m.metric_id] ?? null;

            return (
              <div key={m.metric_id} className="border rounded p-3">
                <label className="block text-sm mb-1">
                  {m.metric_name || m.metric_id}
                  {m.group ? (
                    <span className="ml-2 text-xs text-gray-500">[{m.group}]</span>
                  ) : null}
                </label>

                {m.type === "checkbox" ? (
                  <div>
                    <input
                      type="checkbox"
                      checked={raw === "on"}
                      onChange={(e) => {
                        const v = e.target.checked ? "on" : "";
                        setVal(m.metric_id, v);
                        setDirty(true);
                        // clear any old error for this field
                        setFieldErrors((prev) => ({ ...prev, [m.metric_id]: null }));
                      }}
                    />
                    {err && (
                      <div style={errorBoxStyle}>
                        {err}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <input
                      className="border p-2 rounded w-full"
                      style={err ? errorInputStyle : undefined}
                      placeholder={
                        m.type === "hhmm"
                          ? "HH:MM"
                          : m.type === "time"
                          ? "minutes"
                          : ""
                      }
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
                    />
                    {err && (
                      <div style={errorBoxStyle}>
                        {err}
                      </div>
                    )}
                  </div>
                )}
              </div>
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
