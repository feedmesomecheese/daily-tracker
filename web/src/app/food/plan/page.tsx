"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { getLocalDateString } from "@/lib/dateUtils";
import MacroSummaryBar, { type Totals, type GoalTarget } from "../components/MacroSummaryBar";
import FoodLogMealCard, { type Meal } from "../components/FoodLogMealCard";
import FoodSearchSheet from "../components/FoodSearchSheet";
import MealTemplateSheet, { type MealTemplate } from "../components/MealTemplateSheet";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

interface FoodGoal {
  id: string;
  nutrient: string;
  value_type: "absolute" | "per_lb_bodyweight" | "pct_calories";
  value: number;
  direction: "min" | "max" | "target";
}

function computeGoalTargets(goals: FoodGoal[], totals: Totals, bodyWeight: number | null): GoalTarget[] {
  return goals.map((g) => {
    let target = 0;
    if (g.value_type === "absolute") {
      target = g.value;
    } else if (g.value_type === "per_lb_bodyweight") {
      target = bodyWeight != null ? g.value * bodyWeight : 0;
    } else if (g.value_type === "pct_calories") {
      const calTarget = (g.value / 100) * totals.calories;
      if (g.nutrient === "calories") target = calTarget;
      else if (g.nutrient === "fat") target = calTarget / 9;
      else target = calTarget / 4;
    }
    return { nutrient: g.nutrient, target, direction: g.direction };
  });
}

interface Plan {
  id: string;
  name: string;
  notes: string;
  meals: Meal[];
}

interface PlanSummary {
  id: string;
  name: string;
  meal_count: number;
  total_calories: number;
}

function computeTotals(meals: Meal[]): Totals {
  const t: Totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const meal of meals) {
    for (const item of meal.items) {
      t.calories += item.calories;
      t.protein += item.protein;
      t.carbs += item.carbs;
      t.fat += item.fat;
      t.fiber += item.fiber;
    }
  }
  return t;
}

// ── Sortable meal card wrapper ─────────────────────────────────────────────

interface SortableMealCardProps {
  meal: Meal;
  onAddFood: () => void;
  onUpdateItem: (mealId: string, itemId: string, qty: number) => void;
  onDeleteItem: (mealId: string, itemId: string) => void;
  onRenameMeal: (mealId: string, name: string) => void;
  onDeleteMeal: (mealId: string) => void;
  onSaveAsTemplate: (mealId: string, name: string) => Promise<void>;
  onApplyTemplate: (mealId: string) => void;
}

function SortableMealCard({ meal, ...props }: SortableMealCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: meal.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style}>
      <FoodLogMealCard
        meal={meal}
        {...props}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            className="touch-none cursor-grab active:cursor-grabbing p-1 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
            aria-label="Drag to reorder"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M7 2a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4zM7 9a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4zM7 16a2 2 0 110 4 2 2 0 010-4zm6 0a2 2 0 110 4 2 2 0 010-4z"/>
            </svg>
          </button>
        }
      />
    </div>
  );
}

// ── Log as Today modal ────────────────────────────────────────────────────

interface LogAsTodayModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (mode: "replace" | "add") => void;
  loading: boolean;
}

function LogAsTodayModal({ open, onClose, onConfirm, loading }: LogAsTodayModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-background rounded-t-2xl sm:rounded-2xl p-6 shadow-xl">
        <h3 className="text-base font-semibold mb-1">Log as Today</h3>
        <p className="text-sm text-muted-foreground mb-4">
          How should this plan be applied to today&apos;s food log?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onConfirm("add")}
            disabled={loading}
            className="w-full rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            Add to existing log
          </button>
          <button
            onClick={() => onConfirm("replace")}
            disabled={loading}
            className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Replace today&apos;s log
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-full rounded-lg py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function FoodPlanPage() {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [renamingPlan, setRenamingPlan] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [logAsTodayOpen, setLogAsTodayOpen] = useState(false);
  const [loggingAsToday, setLoggingAsToday] = useState(false);

  const [goals, setGoals] = useState<FoodGoal[]>([]);
  const [bodyWeight, setBodyWeight] = useState<number | null>(null);

  const [searchSheetOpen, setSearchSheetOpen] = useState(false);
  const [searchTargetMealId, setSearchTargetMealId] = useState("");
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [templateSheetMode, setTemplateSheetMode] = useState<"add_meal" | "apply">("add_meal");
  const [templateTargetMealId, setTemplateTargetMealId] = useState("");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchPlans = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const [plansRes, templatesRes, goalsRes, bodyRes] = await Promise.all([
        fetch("/api/food/plans", { headers }),
        fetch("/api/food/templates", { headers }),
        fetch("/api/food/goals", { headers }),
        fetch("/api/metrics/body", { headers }),
      ]);
      if (templatesRes.ok) setTemplates(await templatesRes.json());
      if (goalsRes.ok) {
        const gd = await goalsRes.json();
        setGoals(Array.isArray(gd) ? gd : gd?.goals ?? []);
      }
      if (bodyRes.ok) {
        const bd = await bodyRes.json();
        if (bd?.weight && Array.isArray(bd.weight) && bd.weight.length > 0) {
          const sorted = [...bd.weight].sort((a: { date: string }, b: { date: string }) => b.date.localeCompare(a.date));
          setBodyWeight(sorted[0].value ?? null);
        }
      }
      if (plansRes.ok) {
        const data: PlanSummary[] = await plansRes.json();
        setPlans(data);
        return data;
      }
    } catch { /* best effort */ }
    return [];
  }, []);

  const fetchPlan = useCallback(async (id: string, silent = false) => {
    if (!silent) setLoadingPlan(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/food/plans/${id}`, { headers });
      if (!res.ok) throw new Error("Failed to load plan");
      const data: Plan = await res.json();
      setActivePlan(data);
      if (!silent) setRenameValue(data.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plan");
    } finally {
      if (!silent) setLoadingPlan(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await fetchPlans();
      if (data.length > 0) {
        setCurrentPlanId(data[0].id);
        await fetchPlan(data[0].id);
      }
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentPlanId) fetchPlan(currentPlanId);
  }, [currentPlanId, fetchPlan]);

  const refreshPlan = useCallback(async () => {
    if (!currentPlanId) return;
    await fetchPlan(currentPlanId, true);
  }, [currentPlanId, fetchPlan]);

  // ── Plan management ───────────────────────────────────────────────────

  const handleCreatePlan = async () => {
    const name = window.prompt("Plan name:");
    if (!name?.trim()) return;
    setCreatingPlan(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/food/plans", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create plan");
      const newPlan = await res.json();
      const updated = await fetchPlans();
      if (updated) {
        setCurrentPlanId(newPlan.id);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create plan");
    } finally {
      setCreatingPlan(false);
    }
  };

  const handleRenamePlan = async () => {
    if (!currentPlanId || !renameValue.trim()) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/food/plans/${currentPlanId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (!res.ok) throw new Error("Failed to rename");
      setActivePlan((prev) => prev ? { ...prev, name: renameValue.trim() } : prev);
      setPlans((prev) => prev.map((p) => p.id === currentPlanId ? { ...p, name: renameValue.trim() } : p));
      setRenamingPlan(false);
    } catch {
      setRenamingPlan(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!currentPlanId) return;
    if (!confirm("Delete this plan? This cannot be undone.")) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/food/plans/${currentPlanId}`, { method: "DELETE", headers });
      const updated = await fetchPlans();
      if (updated && updated.length > 0) {
        setCurrentPlanId(updated[0].id);
      } else {
        setCurrentPlanId(null);
        setActivePlan(null);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete plan");
    }
  };

  // ── Log as today ──────────────────────────────────────────────────────

  const handleLogAsToday = async (mode: "replace" | "add") => {
    if (!currentPlanId) return;
    setLoggingAsToday(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/food/plans/${currentPlanId}/log-as-today`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ mode, date: getLocalDateString() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to log as today");
      }
      setLogAsTodayOpen(false);
      // Notify success with brief message
      alert("Plan logged to today's food log.");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to log as today");
    } finally {
      setLoggingAsToday(false);
    }
  };

  // ── Meal mutations ───────────────────────────────────────────────────

  const handleAddMeal = async () => {
    if (!currentPlanId) return;
    try {
      const headers = await getAuthHeaders();
      const mealCount = (activePlan?.meals?.length ?? 0) + 1;
      const res = await fetch(`/api/food/logs/${currentPlanId}/meals`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ meal_name: `Meal ${mealCount}` }),
      });
      if (!res.ok) throw new Error("Failed to add meal");
      const newMeal = await res.json();
      await refreshPlan();
      setSearchTargetMealId(newMeal.id);
      setSearchSheetOpen(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add meal");
    }
  };

  const handleRenameMeal = async (mealId: string, meal_name: string) => {
    if (!currentPlanId) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/food/logs/${currentPlanId}/meals/${mealId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ meal_name }),
      });
      await refreshPlan();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to rename meal");
    }
  };

  const handleDeleteMeal = async (mealId: string) => {
    if (!currentPlanId) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/food/logs/${currentPlanId}/meals/${mealId}`, { method: "DELETE", headers });
      await refreshPlan();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete meal");
    }
  };

  const handleUpdateItem = async (mealId: string, itemId: string, qty: number) => {
    if (!currentPlanId) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/food/logs/${currentPlanId}/meals/${mealId}/items/${itemId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ qty }),
      });
      await refreshPlan();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update item");
    }
  };

  const handleDeleteItem = async (mealId: string, itemId: string) => {
    if (!currentPlanId) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/food/logs/${currentPlanId}/meals/${mealId}/items/${itemId}`, {
        method: "DELETE", headers,
      });
      await refreshPlan();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete item");
    }
  };

  const handleSaveAsTemplate = async (mealId: string, name: string): Promise<void> => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/food/templates", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name, from_meal_id: mealId }),
      });
      if (!res.ok) throw new Error("Failed to save template");
      const refreshRes = await fetch("/api/food/templates", { headers });
      if (refreshRes.ok) setTemplates(await refreshRes.json());
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save template");
      throw e;
    }
  };

  const handleApplyTemplate = (mealId: string) => {
    setTemplateTargetMealId(mealId);
    setTemplateSheetMode("apply");
    setTemplateSheetOpen(true);
  };

  const handleAddMealFromTemplate = async (template: MealTemplate) => {
    if (!currentPlanId) return;
    try {
      const headers = await getAuthHeaders();
      const mealRes = await fetch(`/api/food/logs/${currentPlanId}/meals`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ meal_name: template.name }),
      });
      if (!mealRes.ok) throw new Error("Failed to create meal");
      const newMeal: { id: string } = await mealRes.json();
      await fetch(`/api/food/logs/${currentPlanId}/meals/${newMeal.id}/from-template`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: template.id }),
      });
      await refreshPlan();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add meal from template");
    }
  };

  const handleApplyTemplateToMeal = async (template: MealTemplate) => {
    if (!currentPlanId || !templateTargetMealId) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/food/logs/${currentPlanId}/meals/${templateTargetMealId}/from-template`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: template.id }),
      });
      await refreshPlan();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to apply template");
    }
  };

  const handleMealDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleMealDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over || active.id === over.id || !activePlan) return;

      const meals = activePlan.meals;
      const oldIndex = meals.findIndex((m) => m.id === active.id);
      const newIndex = meals.findIndex((m) => m.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(meals, oldIndex, newIndex);
      setActivePlan((prev) => prev ? { ...prev, meals: reordered } : prev);

      try {
        const headers = await getAuthHeaders();
        await Promise.all(
          reordered.map((meal, idx) =>
            fetch(`/api/food/logs/${currentPlanId}/meals/${meal.id}`, {
              method: "PATCH",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({ meal_order: idx }),
            })
          )
        );
      } catch {
        await refreshPlan();
      }
    },
    [activePlan, currentPlanId, refreshPlan]
  );

  // ── Render ─────────────────────────────────────────────────────────────

  const totals = computeTotals(activePlan?.meals ?? []);

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {/* Plan selector row */}
        <div className="flex items-center gap-2 mb-4">
          {plans.length > 0 ? (
            renamingPlan ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenamePlan();
                    if (e.key === "Escape") setRenamingPlan(false);
                  }}
                  className="flex-1 min-w-0 rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button onClick={handleRenamePlan} className="text-xs text-primary font-medium">Save</button>
                <button onClick={() => setRenamingPlan(false)} className="text-xs text-muted-foreground">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <select
                  value={currentPlanId ?? ""}
                  onChange={(e) => setCurrentPlanId(e.target.value)}
                  className="flex-1 min-w-0 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => { setRenamingPlan(true); setRenameValue(activePlan?.name ?? ""); }}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                  title="Rename plan"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                  </svg>
                </button>
                <button
                  onClick={handleDeletePlan}
                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Delete plan"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            )
          ) : (
            <span className="text-muted-foreground text-sm flex-1">No plans yet</span>
          )}
          <button
            onClick={handleCreatePlan}
            disabled={creatingPlan}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            + New Plan
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 text-destructive text-sm px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {!currentPlanId && !loading && (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm">Create a plan to start building meals.</p>
          </div>
        )}

        {currentPlanId && (
          <>
            {loadingPlan ? (
              <div className="space-y-3">
                {[1, 2].map((i) => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
              </div>
            ) : (
              <>
                <MacroSummaryBar totals={totals} goals={computeGoalTargets(goals, totals, bodyWeight)} />

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleMealDragStart} onDragEnd={handleMealDragEnd}>
                  <SortableContext items={(activePlan?.meals ?? []).map((m) => m.id)} strategy={verticalListSortingStrategy}>
                    {(activePlan?.meals ?? []).map((meal) => (
                      <SortableMealCard
                        key={meal.id}
                        meal={meal}
                        onAddFood={() => { setSearchTargetMealId(meal.id); setSearchSheetOpen(true); }}
                        onUpdateItem={handleUpdateItem}
                        onDeleteItem={handleDeleteItem}
                        onRenameMeal={handleRenameMeal}
                        onDeleteMeal={handleDeleteMeal}
                        onSaveAsTemplate={handleSaveAsTemplate}
                        onApplyTemplate={handleApplyTemplate}
                      />
                    ))}
                  </SortableContext>
                  <DragOverlay>
                    {activeDragId && (() => {
                      const meal = activePlan?.meals.find((m) => m.id === activeDragId);
                      return meal ? (
                        <div className="rounded-xl border bg-card px-4 py-3 cursor-grabbing opacity-95">
                          <span className="text-sm font-semibold">{meal.meal_name}</span>
                        </div>
                      ) : null;
                    })()}
                  </DragOverlay>
                </DndContext>

                {/* Add meal row */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={handleAddMeal}
                    className="flex-1 rounded-xl border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                    </svg>
                    Add Meal
                  </button>
                  {templates.length > 0 && (
                    <button
                      onClick={() => { setTemplateSheetMode("add_meal"); setTemplateSheetOpen(true); }}
                      className="rounded-xl border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap"
                    >
                      From Template
                    </button>
                  )}
                </div>

                {/* Footer */}
                <div className={cn(
                  "rounded-xl border bg-card shadow p-4 flex flex-col gap-3",
                  (activePlan?.meals?.length ?? 0) === 0 && "hidden"
                )}>
                  <button
                    onClick={() => setLogAsTodayOpen(true)}
                    className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    Log as Today
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </main>

      {/* Food search sheet */}
      {currentPlanId && (
        <FoodSearchSheet
          open={searchSheetOpen}
          onClose={() => setSearchSheetOpen(false)}
          logId={currentPlanId}
          mealId={searchTargetMealId}
          onAdded={refreshPlan}
        />
      )}

      {/* Meal template sheet */}
      <MealTemplateSheet
        open={templateSheetOpen}
        onClose={() => setTemplateSheetOpen(false)}
        templates={templates}
        actionLabel={templateSheetMode === "add_meal" ? "Add as Meal" : "Apply"}
        onAction={templateSheetMode === "add_meal" ? handleAddMealFromTemplate : handleApplyTemplateToMeal}
        onDelete={async (id) => {
          const headers = await getAuthHeaders();
          await fetch(`/api/food/templates/${id}`, { method: "DELETE", headers });
          setTemplates((prev) => prev.filter((t) => t.id !== id));
        }}
        onAddBlank={templateSheetMode === "add_meal" ? handleAddMeal : undefined}
      />

      {/* Log as Today modal */}
      <LogAsTodayModal
        open={logAsTodayOpen}
        onClose={() => setLogAsTodayOpen(false)}
        onConfirm={handleLogAsToday}
        loading={loggingAsToday}
      />
    </>
  );
}
