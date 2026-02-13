"use client";

import { useRef, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import BucketExerciseRow, { type BucketExerciseData } from "./BucketExerciseRow";
import SupersetChainLink from "./SupersetChainLink";

type GhostData = Record<
  string,
  {
    sets: {
      set_number: number;
      reps: number | null;
      weight: number | null;
    }[];
  }
>;

type ExerciseBucketProps = {
  exercises: BucketExerciseData[];
  ghostData: GhostData;
  onExercisesChange: (exercises: BucketExerciseData[]) => void;
};

export default function ExerciseBucket({
  exercises,
  ghostData,
  onExercisesChange,
}: ExerciseBucketProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Map of exercise bucket id → first input ref
  const firstInputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());

  const registerFirstInput = useCallback(
    (exerciseId: string) => (el: HTMLInputElement | null) => {
      firstInputRefs.current.set(exerciseId, el);
    },
    []
  );

  const focusNextRow = useCallback(
    (currentIndex: number) => () => {
      if (currentIndex + 1 < exercises.length) {
        const nextId = exercises[currentIndex + 1].id;
        const el = firstInputRefs.current.get(nextId);
        el?.focus();
      }
    },
    [exercises]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = exercises.findIndex((e) => e.id === active.id);
    const newIndex = exercises.findIndex((e) => e.id === over.id);
    onExercisesChange(arrayMove(exercises, oldIndex, newIndex));
  };

  const updateExercise = (index: number, updated: BucketExerciseData) => {
    const newExercises = [...exercises];
    newExercises[index] = updated;
    onExercisesChange(newExercises);
  };

  const removeExercise = (index: number) => {
    onExercisesChange(exercises.filter((_, i) => i !== index));
  };

  const nextSupersetGroup = useRef(1);

  const toggleSupersetLink = (afterIndex: number) => {
    // Link/unlink exercise at afterIndex with afterIndex+1
    const newExercises = [...exercises];
    const current = newExercises[afterIndex];
    const next = newExercises[afterIndex + 1];

    const isCurrentlyLinked =
      current.superset_group !== null &&
      current.superset_group === next.superset_group;

    if (isCurrentlyLinked) {
      // Unlink: split the pair. Check neighbors to decide who keeps the group.
      const prevEx = afterIndex > 0 ? newExercises[afterIndex - 1] : null;
      const nextNextEx = afterIndex + 2 < newExercises.length ? newExercises[afterIndex + 2] : null;

      const currentLinkedToPrev =
        prevEx && prevEx.superset_group !== null && prevEx.superset_group === current.superset_group;
      const nextLinkedToNextNext =
        nextNextEx && nextNextEx.superset_group !== null && nextNextEx.superset_group === next.superset_group;

      if (currentLinkedToPrev && nextLinkedToNextNext) {
        // Both sides have other links - give "next" side a new group number
        const newGroup = nextSupersetGroup.current++;
        for (let i = afterIndex + 1; i < newExercises.length; i++) {
          if (newExercises[i].superset_group === current.superset_group) {
            newExercises[i] = { ...newExercises[i], superset_group: newGroup };
          } else {
            break;
          }
        }
      } else if (currentLinkedToPrev) {
        // current stays in its group, just remove next from the group
        newExercises[afterIndex + 1] = { ...next, superset_group: null };
      } else if (nextLinkedToNextNext) {
        // next stays in its group, just remove current from the group
        newExercises[afterIndex] = { ...current, superset_group: null };
      } else {
        // Neither has other links - set both to null
        newExercises[afterIndex] = { ...current, superset_group: null };
        newExercises[afterIndex + 1] = { ...next, superset_group: null };
      }
    } else {
      // Link: merge into the same group
      if (current.superset_group !== null && next.superset_group !== null) {
        // Both already in different groups - merge next's group into current's
        const oldGroup = next.superset_group;
        const newGroup = current.superset_group;
        for (let i = 0; i < newExercises.length; i++) {
          if (newExercises[i].superset_group === oldGroup) {
            newExercises[i] = { ...newExercises[i], superset_group: newGroup };
          }
        }
      } else if (current.superset_group !== null) {
        // current has a group, add next to it
        newExercises[afterIndex + 1] = { ...next, superset_group: current.superset_group };
      } else if (next.superset_group !== null) {
        // next has a group, add current to it
        newExercises[afterIndex] = { ...current, superset_group: next.superset_group };
      } else {
        // Neither has a group - create a new one
        const group = nextSupersetGroup.current++;
        newExercises[afterIndex] = { ...current, superset_group: group };
        newExercises[afterIndex + 1] = { ...next, superset_group: group };
      }
    }

    onExercisesChange(newExercises);
  };

  if (exercises.length === 0) {
    return (
      <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground text-sm">
        Select exercises above to add them to your workout
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={exercises.map((e) => e.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-0">
          {exercises.map((ex, index) => {
            const ghost = ex.exercise_id ? ghostData[ex.exercise_id] : undefined;
            const ghostSets = ghost?.sets || [];
            const nextEx = exercises[index + 1];
            const isSupersetLinked =
              nextEx &&
              ex.superset_group !== null &&
              ex.superset_group === nextEx.superset_group;

            return (
              <div key={ex.id}>
                <BucketExerciseRow
                  data={ex}
                  ghostSets={ghostSets}
                  supersetActive={ex.superset_group !== null}
                  onUpdate={(updated) => updateExercise(index, updated)}
                  onRemove={() => removeExercise(index)}
                  registerFirstInput={registerFirstInput(ex.id)}
                  focusNextRow={focusNextRow(index)}
                />
                {index < exercises.length - 1 && (
                  <SupersetChainLink
                    active={isSupersetLinked}
                    onClick={() => toggleSupersetLink(index)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
