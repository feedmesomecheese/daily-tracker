"use client";
import { useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";

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
};

function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Turn a draft (all strings) into the shape the API/DB expects
function normalizeDraft(d: MetricDraft): Omit<
  Metric,
  "default_value" | "min_value" | "max_value" | "disallowed_values" | "start_date"
> & {
  default_value: number | null;
  min_value: number | null;
  max_value: number | null;
  disallowed_values: string | null;
  start_date: string | null;
} {
  const toNum = (s: string): number | null => {
    if (!s.trim()) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  return {
    metric_id: d.metric_id.trim(),
    metric_name: d.metric_name.trim(),
    type: d.type,
    private: d.private,
    active: d.active,
    show_ma: d.show_ma,
    ma_periods_csv: d.ma_periods_csv || null,
    default_value: toNum(d.default_value),
    min_value: toNum(d.min_value),
    max_value: toNum(d.max_value),
    disallowed_values: d.disallowed_values.trim() || null,
    start_date: d.start_date.trim() || null,
    required: d.required,
  };
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [error, setError] = useState<string | null>(null);

  // editing existing metric
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<MetricDraft | null>(null);

  // adding new metric
  const [newMetric, setNewMetric] = useState<NewMetric | null>(null);

  useEffect(() => {
    loadMetrics();
  }, []);

  async function loadMetrics() {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/config", { headers });
      const rows = await res.json();
      if (!res.ok) {
        setError(rows?.error || "Failed to load metrics");
        return;
      }

      const normalized: Metric[] = rows.map((r: any) => ({
        metric_id: r.metric_id,
        metric_name: r.metric_name ?? r.metric_id,
        type: r.type,
        private: !!r.private,
        active: !!r.active,
        show_ma: !!r.show_ma,
        ma_periods_csv: r.ma_periods_csv ?? "",
        start_date: r.start_date ?? null,
        default_value: r.default_value ?? null,
        min_value: r.min_value ?? null,
        max_value: r.max_value ?? null,
        disallowed_values: r.disallowed_values ?? null,
        required: !!r.required,
      }));

      setMetrics(normalized);
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

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

    const current = draft; // narrow for TS
    const headers = await getAuthHeaders();
    const payload = normalizeDraft(current);

    const res = await fetch(
      `/api/metrics/${encodeURIComponent(current.metric_id)}`,
      {
        method: "PATCH",
        headers: {
          ...headers,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload), // NOTE: no extra metric_id spread here
      }
    );

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

    const res = await fetch(
      `/api/metrics/${encodeURIComponent(m.metric_id)}`,
      {
        method: "PATCH",
        headers: {
          ...headers,
          "content-type": "application/json",
        },
        body: JSON.stringify({ active }),
      }
    );

    const j = await res.json().catch(() => null);
    if (!res.ok) {
      setError(j?.error || "Update failed");
      return;
    }

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

      <table className="w-full border mt-4">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2">ID</th>
            <th className="p-2">Name</th>
            <th className="p-2">Type</th>
            <th className="p-2">Default</th>
            <th className="p-2">Min</th>
            <th className="p-2">Max</th>
            <th className="p-2">Disallowed</th>
            <th className="p-2">Private</th>
            <th className="p-2">Required</th>
            <th className="p-2">Active</th>
            <th className="p-2">Show MA</th>
            <th className="p-2">MA Periods</th>
            <th className="p-2">Start Date</th>
            <th className="p-2"></th>
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
                  className="border p-1 w-full"
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

              {/* Default / Min / Max / Disallowed */}
              <td className="p-2">
                <input
                  className="border p-1 w-full"
                  value={newMetric.default_value}
                  onChange={(e) =>
                    updateNew("default_value", e.target.value)
                  }
                  placeholder="e.g. 4"
                />
              </td>
              <td className="p-2">
                <input
                  className="border p-1 w-full"
                  value={newMetric.min_value}
                  onChange={(e) => updateNew("min_value", e.target.value)}
                  placeholder="min"
                />
              </td>
              <td className="p-2">
                <input
                  className="border p-1 w-full"
                  value={newMetric.max_value}
                  onChange={(e) => updateNew("max_value", e.target.value)}
                  placeholder="max"
                />
              </td>
              <td className="p-2">
                <input
                  className="border p-1 w-full"
                  value={newMetric.disallowed_values}
                  onChange={(e) =>
                    updateNew("disallowed_values", e.target.value)
                  }
                  placeholder="comma-separated"
                />
              </td>

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
              <td className="p-2 text-center">
                <input
                  type="checkbox"
                  checked={newMetric.show_ma}
                  onChange={(e) => updateNew("show_ma", e.target.checked)}
                />
              </td>

              {/* MA periods */}
              <td className="p-2">
                <input
                  className="border p-1 w-full"
                  value={newMetric.ma_periods_csv}
                  onChange={(e) =>
                    updateNew("ma_periods_csv", e.target.value)
                  }
                  placeholder="7,30,90"
                />
              </td>

              {/* Start date */}
              <td className="p-2">
                <input
                  type="date"
                  className="border p-1 w-full"
                  value={newMetric.start_date}
                  onChange={(e) =>
                    updateNew("start_date", e.target.value)
                  }
                />
              </td>

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
          {metrics.map((m) => {
            const isEditing = editing === m.metric_id;
            const d = draft && isEditing ? draft : null;

            return (
              <tr
                key={m.metric_id}
                className={`border-t ${!m.active ? "opacity-60" : ""}`}
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

                {/* Type (read-only) */}
                <td className="p-2 text-sm text-gray-600">{m.type}</td>

                {/* Default / Min / Max / Disallowed */}
                <td className="p-2">
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
                <td className="p-2">
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
                <td className="p-2">
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
                <td className="p-2">
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

                {/* Private */}
                <td className="p-2 text-center">
                  {isEditing && d ? (
                    <input
                      type="checkbox"
                      checked={d.private}
                      onChange={(e) =>
                        updateExisting("private", e.target.checked)
                      }
                    />
                  ) : m.private ? (
                    "✔"
                  ) : (
                    ""
                  )}
                </td>

                {/* Required */}
                <td className="p-2 text-center">
                  {isEditing ? (
                    <input
                      type="checkbox"
                      checked={draft?.required ?? false}
                      onChange={(e) => 
                        updateExisting("required", e.target.checked)
                      }
                    />
                  ) : m.required ? (
                    "✔"
                  ) : (
                    ""
                  )}
                </td>


                {/* Active */}
                <td className="p-2 text-center">
                  {isEditing && d ? (
                    <input
                      type="checkbox"
                      checked={d.active}
                      onChange={(e) =>
                        updateExisting("active", e.target.checked)
                      }
                    />
                  ) : m.active ? (
                    "✔"
                  ) : (
                    ""
                  )}
                </td>

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
                <td className="p-2">
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

                {/* Actions */}
                <td className="p-2 text-right space-x-2">
                  {isEditing ? (
                    <>
                      <button
                        className="px-2 py-1 border rounded mr-2"
                        onClick={saveEdit}
                      >
                        Save
                      </button>
                      <button
                        className="px-2 py-1 border bg-gray-100"
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="px-2 py-1 border bg-blue-100"
                        onClick={() => startEdit(m)}
                        disabled={!!newMetric}
                      >
                        Edit
                      </button>
                      <button
                        className="px-2 py-1 border bg-yellow-100"
                        onClick={() => setActive(m, !m.active)}
                      >
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
