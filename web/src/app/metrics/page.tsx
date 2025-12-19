"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import React from "react";

type MetricType = "checkbox" | "number" | "time" | "hhmm";

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
};

type MetricDraft = {
  metric_id: string;
  metric_name: string;
  type: MetricType;
  private: boolean;
  active: boolean;
  show_ma: boolean;
  ma_periods_csv: string;
  // numeric-ish fields as strings in the form
  default_value: string;
  min_value: string;
  max_value: string;
  disallowed_values: string;
  start_date: string;
  required: boolean;
  required_since: string;
  group: string;              // empty string means “no group”
  metric_order: string;       // text input
  is_calculated: boolean;
  calc_expr: string;
};

type NewMetric = MetricDraft;

const emptyDraft: MetricDraft = {
  metric_id: "",
  metric_name: "",
  type: "number",
  private: false,
  active: true,
  show_ma: false,
  ma_periods_csv: "7,30,90",
  default_value: "",
  min_value: "",
  max_value: "",
  disallowed_values: "",
  start_date: "",
  required: false, 
  required_since: "",
  group: "",
  metric_order: "",
  is_calculated: false,
  calc_expr: "",
};

function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Turn a draft (all strings) into the shape the API/DB expects
function normalizeDraft(d: MetricDraft): {
  metric_id: string;
  metric_name: string;
  type: MetricType;
  private: boolean;
  active: boolean;
  show_ma: boolean;
  ma_periods_csv: string | null;
  start_date: string | null;
  default_value: number | null;
  min_value: number | null;
  max_value: number | null;
  disallowed_values: string | null;
  required: boolean;
  required_since: string | null;
  group: string | null;
  metric_order: number;   // ✅ keep as number
  is_calculated: boolean;
  calc_expr: string | null;
} {
  const toNum = (s: string): number | null => {
    if (!s.trim()) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const metricOrderStr = d.metric_order.trim();
  const parsedOrder = Number(metricOrderStr);

  // If blank or not a valid number, fall back to 0
  const metricOrder =
    !metricOrderStr || !Number.isFinite(parsedOrder)
      ? 0
      : parsedOrder;

  return {
    metric_id: d.metric_id.trim(),
    metric_name: d.metric_name.trim(),
    type: d.type,
    private: d.private,
    active: d.active,
    show_ma: d.show_ma,
    ma_periods_csv: d.ma_periods_csv || null,
    start_date: d.start_date.trim() || null,
    default_value: toNum(d.default_value),
    min_value: toNum(d.min_value),
    max_value: toNum(d.max_value),
    disallowed_values: d.disallowed_values.trim() || null,
    required: d.required,
    required_since: d.required
      ? d.required_since.trim() || new Date().toISOString().slice(0, 10)
      : null,
    group: d.group.trim() || null,

    // ✅ always a number
    metric_order: metricOrder,
    is_calculated: d.is_calculated,
    calc_expr: d.calc_expr.trim() || null,
  };
}


// hooks
export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [error, setError] = useState<string | null>(null);

  // editing existing metric
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<MetricDraft | null>(null);

  // adding new metric
  const [newMetric, setNewMetric] = useState<NewMetric | null>(null);

  // metric group names
  const groupNames = React.useMemo(() => {
    const names = new Set<string>();
    metrics.forEach((m) => {
      if (m.group) names.add(m.group);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [metrics]);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showPrivate, setShowPrivate] = useState(true);

  const visibleMetrics = React.useMemo(() => {
    return metrics.filter((m) => {
      if (!showArchived && !m.active) return false;
      if (!showPrivate && m.private) return false;
      return true;
    });
  }, [metrics, showArchived, showPrivate]);

  const newNameInputRef = useRef<HTMLInputElement | null>(null);
  const hasFocusedNewNameRef = useRef(false);

  // useEffect(() => {
  //   if (newMetric && newNameInputRef.current) {
  //     newNameInputRef.current.focus();
  //     newNameInputRef.current.select();
  //   }
  // }, [newMetric]);
  useEffect(() => {
    if (newMetric && !hasFocusedNewNameRef.current && newNameInputRef.current) {
      newNameInputRef.current.focus();
      newNameInputRef.current.select();
      hasFocusedNewNameRef.current = true;
    }

    // When the new metric row is closed (saved/canceled), reset the flag
    if (!newMetric) {
      hasFocusedNewNameRef.current = false;
    }
  }, [newMetric]);

  type GroupInfo = {
    name: string;        // raw name ("" = ungrouped)
    displayName: string; // what we show
    order: number;       // group_order (min for that group)
    count: number;       // metrics in this group
  };

  const groups = React.useMemo<GroupInfo[]>(() => {
    const map = new Map<string, GroupInfo>();

    metrics.forEach((m) => {
      const rawName = m.group ?? "";
      const key = rawName;
      const displayName = rawName || "Ungrouped";

      const current = map.get(key);
      const groupOrder =
        typeof m.group_order === "number" ? m.group_order : 0;

      if (!current) {
        map.set(key, {
          name: key,
          displayName,
          order: groupOrder,
          count: 1,
        });
      } else {
        current.count += 1;
        // use the smallest order as the representative
        if (groupOrder < current.order) {
          current.order = groupOrder;
        }
      }
    });

    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.displayName.localeCompare(b.displayName);
    });
    return arr;
  }, [metrics]);

  function sortMetrics(list: Metric[]): Metric[] {
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

      // 1) group_order (at the *group* level)
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


  const loadMetrics = useCallback(async () => {
    try {
      setError(null);

      const headers = await getAuthHeaders();
      const res = await fetch("/api/config", { headers });
      const data: unknown = await res.json();

      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as { error?: unknown }).error)
            : "Failed to load metrics";
        setError(msg);
        return;
      }

      const arr = Array.isArray(data) ? (data as any[]) : [];

      const normalized: Metric[] = arr.map((r) => ({
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
      }));

      setMetrics(sortMetrics(normalized));
    } catch (e) {
      setError(String((e as any)?.message ?? e));
    }
  }, [getAuthHeaders]);


  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);


  // --- edit existing metric ---

  function startEdit(m: Metric) {
    setEditing(m.metric_id);
    setError(null);
    setDraft({
      metric_id: m.metric_id,
      metric_name: m.metric_name,
      type: m.type,
      private: m.private,
      active: m.active,
      show_ma: m.show_ma,
      ma_periods_csv: m.ma_periods_csv ?? "",
      default_value: m.default_value != null ? String(m.default_value) : "",
      min_value: m.min_value != null ? String(m.min_value) : "",
      max_value: m.max_value != null ? String(m.max_value) : "",
      disallowed_values: m.disallowed_values ?? "",
      start_date: m.start_date ?? "",
      required: m.required,
      required_since: m.required_since ?? "",
      group: m.group ?? "",
      metric_order:
        m.metric_order != null ? String(m.metric_order) : "",
      is_calculated: m.is_calculated,
      calc_expr: m.calc_expr ?? "",
    });
  }

  function cancelEdit() {
    setEditing(null);
    setDraft(null);
  }

  function updateDraft<K extends keyof MetricDraft>(key: K, value: MetricDraft[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  




  // --- edit & save an existing metric ---------------------------------
  async function saveEdit() {
    if (!draft) return;
    setError(null);

    const current = draft; // narrowed

    const headers = await getAuthHeaders();
    const payload = normalizeDraft(current);

    const res = await fetch("/api/metrics", {
      method: "PATCH",
      headers: {
        ...headers,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload), // includes metric_id + fields
    });

    const j = await res.json().catch(() => null);
    if (!res.ok) {
      setError(j?.error || "Failed to update metric");
      return;
    }

    await loadMetrics();
    setEditing(null);
    setDraft(null);
  }


  // --- archive / unarchive via Active flag -----------------------------
  async function setActive(m: Metric, active: boolean) {
    setError(null);
    const headers = await getAuthHeaders();

    const res = await fetch("/api/metrics", {
      method: "PATCH",
      headers: {
        ...headers,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        metric_id: m.metric_id,
        active,
      }),
    });

    const j = await res.json().catch(() => null);
    if (!res.ok) {
      setError(j?.error || "Update failed");
      return;
    }

    await loadMetrics();
  }

  // move metrics up/down
  async function moveMetric(m: Metric, direction: "up" | "down") {
    setError(null);

    // Make sure Metric has `group` and `metric_order` fields in its type
    const groupKey = m.group ?? "";
    const currentOrder = m.metric_order ?? 0;

    // All metrics in the same group
    const groupMetrics = metrics.filter((x) => (x.group ?? "") === groupKey);

    if (groupMetrics.length <= 1) return;

    // Sort by current metric_order then metric_id
    groupMetrics.sort((a, b) => {
      const ao = a.metric_order ?? 0;
      const bo = b.metric_order ?? 0;
      if (ao !== bo) return ao - bo;
      return a.metric_id.localeCompare(b.metric_id);
    });

    const index = groupMetrics.findIndex(
      (x) => x.metric_id === m.metric_id
    );
    if (index === -1) return;

    const delta = direction === "up" ? -1 : 1;
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= groupMetrics.length) {
      return; // already at edge
    }

    // Reorder in memory
    const reordered = [...groupMetrics];
    const [removed] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, removed);

    // Reindex metric_order as 10,20,30...
    reordered.forEach((gm, idx) => {
      gm.metric_order = (idx + 1) * 10;
    });

    // Persist updates to API
    const headers = await getAuthHeaders();

    const updates = reordered.map((gm) =>
      fetch("/api/metrics", {
        method: "PATCH",
        headers: {
          ...headers,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          metric_id: gm.metric_id,
          metric_order: gm.metric_order,
        }),
      })
    );

    const results = await Promise.all(updates);
    const bad = results.find((r) => !r.ok);
    if (bad) {
      const j = await bad.json().catch(() => null);
      setError(j?.error || "Failed to reorder metrics");
      return;
    }

    // Reload to get fresh order from server
    await loadMetrics();
  }

  async function moveGroup(groupName: string, direction: "up" | "down") {
    setError(null);

    if (groups.length <= 1) return;

    const index = groups.findIndex((g) => g.name === groupName);
    if (index === -1) return;

    const delta = direction === "up" ? -1 : 1;
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= groups.length) return;

    // Reorder the groups array
    const reorderedGroups = [...groups];
    const [removed] = reorderedGroups.splice(index, 1);
    reorderedGroups.splice(targetIndex, 0, removed);

    // Assign new group_order values (10,20,30...)
    reorderedGroups.forEach((g, idx) => {
      g.order = (idx + 1) * 10;
    });

    // Build a map: groupName -> new group_order
    const orderByGroup = new Map<string, number>();
    reorderedGroups.forEach((g) => {
      orderByGroup.set(g.name, g.order);
    });

    // Prepare updates for all metrics
    const headers = await getAuthHeaders();

    const updates = metrics.map((m) =>
      fetch("/api/metrics", {
        method: "PATCH",
        headers: {
          ...headers,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          metric_id: m.metric_id,
          group_order: orderByGroup.get(m.group ?? "") ?? 0,
        }),
      })
    );

    const results = await Promise.all(updates);
    const bad = results.find((r) => !r.ok);
    if (bad) {
      const j = await bad.json().catch(() => null);
      setError(j?.error || "Failed to reorder groups");
      return;
    }

    // Reload metrics from server to get fresh group_order values
    await loadMetrics();
  }



  // --- add new metric ---

  function startAdd() {
    setError(null);
    setNewMetric({ ...emptyDraft });
  }

  function cancelAdd() {
    setNewMetric(null);
  }

  async function duplicateMetric(source: Metric) {
    setError(null);

    // If already adding or editing, you may want to block or clear
    if (newMetric) {
      const ok = window.confirm(
        "You already have a new metric in progress. Discard it and duplicate this one instead?"
      );
      if (!ok) return;
    }
    if (editing) {
      const ok = window.confirm(
        "You are editing a metric. Discard changes and duplicate this one instead?"
      );
      if (!ok) return;
      setEditing(null);
      setDraft(null);
    }

    // Compute default id / name
    const baseId = source.metric_id;
    const baseName = source.metric_name;

    const draftCopy: MetricDraft = {
      metric_id: `${baseId}_copy`,
      metric_name: `${baseName} copy`,
      type: source.type,
      private: source.private,
      active: source.active,
      show_ma: source.show_ma,
      ma_periods_csv: source.ma_periods_csv ?? "",
      default_value:
        source.default_value != null ? String(source.default_value) : "",
      min_value:
        source.min_value != null ? String(source.min_value) : "",
      max_value:
        source.max_value != null ? String(source.max_value) : "",
      disallowed_values: source.disallowed_values ?? "",
      start_date: source.start_date ?? "",
      required: source.required,
      required_since: source.required_since ?? "",
      group: source.group ?? "",
      metric_order:
        source.metric_order != null ? String(source.metric_order) : "",
      is_calculated: !!source.is_calculated,
      calc_expr: source.calc_expr ?? "",
    };

    setNewMetric(draftCopy);
  }

  // type ToggleFlag = "active" | "private" | "required";

  // async function toggleMetricFlag(metric: Metric, field: ToggleFlag) {
  //   try {
  //     setError(null);
  //     const headers = await getAuthHeaders();

  //     const current = (metric as any)[field] as boolean;
  //     const next = !current;

  //     const res = await fetch("/api/metrics", {
  //       method: "PATCH",
  //       headers: {
  //         ...headers,
  //         "content-type": "application/json",
  //       },
  //       body: JSON.stringify({
  //         metric_id: metric.metric_id,
  //         [field]: next,
  //       }),
  //     });

  //     if (!res.ok) {
  //       const j = await res.json().catch(() => null);
  //       setError(j?.error || `Failed to update ${field}`);
  //       return;
  //     }

  //     await loadMetrics();
  //   } catch (err) {
  //     console.error(err);
  //     setError(`Failed to update ${field}`);
  //   }
  // }
  async function updateMetricFlags(
    metric: Metric,
    changes: Partial<{ active: boolean; private: boolean; required: boolean }>
  ) {
    try {
      setError(null);
      const headers = await getAuthHeaders();

      const body = {
        metric_id: metric.metric_id,
        active:
          changes.active !== undefined ? changes.active : metric.active,
        private:
          changes.private !== undefined ? changes.private : metric.private,
        required:
          changes.required !== undefined ? changes.required : metric.required,
      };

      const res = await fetch("/api/metrics", {
        method: "PATCH",
        headers: {
          ...headers,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error || "Failed to update flags");
        return;
      }

      await loadMetrics();
    } catch (err) {
      console.error(err);
      setError("Failed to update flags");
    }
  }



  function updateNew<K extends keyof NewMetric>(field: K, value: NewMetric[K]) {
    setNewMetric((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function createMetric() {
    setError(null);

    const nm = newMetric;
    if (!nm) {
      setError("No metric draft to create");
      return;
    }

    if (!nm.metric_id.trim() || !nm.metric_name.trim()) {
      setError("metric_id and metric_name are required");
      return;
    }

    const headers = await getAuthHeaders();
    const payload = normalizeDraft(nm);

    const res = await fetch("/api/metrics", {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const j = await res.json().catch(() => null);
    if (!res.ok) {
      setError(j?.error || "Failed to create metric");
      return;
    }

    setNewMetric(null);
    await loadMetrics();
  }

  // generic helper for existing-row edits
  function updateExisting<K extends keyof MetricDraft>(field: K, value: MetricDraft[K]) {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Metrics</h1>

      <div style={{ margin: "8px 0" }}>
        <button
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
        >
          {showAdvanced ? "Hide advanced fields" : "Show advanced fields"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ fontSize: "0.8rem" }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />{" "}
          Show archived
        </label>
        <label style={{ fontSize: "0.8rem" }}>
          <input
            type="checkbox"
            checked={showPrivate}
            onChange={(e) => setShowPrivate(e.target.checked)}
          />{" "}
          Show private
        </label>
      </div>



      {error && (
        <div className="bg-red-200 text-red-900 p-2 rounded mb-4">{error}</div>
      )}

      <div className="mb-2 flex items-center gap-2">
        <button
          className="px-3 py-1 border rounded bg-white"
          onClick={startAdd}
          disabled={!!newMetric}
        >
          + Add Metric
        </button>
        <span className="text-xs text-gray-600">
          metric_id: letters/numbers/underscores, no spaces; cannot be changed
          later.
        </span>
      </div>

      <datalist id="metric-group-options">
        {groupNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {groups.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 4 }}>
            Groups
          </h2>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Group</th>
                <th style={{ textAlign: "right" }}>Metrics</th>
                <th>Reorder</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, idx) => (
                <tr key={g.name || "_ungrouped"}>
                  <td>{g.displayName}</td>
                  <td style={{ textAlign: "right" }}>{g.count}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => moveGroup(g.name, "up")}
                      disabled={idx === 0}
                      style={{ marginRight: 4 }}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => moveGroup(g.name, "down")}
                      disabled={idx === groups.length - 1}
                    >
                      ↓
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}


      <table className="w-full border mt-4">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2">ID</th>
            <th className="p-2">Name</th>
            <th className="p-2">Group</th> 
            <th className="p-2">Order</th>
            <th className="p-2">Type</th>
            <th className="p-2">Calculated</th>
            <th className="p-2">Formula</th>

            {showAdvanced && (
              <>
                <th title="If set, this value is pre-filled when logging a day.">
                  Default
                </th>
                <th title="Minimum allowable numeric value.">Min</th>
                <th title="Maximum allowable numeric value.">Max</th>
                <th title="Comma-separated forbidden values.">Disallowed</th>
              </>
            )}
            <th className="p-2">Private</th>
            <th className="p-2">Required</th>
            <th className="p-2">Active</th>
            {showAdvanced && (
              <>
                <th title="Include this metric in moving-average charts.">Show MA</th>
                <th title="Window sizes for MA charts, e.g., 7,30,90">MA Periods</th>
                <th title="Metric becomes visible starting from this date.">Start Date</th>
              </>
            )}
            <th className="p-2">Actions</th>
            
          </tr>
        </thead>
        <tbody>
          {/* New metric row */}
          {newMetric && (
            <tr className="border-t bg-green-50">
              {/* ID */}
              <td className="p-2 font-mono">
                <input
                  className="border p-1 w-full"
                  value={newMetric.metric_id}
                  onChange={(e) => updateNew("metric_id", e.target.value)}
                  placeholder="daily_score_2"
                />
              </td>

              {/* Name */}
              <td className="p-2">
                <input
                  ref={newNameInputRef}
                  value={newMetric.metric_name}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    setNewMetric((prev) => {
                      if (!prev) return prev;
                      const nextSlug = slugFromName(nextName);
                      const currentSlug = slugFromName(prev.metric_name);
                      const userOverrodeId =
                        prev.metric_id && prev.metric_id !== currentSlug;
                      return {
                        ...prev,
                        metric_name: nextName,
                        metric_id: userOverrodeId ? prev.metric_id : nextSlug,
                      };
                    });
                  }}
                  placeholder="Test Metric"
                />

              </td>

              {/* Group */}
              <td>
                <input
                  list="metric-group-options"
                  value={newMetric.group}
                  onChange={(e) => updateNew("group", e.target.value)}
                  placeholder="Daily / Health / ..."
                />
              </td>

              {/* Order */}
              <td>
                <input
                  type="number"
                  value={newMetric.metric_order}
                  onChange={(e) => updateNew("metric_order", e.target.value)}
                  style={{ width: 60 }}
                />
              </td>

              {/* Type */}
              <td className="p-2">
                <select
                  className="border p-1 w-full"
                  value={newMetric.type}
                  onChange={(e) =>
                    updateNew("type", e.target.value as MetricType)
                  }
                >
                  <option value="checkbox">checkbox</option>
                  <option value="number">number</option>
                  <option value="time">time</option>
                  <option value="hhmm">HH:MM (time of day)</option>
                </select>
              </td>

              {/* Calculated */}
              <td>
                <input
                  type="checkbox"
                  checked={newMetric.is_calculated}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    updateNew("is_calculated", checked);

                    if (checked) {
                      // Force type=number and required=false when making it calculated
                      updateNew("type", "number");
                      updateNew("required", false);
                    }
                  }}
                />
              </td>

              {/* Formula */}
              <td>
                <input
                  value={newMetric.calc_expr}
                  onChange={(e) => updateNew("calc_expr", e.target.value)}
                  placeholder="e.g. daily_score + sleep_score"
                  style={{ width: "100%" }}
                />
              </td>

              {/* Default / Min / Max / Disallowed */}
              {/* Advanced numeric fields */}
              {showAdvanced && (
                <>
                  <td>
                    <input
                      className="border p-1 w-full"
                      value={newMetric.default_value}
                      onChange={(e) => updateNew("default_value", e.target.value)}
                      placeholder="default"
                    />
                  </td>
                  <td>
                    <input
                      className="border p-1 w-full"
                      value={newMetric.min_value}
                      onChange={(e) => updateNew("min_value", e.target.value)}
                      placeholder="min"
                    />
                  </td>
                  <td>
                    <input
                      className="border p-1 w-full"
                      value={newMetric.max_value}
                      onChange={(e) => updateNew("max_value", e.target.value)}
                      placeholder="max"
                    />
                  </td>
                  <td>
                    <input
                      className="border p-1 w-full"
                      value={newMetric.disallowed_values}
                      onChange={(e) =>
                        updateNew("disallowed_values", e.target.value)
                      }
                      placeholder="comma-separated"
                    />
                  </td>
                </>
              )}

              {/* Private / Required / Active / Show MA */}
              <td className="p-2 text-center">
                <input
                  type="checkbox"
                  checked={newMetric.private}
                  onChange={(e) => updateNew("private", e.target.checked)}
                />
              </td>
              <td className="p-2 text-center">
                <input
                  type="checkbox"
                  checked={newMetric.required}
                  onChange={(e) => updateNew("required", e.target.checked)}
                />
              </td>
              <td className="p-2 text-center">
                <input
                  type="checkbox"
                  checked={newMetric.active}
                  onChange={(e) => updateNew("active", e.target.checked)}
                />
              </td>
              {/* Advanced MA + start date */}
              {showAdvanced && (
                <>
                  <td>
                    <input
                      type="checkbox"
                      checked={newMetric.show_ma}
                      onChange={(e) => updateNew("show_ma", e.target.checked)}
                    />
                  </td>
                  <td>
                    <input
                      value={newMetric.ma_periods_csv}
                      onChange={(e) =>
                        updateNew("ma_periods_csv", e.target.value)
                      }
                      placeholder="7,30,90"
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={newMetric.start_date}
                      onChange={(e) =>
                        updateNew("start_date", e.target.value)
                      }
                    />
                  </td>
                </>
              )}

              {/* Actions */}
              <td className="p-2 text-right">
                <button
                  className="px-2 py-1 border bg-green-200 mr-2"
                  onClick={createMetric}
                >
                  Save
                </button>
                <button
                  className="px-2 py-1 border bg-gray-200"
                  onClick={cancelAdd}
                >
                  Cancel
                </button>
              </td>
            </tr>
          )}

          {/* Existing metrics */}
          {visibleMetrics.map((m, idx) => {
            const isEditing = editing === m.metric_id;
            if (isEditing && !draft) {
              // should never happen, but keeps TS happy
              return null;
            }
            const d = isEditing ? draft : null;

            return (
              <tr
                key={m.metric_id}
                style={{
                  backgroundColor: idx % 2 === 0 ? "#ffffff" : "#b8dbfdff",
                }}
              >
                <td className="p-2 font-mono">{m.metric_id}</td>

                {/* Name */}
                <td className="p-2">
                  {isEditing && d ? (
                    <input
                      className="border p-1 w-full"
                      value={d.metric_name}
                      onChange={(e) =>
                        updateExisting("metric_name", e.target.value)
                      }
                    />
                  ) : (
                    m.metric_name
                  )}
                </td>

                {/* Group */}
                <td style={{ textAlign: "right" }}>
                  {isEditing && d ? (
                    <input
                      list="metric-group-options"
                      value={d.group}
                      onChange={(e) => updateExisting("group", e.target.value)}
                      placeholder="Daily / Health / ..."
                    />
                  ) : (
                    m.group || ""
                  )}
                </td>

                {/* Order */}
                <td style={{ textAlign: "right" }}>
                  {isEditing && d ? (
                    <input
                      type="number"
                      value={d.metric_order}
                      onChange={(e) =>
                        updateExisting("metric_order", e.target.value)
                      }
                      style={{ width: 60 }}
                    />
                  ) : (
                    m.metric_order ?? ""
                  )}
                </td>

                {/* Type (read-only) */}
                <td className="p-2 text-sm text-gray-600">{m.type}</td>

                {/* NEW: Calculated column */}
                <td style={{ textAlign: "center" }}>
                  {isEditing && d ? (
                    <input
                      type="checkbox"
                      checked={d.is_calculated}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        updateExisting("is_calculated", checked);

                        if (checked) {
                          // force numeric + not-required when making it calculated
                          updateExisting("type", "number" as any);
                          updateExisting("required", false as any);
                        }
                      }}
                    />
                  ) : (
                    (m.is_calculated && "✓") || ""
                  )}
                </td>

                {/* NEW: Formula column */}
                <td style={{ textAlign: "center" }}>
                  {isEditing && d ? (
                    <input
                      value={d.calc_expr}
                      onChange={(e) =>
                        updateExisting("calc_expr", e.target.value)
                      }
                      placeholder="e.g. daily_score + sleep_score"
                    />
                  ) : (
                    m.calc_expr ?? ""
                  )}
                </td>

                {/* Default / Min / Max / Disallowed */}
                {showAdvanced && (
                  <>
                    <td style={{ textAlign: "right" }}>
                      {isEditing && d ? (
                        <input
                          className="border p-1 w-full"
                          value={d.default_value}
                          onChange={(e) =>
                            updateExisting("default_value", e.target.value)
                          }
                        />
                      ) : m.default_value != null ? (
                        m.default_value
                      ) : (
                        ""
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {isEditing && d ? (
                        <input
                          className="border p-1 w-full"
                          value={d.min_value}
                          onChange={(e) =>
                            updateExisting("min_value", e.target.value)
                          }
                        />
                      ) : m.min_value != null ? (
                        m.min_value
                      ) : (
                        ""
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {isEditing && d ? (
                        <input
                          className="border p-1 w-full"
                          value={d.max_value}
                          onChange={(e) =>
                            updateExisting("max_value", e.target.value)
                          }
                        />
                      ) : m.max_value != null ? (
                        m.max_value
                      ) : (
                        ""
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {isEditing && d ? (
                        <input
                          className="border p-1 w-full"
                          value={d.disallowed_values}
                          onChange={(e) =>
                            updateExisting(
                              "disallowed_values",
                              e.target.value
                            )
                          }
                        />
                      ) : (
                        m.disallowed_values || ""
                      )}
                    </td>
                  </>
                )}

                {/* Private */}
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={m.private}
                    onChange={() => updateMetricFlags(m, { private: !m.private })}
                  />
                </td>

                {/* Required */}
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={m.required}
                    onChange={() => updateMetricFlags(m, { required: !m.required })}
                  />
                </td>

                {/* Active */}
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={m.active}
                    onChange={() => updateMetricFlags(m, { active: !m.active })}
                  />
                </td>
                
                {showAdvanced && (
                  <>
                    {/* Show MA */}
                    <td className="p-2 text-center">
                      {isEditing && d ? (
                        <input
                          type="checkbox"
                          checked={d.show_ma}
                          onChange={(e) =>
                            updateExisting("show_ma", e.target.checked)
                          }
                        />
                      ) : m.show_ma ? (
                        "✔"
                      ) : (
                        ""
                      )}
                    </td>

                    {/* MA periods */}
                    <td style={{ textAlign: "right" }}>
                      {isEditing && d ? (
                        <input
                          className="border p-1 w-full"
                          value={d.ma_periods_csv}
                          onChange={(e) =>
                            updateExisting("ma_periods_csv", e.target.value)
                          }
                        />
                      ) : (
                        m.ma_periods_csv
                      )}
                    </td>

                    {/* Start date */}
                    <td className="p-2">
                      {isEditing && d ? (
                        <input
                          type="date"
                          className="border p-1 w-full"
                          value={d.start_date}
                          onChange={(e) =>
                            updateExisting("start_date", e.target.value)
                          }
                        />
                      ) : (
                        m.start_date || ""
                      )}
                    </td>
                  </>
                )}

                {/* Actions */}
                <td>
                  {isEditing ? (
                    <>
                      <button onClick={saveEdit}>Save</button>
                      <button onClick={cancelEdit}>Cancel</button>
                    </>
                  ) : (
                    <>
                      {/* move up/down */}
                      <button
                        type="button"
                        onClick={() => moveMetric(m, "up")}
                        disabled={!!newMetric}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveMetric(m, "down")}
                        disabled={!!newMetric}
                      >
                        ↓
                      </button>

                      {/* duplicate button */}
                      <button
                        type="button"
                        onClick={() => duplicateMetric(m)}
                        disabled={!!newMetric}
                      >
                        Duplicate
                      </button>

                      <button onClick={() => startEdit(m)} disabled={!!newMetric}>
                        Edit
                      </button>
                      <button onClick={() => updateMetricFlags(m, { active: !m.active })}>
                        {m.active ? "Archive" : "Unarchive"}
                      </button>
                    </>
                  )}
                </td>

              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
