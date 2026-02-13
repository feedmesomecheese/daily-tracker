"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ExerciseGroup = {
  id: string;
  name: string;
};

type Exercise = {
  id: string;
  name: string;
  exercise_type: string;
  group_ids: string[];
  available_modifier_ids: string[];
};

type Modifier = {
  id: string;
  name: string;
};

type ExerciseGroupPanelsProps = {
  groups: ExerciseGroup[];
  exercises: Exercise[];
  modifiers: Modifier[];
  onAddToBucket: (exercise: Exercise, selectedModifiers: string[]) => void;
  onCustomExercise: () => void;
};

export default function ExerciseGroupPanels({
  groups,
  exercises,
  modifiers,
  onAddToBucket,
  onCustomExercise,
}: ExerciseGroupPanelsProps) {
  // Multi-select: set of selected exercise IDs
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<Set<string>>(new Set());
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);

  // The "primary" selected exercise for showing modifiers (last clicked)
  const [primaryExerciseId, setPrimaryExerciseId] = useState<string | null>(null);

  const primaryExercise = exercises.find((e) => e.id === primaryExerciseId);
  const availableModifiers = primaryExercise
    ? modifiers.filter((m) => primaryExercise.available_modifier_ids.includes(m.id))
    : [];

  const handleSelectExercise = (exerciseId: string, ctrlKey: boolean) => {
    if (ctrlKey) {
      // Multi-select: toggle this exercise
      setSelectedExerciseIds((prev) => {
        const next = new Set(prev);
        if (next.has(exerciseId)) {
          next.delete(exerciseId);
          // If we removed the primary, pick another or clear
          if (primaryExerciseId === exerciseId) {
            const remaining = Array.from(next);
            setPrimaryExerciseId(remaining.length > 0 ? remaining[remaining.length - 1] : null);
            if (remaining.length === 0) setSelectedModifiers([]);
          }
        } else {
          next.add(exerciseId);
          setPrimaryExerciseId(exerciseId);
          setSelectedModifiers([]);
        }
        return next;
      });
    } else {
      // Single click: select only this one (or deselect if already sole selection)
      if (selectedExerciseIds.size === 1 && selectedExerciseIds.has(exerciseId)) {
        setSelectedExerciseIds(new Set());
        setPrimaryExerciseId(null);
        setSelectedModifiers([]);
      } else {
        setSelectedExerciseIds(new Set([exerciseId]));
        setPrimaryExerciseId(exerciseId);
        setSelectedModifiers([]);
      }
    }
  };

  const handleAdd = () => {
    if (selectedExerciseIds.size === 0) return;

    // Add each selected exercise to bucket
    for (const exId of selectedExerciseIds) {
      const ex = exercises.find((e) => e.id === exId);
      if (!ex) continue;

      // Only apply modifiers to the primary exercise (or if only one selected)
      const mods = exId === primaryExerciseId ? selectedModifiers : [];
      onAddToBucket(ex, mods);
    }

    setSelectedExerciseIds(new Set());
    setPrimaryExerciseId(null);
    setSelectedModifiers([]);
  };

  const getExercisesForGroup = (groupId: string) =>
    exercises.filter((e) => e.group_ids.includes(groupId));

  // Exercises not in any of the displayed groups
  const groupedExerciseIds = new Set(
    groups.flatMap((g) => getExercisesForGroup(g.id).map((e) => e.id))
  );
  const ungroupedExercises = exercises.filter((e) => !groupedExerciseIds.has(e.id));

  const renderExerciseButton = (ex: Exercise) => (
    <button
      key={ex.id}
      type="button"
      onClick={(e) => handleSelectExercise(ex.id, e.ctrlKey || e.metaKey)}
      className={cn(
        "w-full text-left px-3 py-1.5 text-sm transition-colors",
        selectedExerciseIds.has(ex.id)
          ? "bg-primary/10 text-primary font-medium"
          : "hover:bg-muted"
      )}
    >
      {ex.name}
    </button>
  );

  return (
    <div className="space-y-3">
      {/* Group Panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {groups.map((group) => {
          const groupExercises = getExercisesForGroup(group.id);
          if (groupExercises.length === 0) return null;

          return (
            <Card key={group.id} className="overflow-hidden">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm">{group.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-40 overflow-y-auto">
                  {groupExercises.map(renderExerciseButton)}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Ungrouped exercises */}
        {ungroupedExercises.length > 0 && (
          <Card className="overflow-hidden">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-sm text-muted-foreground">Other</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-40 overflow-y-auto">
                {ungroupedExercises.map(renderExerciseButton)}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Selection info */}
      {selectedExerciseIds.size > 1 && (
        <p className="text-xs text-muted-foreground">
          {selectedExerciseIds.size} exercises selected (Ctrl+click to select more)
        </p>
      )}

      {/* Modifiers + Add button */}
      <div className="flex flex-wrap items-center gap-3">
        {availableModifiers.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Modifiers:</span>
            {availableModifiers.map((mod) => (
              <label key={mod.id} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={selectedModifiers.includes(mod.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedModifiers([...selectedModifiers, mod.id]);
                    } else {
                      setSelectedModifiers(selectedModifiers.filter((m) => m !== mod.id));
                    }
                  }}
                />
                {mod.name}
              </label>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={selectedExerciseIds.size === 0}
          >
            Add to Workout{selectedExerciseIds.size > 1 ? ` (${selectedExerciseIds.size})` : ""}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onCustomExercise}
          >
            + Custom Exercise
          </Button>
        </div>
      </div>
    </div>
  );
}
