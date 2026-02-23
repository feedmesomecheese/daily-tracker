import React from "react";
import { cn } from "@/lib/utils";
import type { WorkoutExercise } from "../types";
import ExerciseHoverTooltip from "./ExerciseHoverTooltip";

type SupersetStyle = { border: string; bg: string } | null;

type Props = {
  exercise: WorkoutExercise;
  supersetStyle?: SupersetStyle;
  onExerciseClick?: (exerciseId: string, exerciseName: string) => void;
};

function SetBadge({
  set,
}: {
  set: WorkoutExercise["sets"][number];
}) {
  const label = `${set.reps || 0}x${set.weight || 0}`;
  if (set.is_pr) {
    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-xs border border-amber-600/30 bg-amber-600/10 text-amber-700">
        {label}
      </span>
    );
  }
  if (set.is_cycle_max) {
    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-xs border border-emerald-700/30 bg-emerald-700/10 text-emerald-700">
        {label}
      </span>
    );
  }
  if (set.is_missed) {
    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-xs border border-red-700/30 bg-red-700/10 text-red-700">
        {label}
      </span>
    );
  }
  return <span>{label}</span>;
}

export default function ExerciseDetailRow({ exercise, supersetStyle, onExerciseClick }: Props) {
  const hasSets = exercise.sets && exercise.sets.length > 0;
  const hasCardioData =
    exercise.duration_minutes ||
    exercise.distance_miles ||
    exercise.incline_pct ||
    exercise.weight;
  const hasHiitData =
    exercise.time_on_seconds ||
    exercise.time_off_seconds ||
    exercise.cycles;

  const exTonnage = hasSets
    ? exercise.sets.reduce(
        (sum, s) => sum + (s.reps || 0) * (s.weight || 0),
        0
      )
    : 0;

  let detailElements: React.ReactNode = null;

  if (hasSets) {
    detailElements = (
      <span className="text-muted-foreground">
        {exercise.sets.map((s, si) => (
          <span key={si}>
            {si > 0 && ", "}
            <SetBadge set={s} />
          </span>
        ))}
        {exTonnage > 0 && (
          <span className="text-xs text-muted-foreground/60 ml-2">
            {exTonnage.toLocaleString()} lbs
          </span>
        )}
      </span>
    );
  } else if (hasHiitData) {
    const parts: string[] = [];
    if (exercise.time_on_seconds)
      parts.push(
        `On ${Math.floor(exercise.time_on_seconds / 60)}:${String(exercise.time_on_seconds % 60).padStart(2, "0")}`
      );
    if (exercise.time_off_seconds)
      parts.push(
        `Off ${Math.floor(exercise.time_off_seconds / 60)}:${String(exercise.time_off_seconds % 60).padStart(2, "0")}`
      );
    if (exercise.cycles) parts.push(`${exercise.cycles} cycles`);
    detailElements = (
      <span className="text-muted-foreground">{parts.join(", ")}</span>
    );
  } else if (hasCardioData) {
    const parts: string[] = [];
    if (exercise.duration_minutes)
      parts.push(`${exercise.duration_minutes} min`);
    if (exercise.distance_miles)
      parts.push(`${exercise.distance_miles} mi`);
    if (exercise.incline_pct)
      parts.push(`${exercise.incline_pct}% incline`);
    if (exercise.weight) parts.push(`${exercise.weight} lbs`);
    detailElements = (
      <span className="text-muted-foreground">{parts.join(", ")}</span>
    );
  }

  const exerciseId = exercise.exercise_id || exercise.id;
  const showTooltip = exerciseId && onExerciseClick;

  return (
    <tr
      className={cn(
        supersetStyle &&
          `border-l-2 ${supersetStyle.border} ${supersetStyle.bg}`
      )}
    >
      <td className="text-right font-medium pr-3 py-1 align-top w-32 sm:w-48">
        {showTooltip ? (
          <ExerciseHoverTooltip
            exerciseId={exerciseId}
            exerciseName={exercise.exercise_name_display}
            onClick={() =>
              onExerciseClick(exerciseId, exercise.exercise_name_display)
            }
            className="font-medium"
          />
        ) : (
          exercise.exercise_name_display
        )}
      </td>
      <td className="w-px bg-border py-1" />
      <td className="pl-3 py-1 tabular-nums align-top">
        {detailElements}
        {exercise.notes && (
          <span className="text-muted-foreground italic ml-2 text-xs">
            {exercise.notes}
          </span>
        )}
      </td>
    </tr>
  );
}
