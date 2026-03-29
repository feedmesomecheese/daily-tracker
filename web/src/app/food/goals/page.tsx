"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { useToast } from "@/components/ui/Toast";

type Nutrient = "calories" | "protein" | "fat" | "carbs" | "fiber";
type Direction = "min" | "max" | "target";
type ValueType = "absolute" | "per_lb_bodyweight" | "pct_calories";

interface FoodGoal {
  id: string;
  nutrient: Nutrient;
  direction: Direction;
  value_type: ValueType;
  value: number;
}

const NUTRIENT_LABELS: Record<Nutrient, string> = {
  calories: "Calories",
  protein: "Protein",
  fat: "Fat",
  carbs: "Carbs",
  fiber: "Fiber",
};

const DIRECTION_LABELS: Record<Direction, string> = {
  min: "≥",
  max: "≤",
  target: "=",
};

const VALUE_TYPE_LABELS: Record<ValueType, string> = {
  absolute: "Absolute",
  per_lb_bodyweight: "Per lb bodyweight",
  pct_calories: "% of calories",
};

const NUTRIENT_OPTIONS: Nutrient[] = [
  "calories",
  "protein",
  "fat",
  "carbs",
  "fiber",
];
const DIRECTION_OPTIONS: Direction[] = ["min", "max", "target"];
const VALUE_TYPE_OPTIONS: ValueType[] = [
  "absolute",
  "per_lb_bodyweight",
  "pct_calories",
];

interface GoalFormState {
  nutrient: Nutrient;
  direction: Direction;
  value_type: ValueType;
  value: string;
}

function defaultForm(): GoalFormState {
  return {
    nutrient: "calories",
    direction: "target",
    value_type: "absolute",
    value: "",
  };
}

function goalToFormState(goal: FoodGoal): GoalFormState {
  return {
    nutrient: goal.nutrient,
    direction: goal.direction,
    value_type: goal.value_type,
    value: String(goal.value),
  };
}

export default function FoodGoalsPage() {
  const { confirm } = useToast();
  const [goals, setGoals] = useState<FoodGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bodyWeight, setBodyWeight] = useState<number | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<FoodGoal | null>(null);
  const [form, setForm] = useState<GoalFormState>(defaultForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Data fetching ──────────────────────────────────────────────

  const fetchGoals = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/food/goals", { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load goals");
      setGoals(json.goals ?? json ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load goals");
    }
  }, []);

  const fetchBodyWeight = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/metrics/body", { headers });
      if (!res.ok) return;
      const json = await res.json();
      // Look for weight array and take the last entry
      const weightEntries: Array<{ value: number; date: string }> =
        json?.weight ?? [];
      if (weightEntries.length > 0) {
        const sorted = [...weightEntries].sort((a, b) =>
          a.date < b.date ? -1 : 1
        );
        setBodyWeight(sorted[sorted.length - 1].value);
      }
    } catch {
      // Body weight is optional — ignore errors
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchGoals(), fetchBodyWeight()]);
      setLoading(false);
    };
    init();
  }, [fetchGoals, fetchBodyWeight]);

  // ── Computed display ──────────────────────────────────────────

  function computedTarget(goal: FoodGoal): string {
    const unit = goal.nutrient === "calories" ? "kcal" : "g";
    if (goal.value_type === "absolute") {
      return `${goal.value} ${unit}`;
    } else if (goal.value_type === "per_lb_bodyweight") {
      if (bodyWeight !== null) {
        return `${goal.value} × ${bodyWeight}lbs = ${(
          goal.value * bodyWeight
        ).toFixed(0)}${unit}`;
      }
      return `${goal.value} per lb`;
    } else if (goal.value_type === "pct_calories") {
      return `${goal.value}% of calories`;
    }
    return String(goal.value);
  }

  function valueTypeLabel(goal: FoodGoal): string {
    return VALUE_TYPE_LABELS[goal.value_type];
  }

  // ── Form helpers ──────────────────────────────────────────────

  const openAdd = () => {
    const takenNutrients = new Set(goals.map((g) => g.nutrient));
    const firstAvailable = NUTRIENT_OPTIONS.find((n) => !takenNutrients.has(n)) ?? "calories";
    setForm({ ...defaultForm(), nutrient: firstAvailable as Nutrient });
    setFormError(null);
    setEditingGoal(null);
    setShowAddForm(true);
  };

  const openEdit = (goal: FoodGoal) => {
    setForm(goalToFormState(goal));
    setFormError(null);
    setEditingGoal(goal);
    setShowAddForm(true);
  };

  const closeForm = () => {
    setShowAddForm(false);
    setEditingGoal(null);
    setFormError(null);
  };

  const updateForm = <K extends keyof GoalFormState>(
    key: K,
    value: GoalFormState[K]
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Computed preview for per_lb_bodyweight in form
  const formPreview = (): string | null => {
    if (form.value_type !== "per_lb_bodyweight") return null;
    const numVal = Number(form.value);
    if (!numVal || !bodyWeight) return null;
    const unit = form.nutrient === "calories" ? "kcal" : "g";
    return `= ${(numVal * bodyWeight).toFixed(0)}${unit} based on current weight ${bodyWeight}lbs`;
  };

  const validateForm = (): string | null => {
    if (!form.value || isNaN(Number(form.value)) || Number(form.value) <= 0)
      return "Value must be a positive number.";
    // One goal per nutrient — block adding a duplicate
    if (!editingGoal) {
      const existing = goals.find((g) => g.nutrient === form.nutrient);
      if (existing) return `A goal for ${NUTRIENT_LABELS[form.nutrient as Nutrient]} already exists. Edit the existing one.`;
    }
    return null;
  };

  // ── Save goal ─────────────────────────────────────────────────

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const body = {
        nutrient: form.nutrient,
        direction: form.direction,
        value_type: form.value_type,
        value: Number(form.value),
      };

      let res: Response;
      if (editingGoal) {
        res = await fetch(`/api/food/goals/${editingGoal.id}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/food/goals", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to save goal");

      await fetchGoals();
      closeForm();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete goal ───────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!await confirm({ message: "Delete this goal?", destructive: true, confirmLabel: "Delete" })) return;
    setDeletingId(id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/food/goals/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || "Failed to delete goal");
      }
      setGoals((prev) => prev.filter((g) => g.id !== id));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete goal");
    } finally {
      setDeletingId(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────

  return (
    <main className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Food Goals</h1>
        {goals.length < NUTRIENT_OPTIONS.length && (
          <button
            onClick={openAdd}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            + Add Goal
          </button>
        )}
      </div>

      {/* Body weight info */}
      {bodyWeight !== null && (
        <div className="text-xs text-muted-foreground mb-4">
          Current body weight: <span className="font-medium">{bodyWeight} lbs</span>
          {" "}(used for per-lb calculations)
        </div>
      )}

      {/* Global error */}
      {error && (
        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-card border rounded-lg p-4 h-[68px] animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && goals.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-sm">No food goals set yet.</p>
          <button
            onClick={openAdd}
            className="mt-3 px-4 py-2 border rounded-lg text-sm hover:bg-accent transition-colors"
          >
            Add your first goal
          </button>
        </div>
      )}

      {/* Goals list */}
      {!loading && goals.length > 0 && (
        <div className="space-y-2">
          {goals.map((goal) => (
            <div
              key={goal.id}
              className="bg-card border rounded-lg p-4 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-medium">
                    {NUTRIENT_LABELS[goal.nutrient]}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {DIRECTION_LABELS[goal.direction]}
                  </span>
                  <span className="text-sm">{computedTarget(goal)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {valueTypeLabel(goal)}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => openEdit(goal)}
                  className="text-xs px-2.5 py-1 border rounded-md hover:bg-accent transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(goal.id)}
                  disabled={deletingId === goal.id}
                  className="text-xs px-2.5 py-1 border border-destructive/30 text-destructive rounded-md hover:bg-destructive/10 transition-colors disabled:opacity-50"
                >
                  {deletingId === goal.id ? "..." : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit form */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-md bg-background rounded-xl shadow-xl border">
            {/* Form header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="text-base font-semibold">
                {editingGoal ? "Edit Goal" : "Add Goal"}
              </h2>
              <button
                onClick={closeForm}
                className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Form body */}
            <div className="px-4 py-4 space-y-4">
              {formError && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
                  {formError}
                </div>
              )}

              {/* Nutrient */}
              <div>
                <label className="text-sm font-medium mb-1 block">Nutrient</label>
                <select
                  value={form.nutrient}
                  onChange={(e) =>
                    updateForm("nutrient", e.target.value as Nutrient)
                  }
                  className="w-full h-9 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                >
                  {NUTRIENT_OPTIONS.filter((n) => {
                    // When adding, only show nutrients without an existing goal
                    if (editingGoal) return true;
                    return !goals.some((g) => g.nutrient === n);
                  }).map((n) => (
                    <option key={n} value={n}>
                      {NUTRIENT_LABELS[n]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Direction */}
              <div>
                <label className="text-sm font-medium mb-1 block">Direction</label>
                <div className="flex gap-2">
                  {DIRECTION_OPTIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => updateForm("direction", d)}
                      className={`flex-1 h-9 rounded-lg text-sm border transition-colors ${
                        form.direction === d
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover:bg-accent"
                      }`}
                    >
                      {DIRECTION_LABELS[d]}{" "}
                      <span className="text-xs opacity-70">
                        {d === "min" ? "min" : d === "max" ? "max" : "exact"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Value type */}
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Value type
                </label>
                <select
                  value={form.value_type}
                  onChange={(e) =>
                    updateForm("value_type", e.target.value as ValueType)
                  }
                  className="w-full h-9 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                >
                  {VALUE_TYPE_OPTIONS.map((vt) => (
                    <option key={vt} value={vt}>
                      {VALUE_TYPE_LABELS[vt]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Value */}
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Value
                  {form.value_type === "pct_calories" && " (%)"}
                  {form.value_type === "absolute" &&
                    (form.nutrient === "calories" ? " (kcal)" : " (g)")}
                  {form.value_type === "per_lb_bodyweight" && " (g per lb)"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.value}
                  onChange={(e) => updateForm("value", e.target.value)}
                  placeholder="0"
                  className="w-full h-9 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                />
                {/* Preview for per_lb_bodyweight */}
                {formPreview() && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {formPreview()}
                  </p>
                )}
              </div>
            </div>

            {/* Form footer */}
            <div className="px-4 py-3 border-t flex gap-2">
              <button
                type="button"
                onClick={closeForm}
                className="flex-1 h-9 border rounded-lg text-sm hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 h-9 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : editingGoal
                  ? "Save Changes"
                  : "Add Goal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
