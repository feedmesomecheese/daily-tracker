"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import ExerciseDetailRow from "./ExerciseDetailRow";
import ExerciseStatsSheet from "./ExerciseStatsSheet";
import type { WorkoutHistory, WorkoutType } from "../types";
import { SUPERSET_COLORS } from "../types";

type Props = {
  workouts: WorkoutHistory[];
  workoutTypes: WorkoutType[];
};

const PAGE_SIZES = [10, 25, 50] as const;

function computeSupersetColorMap(
  exercises: NonNullable<WorkoutHistory["exercises"]>
) {
  const groupNums = new Set<number>();
  for (const ex of exercises) {
    if (ex.superset_group != null) groupNums.add(ex.superset_group);
  }
  const map = new Map<number, number>();
  let idx = 0;
  for (const g of groupNums) {
    map.set(g, idx % SUPERSET_COLORS.length);
    idx++;
  }
  return map;
}

function computeWorkoutTonnage(workout: WorkoutHistory): number {
  let total = 0;
  for (const ex of workout.exercises || []) {
    for (const s of ex.sets || []) {
      total += (s.reps || 0) * (s.weight || 0);
    }
  }
  return total;
}

function formatDuration(mins: number | null): string {
  if (!mins) return "";
  if (mins >= 60) {
    return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
  }
  return `${Math.round(mins)}m`;
}

export default function WorkoutCentricView({ workouts, workoutTypes }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState(0);
  const [statsExercise, setStatsExercise] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const totalPages = Math.max(1, Math.ceil(workouts.length / pageSize));
  const safeePage = Math.min(page, totalPages - 1);
  const pageWorkouts = workouts.slice(
    safeePage * pageSize,
    safeePage * pageSize + pageSize
  );

  const typeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of workoutTypes) m.set(t.id, t.name);
    return m;
  }, [workoutTypes]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExerciseClick = (exerciseId: string, exerciseName: string) => {
    setStatsExercise({ id: exerciseId, name: exerciseName });
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 px-2 font-medium w-6"></th>
              <th className="py-2 px-2 font-medium">Date</th>
              <th className="py-2 px-2 font-medium">Type</th>
              <th className="py-2 px-2 font-medium text-right hidden sm:table-cell">Duration</th>
              <th className="py-2 px-2 font-medium text-center hidden sm:table-cell">Rating</th>
              <th className="py-2 px-2 font-medium text-right hidden sm:table-cell">Exercises</th>
              <th className="py-2 px-2 font-medium text-right">Tonnage</th>
            </tr>
          </thead>
          <tbody>
            {pageWorkouts.map((workout, i) => {
              const isExpanded = expanded.has(workout.id);
              const tonnage = computeWorkoutTonnage(workout);
              const exCount = (workout.exercises?.length || 0) + (workout.activity_sessions?.length || 0);
              const typeName = workout.workout_type_id
                ? typeMap.get(workout.workout_type_id) || workout.workout_type
                : workout.workout_type;

              return (
                <React.Fragment key={workout.id}>
                  <tr
                    onClick={() => toggleExpand(workout.id)}
                    className={`border-b cursor-pointer hover:bg-accent/50 transition-colors ${
                      i % 2 === 0 ? "bg-background" : "bg-muted/30"
                    }`}
                  >
                    <td className="py-2 px-2 text-muted-foreground">
                      {isExpanded ? "\u25BC" : "\u25B6"}
                    </td>
                    <td className="py-2 px-2 font-medium whitespace-nowrap">
                      {workout.date}
                    </td>
                    <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">
                      {typeName?.replace("_", " ") || "\u2014"}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                      {formatDuration(workout.duration_minutes)}
                    </td>
                    <td className="py-2 px-2 text-center text-muted-foreground hidden sm:table-cell">
                      {workout.rating
                        ? `${"*".repeat(workout.rating)}/5`
                        : "\u2014"}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums hidden sm:table-cell">
                      {exCount || "\u2014"}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">
                      {tonnage > 0
                        ? `${tonnage.toLocaleString()} lbs`
                        : "\u2014"}
                    </td>
                  </tr>
                  {isExpanded && (exCount > 0 || workout.notes) && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <div className="px-4 py-2 bg-muted/20">
                          {exCount > 0 && (
                            <table className="w-full text-sm border-collapse table-fixed">
                              <tbody>
                                {workout.exercises?.map((ex, ei) => {
                                  const colorMap = computeSupersetColorMap(
                                    workout.exercises!
                                  );
                                  const ssIdx =
                                    ex.superset_group != null
                                      ? colorMap.get(ex.superset_group)
                                      : undefined;
                                  const ssStyle =
                                    ssIdx != null
                                      ? SUPERSET_COLORS[ssIdx]
                                      : null;

                                  return (
                                    <ExerciseDetailRow
                                      key={`ex-${ei}`}
                                      exercise={ex}
                                      supersetStyle={ssStyle}
                                      onExerciseClick={handleExerciseClick}
                                    />
                                  );
                                })}
                                {workout.activity_sessions?.map((a) => (
                                  <tr key={`act-${a.id}`}>
                                    <td className="text-right font-medium pr-3 py-1 align-top w-32 sm:w-48">
                                      {a.activity_type}
                                    </td>
                                    <td className="w-px bg-border py-1" />
                                    <td className="pl-3 py-1 text-muted-foreground">
                                      {a.duration_minutes && (
                                        <span>{formatDuration(a.duration_minutes)}</span>
                                      )}
                                      {a.notes && (
                                        <span className="italic ml-2 text-xs">
                                          {a.notes}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {tonnage > 0 && (
                            <div className="text-xs text-muted-foreground/60 text-right pt-2 border-t mt-2">
                              Total tonnage:{" "}
                              {tonnage.toLocaleString()} lbs
                            </div>
                          )}
                          {workout.notes && (
                            <p className="text-sm text-muted-foreground mt-2 italic">
                              {workout.notes}
                            </p>
                          )}
                          <div className="flex justify-end pt-2 border-t mt-2">
                            <Link href={`/workouts?edit=${workout.id}`}>
                              <Button variant="ghost" size="sm" className="text-xs">
                                Edit
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {pageWorkouts.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  No workouts found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {workouts.length > 0 && (
        <div className="flex items-center justify-between pt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Per page:</span>
            {PAGE_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setPageSize(s);
                  setPage(0);
                }}
                className={`px-2 py-0.5 rounded ${
                  pageSize === s
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span>
              {safeePage * pageSize + 1}\u2013
              {Math.min((safeePage + 1) * pageSize, workouts.length)} of{" "}
              {workouts.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={safeePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={safeePage >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Exercise Stats Sheet */}
      <ExerciseStatsSheet
        exerciseId={statsExercise?.id || null}
        exerciseName={statsExercise?.name || null}
        open={!!statsExercise}
        onOpenChange={(open) => {
          if (!open) setStatsExercise(null);
        }}
      />
    </div>
  );
}
