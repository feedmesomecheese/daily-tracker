"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { getLocalDateString, addDays } from "@/lib/dateUtils";
import MacroSummaryBar, { type Totals, type GoalTarget } from "./components/MacroSummaryBar";
import FoodLogMealCard, { type Meal, type FoodLogItem } from "./components/FoodLogMealCard";
import FoodSearchSheet from "./components/FoodSearchSheet";
import MealTemplateSheet, { type MealTemplate } from "./components/MealTemplateSheet";
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

// ── Types ───────────────────────────────────────────────────────────────────

interface FoodLog {
  id: string;
  date: string;
  notes: string | null;
  is_submitted: boolean;
  meals: Meal[];
}

interface FoodGoal {
  id: string;
  nutrient: string;
  value_type: "absolute" | "per_lb_bodyweight" | "pct_calories";
  value: number;
  direction: "min" | "max" | "target";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeDayTotals(meals: Meal[]): Totals {
  const totals: Totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const meal of meals) {
    for (const item of meal.items) {
      totals.calories += item.calories;
      totals.protein += item.protein;
      totals.carbs += item.carbs;
      totals.fat += item.fat;
      totals.fiber += item.fiber;
    }
  }
  return totals;
}

function computeGoalTargets(goals: FoodGoal[], totals: Totals, bodyWeight: number | null): GoalTarget[] {
  return goals.map((g) => {
    let target = 0;
    if (g.value_type === "absolute") {
      target = g.value;
    } else if (g.value_type === "per_lb_bodyweight") {
      target = bodyWeight != null ? g.value * bodyWeight : 0;
    } else if (g.value_type === "pct_calories") {
      target = (g.value / 100) * totals.calories;
    }
    return { nutrient: g.nutrient, target, direction: g.direction };
  });
}

function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", timeZone: "UTC" });
}

// ── Page ─────────────────────────────────────────────────────────────────────

// ── Sortable meal card wrapper ────────────────────────────────────────────────

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

function DragPreviewCard({ meal }: { meal: Meal }) {
  const itemCount = meal.items.length;
  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow px-4 py-3 cursor-grabbing opacity-95">
      <span className="text-sm font-semibold">{meal.meal_name}</span>
      {itemCount > 0 && (
        <span className="text-xs text-muted-foreground ml-2">{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
      )}
    </div>
  );
}

export default function FoodPage() {
  const [currentDate, setCurrentDate] = useState<string>(getLocalDateString());
  const [foodLog, setFoodLog] = useState<FoodLog | null>(null);
  const [goals, setGoals] = useState<FoodGoal[]>([]);
  const [bodyWeight, setBodyWeight] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Food search sheet state
  const [searchSheetOpen, setSearchSheetOpen] = useState(false);
  const [searchTargetMealId, setSearchTargetMealId] = useState<string>("");

  // Template state
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [templateSheetMode, setTemplateSheetMode] = useState<"add_meal" | "apply">("add_meal");
  const [templateTargetMealId, setTemplateTargetMealId] = useState<string>("");

  const logIdRef = useRef<string | null>(null);

  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // ── Fetch helpers ──────────────────────────────────────────────────────────

  const fetchLog = useCallback(async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/food/logs/${id}`, { headers });
    if (!res.ok) throw new Error("Failed to fetch log");
    const data: FoodLog = await res.json();
    setFoodLog(data);
    setNotes(data.notes ?? "");
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const headers = await getAuthHeaders();

      // 1. Get or create log for the date
      const logRes = await fetch("/api/food/logs", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ date: currentDate }),
      });
      if (!logRes.ok) throw new Error("Failed to get/create log");
      const logMeta: { id: string } = await logRes.json();
      logIdRef.current = logMeta.id;

      // 2. Parallel fetches
      const [logData, goalsData, bodyData, templatesData] = await Promise.all([
        fetch(`/api/food/logs/${logMeta.id}`, { headers }).then((r) =>
          r.ok ? r.json() : null
        ),
        fetch("/api/food/goals", { headers }).then((r) => (r.ok ? r.json() : [])),
        fetch("/api/metrics/body", { headers }).then((r) => (r.ok ? r.json() : null)),
        fetch("/api/food/templates", { headers }).then((r) => (r.ok ? r.json() : [])),
      ]);

      if (logData) {
        setFoodLog(logData);
        setNotes(logData.notes ?? "");
      }

      setGoals(Array.isArray(goalsData) ? goalsData : goalsData?.goals ?? []);
      setTemplates(Array.isArray(templatesData) ? templatesData : []);

      // Extract latest body weight from body data
      if (bodyData?.weight && Array.isArray(bodyData.weight) && bodyData.weight.length > 0) {
        const sorted = [...bodyData.weight].sort((a: { date: string }, b: { date: string }) =>
          b.date.localeCompare(a.date)
        );
        setBodyWeight(sorted[0].value ?? null);
      } else {
        setBodyWeight(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load food log");
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Date navigation ────────────────────────────────────────────────────────

  const prevDay = () => setCurrentDate((d) => addDays(d, -1));
  const nextDay = () => setCurrentDate((d) => addDays(d, 1));

  // ── Computed values ────────────────────────────────────────────────────────

  const dayTotals = computeDayTotals(foodLog?.meals ?? []);
  const goalTargets = computeGoalTargets(goals, dayTotals, bodyWeight);

  // ── Mutation handlers ──────────────────────────────────────────────────────

  const refreshLog = useCallback(async () => {
    if (!logIdRef.current) return;
    try {
      await fetchLog(logIdRef.current);
    } catch {
      // Best effort
    }
  }, [fetchLog]);

  const handleAddMeal = async () => {
    if (!logIdRef.current) return;
    try {
      const headers = await getAuthHeaders();
      const mealCount = (foodLog?.meals?.length ?? 0) + 1;
      const res = await fetch(`/api/food/logs/${logIdRef.current}/meals`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ meal_name: `Meal ${mealCount}` }),
      });
      if (!res.ok) throw new Error("Failed to add meal");
      await refreshLog();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add meal");
    }
  };

  const handleMealDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleMealDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over || active.id === over.id || !foodLog) return;

      const meals = foodLog.meals;
      const oldIndex = meals.findIndex((m) => m.id === active.id);
      const newIndex = meals.findIndex((m) => m.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(meals, oldIndex, newIndex);
      // Optimistic update
      setFoodLog((prev) => prev ? { ...prev, meals: reordered } : prev);

      // Persist new order to server
      try {
        const headers = await getAuthHeaders();
        await Promise.all(
          reordered.map((meal, idx) =>
            fetch(`/api/food/logs/${logIdRef.current}/meals/${meal.id}`, {
              method: "PATCH",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({ meal_order: idx }),
            })
          )
        );
      } catch {
        // Revert on failure
        await refreshLog();
      }
    },
    [foodLog, refreshLog]
  );

  const handleRenameMeal = async (mealId: string, meal_name: string) => {
    if (!logIdRef.current) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/food/logs/${logIdRef.current}/meals/${mealId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ meal_name }),
      });
      if (!res.ok) throw new Error("Failed to rename meal");
      await refreshLog();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to rename meal");
    }
  };

  const handleDeleteMeal = async (mealId: string) => {
    if (!logIdRef.current) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/food/logs/${logIdRef.current}/meals/${mealId}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed to delete meal");
      await refreshLog();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete meal");
    }
  };

  const handleUpdateItem = async (mealId: string, itemId: string, qty: number) => {
    if (!logIdRef.current) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/food/logs/${logIdRef.current}/meals/${mealId}/items/${itemId}`,
        {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ qty }),
        }
      );
      if (!res.ok) throw new Error("Failed to update item");
      await refreshLog();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update item");
    }
  };

  const handleDeleteItem = async (mealId: string, itemId: string) => {
    if (!logIdRef.current) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/food/logs/${logIdRef.current}/meals/${mealId}/items/${itemId}`,
        { method: "DELETE", headers }
      );
      if (!res.ok) throw new Error("Failed to delete item");
      await refreshLog();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete item");
    }
  };

  const saveNotes = async () => {
    if (!logIdRef.current) return;
    // Only save if notes actually changed
    if (notes === (foodLog?.notes ?? "")) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/food/logs/${logIdRef.current}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
    } catch {
      // Best effort
    }
  };

  const handleSubmit = async () => {
    if (!logIdRef.current) return;
    setSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/food/logs/${logIdRef.current}/submit`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error("Failed to submit");
      await refreshLog();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const loadTemplates = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/food/templates", { headers });
      if (res.ok) setTemplates(await res.json());
    } catch { /* best effort */ }
  }, []);

  const handleSaveAsTemplate = async (mealId: string, name: string): Promise<void> => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/food/templates", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name, from_meal_id: mealId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Server error ${res.status}`);
      }
      await loadTemplates();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save template");
      throw e;
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/food/templates/${templateId}`, { method: "DELETE", headers });
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete template");
    }
  };

  const handleApplyTemplate = (mealId: string) => {
    setTemplateTargetMealId(mealId);
    setTemplateSheetMode("apply");
    setTemplateSheetOpen(true);
  };

  const handleAddMealFromTemplate = async (template: MealTemplate) => {
    if (!logIdRef.current) return;
    try {
      const headers = await getAuthHeaders();
      // Create a new meal named after the template
      const mealRes = await fetch(`/api/food/logs/${logIdRef.current}/meals`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ meal_name: template.name }),
      });
      if (!mealRes.ok) throw new Error("Failed to create meal");
      const newMeal: { id: string } = await mealRes.json();
      // Apply template items
      await fetch(`/api/food/logs/${logIdRef.current}/meals/${newMeal.id}/from-template`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: template.id }),
      });
      await refreshLog();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add meal from template");
    }
  };

  const handleApplyTemplateToMeal = async (template: MealTemplate) => {
    if (!logIdRef.current || !templateTargetMealId) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/food/logs/${logIdRef.current}/meals/${templateTargetMealId}/from-template`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: template.id }),
      });
      await refreshLog();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to apply template");
    }
  };

  const openFoodSearch = (mealId: string) => {
    setSearchTargetMealId(mealId);
    setSearchSheetOpen(true);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const isToday = currentDate === getLocalDateString();

  return (
    <>
      <main className="max-w-2xl mx-auto px-4 py-6 pb-24">
        {/* Date navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevDay}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Previous day"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
          </button>

          <div className="text-center">
            <span className="font-semibold text-lg">{formatDisplayDate(currentDate)}</span>
            {isToday && (
              <span className="ml-2 text-xs text-muted-foreground">(Today)</span>
            )}
          </div>

          <button
            onClick={nextDay}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Next day"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 text-destructive text-sm px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            <div className="rounded-xl border bg-card h-28 animate-pulse" />
            <div className="rounded-xl border bg-card h-32 animate-pulse" />
            <div className="rounded-xl border bg-card h-32 animate-pulse" />
          </div>
        )}

        {!loading && (
          <>
            {/* Macro summary bar */}
            <MacroSummaryBar totals={dayTotals} goals={goalTargets} />

            {/* Meal cards — sortable */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleMealDragStart} onDragEnd={handleMealDragEnd}>
              <SortableContext items={(foodLog?.meals ?? []).map((m) => m.id)} strategy={verticalListSortingStrategy}>
                {(foodLog?.meals ?? []).map((meal) => (
                  <SortableMealCard
                    key={meal.id}
                    meal={meal}
                    onAddFood={() => openFoodSearch(meal.id)}
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
                  const meal = foodLog?.meals.find((m) => m.id === activeDragId);
                  return meal ? <DragPreviewCard meal={meal} /> : null;
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

            {/* Footer: notes + submit */}
            <div className="rounded-xl border bg-card text-card-foreground shadow p-4 flex flex-col gap-3">
              <textarea
                placeholder="Daily notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={saveNotes}
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full rounded-lg bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting
                  ? "Submitting..."
                  : foodLog?.is_submitted
                  ? "Submitted — Resubmit to DT"
                  : "Submit Day to DT"}
              </button>
            </div>
          </>
        )}
      </main>

      {/* Food search sheet */}
      {logIdRef.current && (
        <FoodSearchSheet
          open={searchSheetOpen}
          onClose={() => setSearchSheetOpen(false)}
          logId={logIdRef.current}
          mealId={searchTargetMealId}
          onAdded={refreshLog}
        />
      )}

      {/* Meal template sheet */}
      <MealTemplateSheet
        open={templateSheetOpen}
        onClose={() => setTemplateSheetOpen(false)}
        templates={templates}
        actionLabel={templateSheetMode === "add_meal" ? "Add as Meal" : "Apply"}
        onAction={templateSheetMode === "add_meal" ? handleAddMealFromTemplate : handleApplyTemplateToMeal}
        onDelete={handleDeleteTemplate}
        onAddBlank={templateSheetMode === "add_meal" ? handleAddMeal : undefined}
      />
    </>
  );
}
