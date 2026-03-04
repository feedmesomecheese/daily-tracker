"use client";

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export type ExerciseGroupPanelsHandle = {
  triggerAdd: () => void;
};

type ExerciseGroupPanelsProps = {
  groups: ExerciseGroup[];
  exercises: Exercise[];
  modifiers: Modifier[];
  onAddToBucket: (exercise: Exercise, selectedModifiers: string[]) => void;
  onCustomExercise: () => void;
  onSelectionChange?: (count: number) => void;
};

const ExerciseGroupPanels = forwardRef<ExerciseGroupPanelsHandle, ExerciseGroupPanelsProps>(function ExerciseGroupPanels({
  groups,
  exercises,
  modifiers,
  onAddToBucket,
  onCustomExercise,
  onSelectionChange,
}, ref) {
  // Multi-select: ordered array of selected exercise IDs (preserves selection order)
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [multiSelectMode, setMultiSelectMode] = useState(false);

  // The "primary" selected exercise for showing modifiers (last clicked)
  const [primaryExerciseId, setPrimaryExerciseId] = useState<string | null>(null);

  // Long-press state
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const longPressTriggered = useRef(false);

  const primaryExercise = exercises.find((e) => e.id === primaryExerciseId);
  const availableModifiers = primaryExercise
    ? modifiers.filter((m) => primaryExercise.available_modifier_ids.includes(m.id))
    : [];

  const isSelected = useCallback(
    (id: string) => selectedExerciseIds.includes(id),
    [selectedExerciseIds]
  );

  const handleSelectExercise = (exerciseId: string, ctrlKey: boolean) => {
    if (ctrlKey || multiSelectMode || selectedExerciseIds.length > 0) {
      // Multi-select: toggle this exercise
      setSelectedExerciseIds((prev) => {
        if (prev.includes(exerciseId)) {
          const next = prev.filter((id) => id !== exerciseId);
          // If we removed the primary, pick another or clear
          if (primaryExerciseId === exerciseId) {
            setPrimaryExerciseId(next.length > 0 ? next[next.length - 1] : null);
            if (next.length === 0) {
              setSelectedModifiers([]);
              setMultiSelectMode(false);
            }
          }
          return next;
        } else {
          setPrimaryExerciseId(exerciseId);
          setSelectedModifiers([]);
          return [...prev, exerciseId];
        }
      });
    } else {
      // First tap/click: select this one
      setSelectedExerciseIds([exerciseId]);
      setPrimaryExerciseId(exerciseId);
      setSelectedModifiers([]);
    }
  };

  const handleAdd = () => {
    if (selectedExerciseIds.length === 0) return;

    // Add each selected exercise to bucket in selection order
    for (const exId of selectedExerciseIds) {
      const ex = exercises.find((e) => e.id === exId);
      if (!ex) continue;

      // Only apply modifiers to the primary exercise (or if only one selected)
      const mods = exId === primaryExerciseId ? selectedModifiers : [];
      onAddToBucket(ex, mods);
    }

    setSelectedExerciseIds([]);
    setPrimaryExerciseId(null);
    setSelectedModifiers([]);
    setMultiSelectMode(false);
  };

  const clearSelection = () => {
    setSelectedExerciseIds([]);
    setPrimaryExerciseId(null);
    setSelectedModifiers([]);
    setMultiSelectMode(false);
  };

  // Expose triggerAdd to parent via ref
  useImperativeHandle(ref, () => ({ triggerAdd: handleAdd }));

  // Notify parent when selection count changes
  useEffect(() => {
    onSelectionChange?.(selectedExerciseIds.length);
  }, [selectedExerciseIds.length, onSelectionChange]);

  // Long-press handlers for mobile multi-select
  const handleTouchStart = useCallback((exerciseId: string, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    longPressTriggered.current = false;

    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      // Enter multi-select mode
      setMultiSelectMode(true);
      setSelectedExerciseIds((prev) => {
        if (prev.includes(exerciseId)) return prev;
        return [...prev, exerciseId];
      });
      setPrimaryExerciseId(exerciseId);
      setSelectedModifiers([]);
      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartPos.current || !longPressTimer.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPos.current.x;
    const dy = touch.clientY - touchStartPos.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
      // Finger moved too far, cancel long-press
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

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
      onClick={(e) => {
        // Ignore click if long-press just triggered
        if (longPressTriggered.current) {
          longPressTriggered.current = false;
          return;
        }
        handleSelectExercise(ex.id, e.ctrlKey || e.metaKey);
      }}
      onTouchStart={(e) => handleTouchStart(ex.id, e)}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={cn(
        "w-full text-left px-3 py-1.5 text-sm transition-colors",
        isSelected(ex.id)
          ? "bg-primary/10 text-primary font-medium"
          : "hover:bg-muted"
      )}
    >
      {ex.name}
    </button>
  );

  return (
    <div className="space-y-3">
      {/* Multi-select mode indicator */}
      {multiSelectMode && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            Multi-select
          </Badge>
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

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
      {selectedExerciseIds.length > 1 && (
        <p className="text-xs text-muted-foreground">
          {selectedExerciseIds.length} exercises selected (tap to add/remove more)
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
            disabled={selectedExerciseIds.length === 0}
          >
            Add to Workout{selectedExerciseIds.length > 1 ? ` (${selectedExerciseIds.length})` : ""}
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
});

export default ExerciseGroupPanels;
