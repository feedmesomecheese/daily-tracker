"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ExerciseHoverTooltip from "./ExerciseHoverTooltip";
import ExerciseStatsSheet from "./ExerciseStatsSheet";
import type {
  WorkoutHistory,
  WorkoutType,
  Exercise,
  ExerciseCentricEntry,
} from "../types";

type Props = {
  workouts: WorkoutHistory[];
  workoutTypes: WorkoutType[];
  exercises: Exercise[];
};

const PAGE_SIZES = [10, 25, 50] as const;

function buildExerciseCentricData(
  workouts: WorkoutHistory[],
  exerciseDefs: Exercise[]
): ExerciseCentricEntry[] {
  const map = new Map<string, ExerciseCentricEntry>();

  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      const key = ex.exercise_name_display;
      if (!map.has(key)) {
        const def = ex.exercise_id
          ? exerciseDefs.find((e) => e.id === ex.exercise_id)
          : null;
        map.set(key, {
          exercise_name_display: key,
          exercise_id: ex.exercise_id || null,
          group_ids: def?.group_ids || [],
          sessions: [],
          totalTonnage: 0,
          sessionCount: 0,
        });
      }

      const entry = map.get(key)!;
      const tonnage = (ex.sets || []).reduce(
        (sum, s) => sum + (s.reps || 0) * (s.weight || 0),
        0
      );

      entry.sessions.push({
        workout_id: w.id,
        date: w.date,
        workout_type: w.workout_type,
        workout_type_id: w.workout_type_id,
        sets: ex.sets || [],
        duration_minutes: ex.duration_minutes,
        distance_miles: ex.distance_miles,
        incline_pct: ex.incline_pct,
        weight: ex.weight,
        time_on_seconds: ex.time_on_seconds,
        time_off_seconds: ex.time_off_seconds,
        cycles: ex.cycles,
        notes: ex.notes,
        tonnage,
      });
      entry.totalTonnage += tonnage;
      entry.sessionCount += 1;
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.sessionCount - a.sessionCount
  );
}

function SetBadge({
  set,
}: {
  set: { reps: number | null; weight: number | null; is_pr: boolean; is_cycle_max: boolean; is_missed: boolean };
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

export default function ExerciseCentricView({
  workouts,
  workoutTypes,
  exercises,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState(0);
  const [statsExercise, setStatsExercise] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const data = useMemo(
    () => buildExerciseCentricData(workouts, exercises),
    [workouts, exercises]
  );

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = data.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  );

  const typeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of workoutTypes) m.set(t.id, t.name);
    return m;
  }, [workoutTypes]);

  const toggleCollapse = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No exercises found
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pageData.map((entry) => {
        const isCollapsed = collapsed.has(entry.exercise_name_display);

        return (
          <Card key={entry.exercise_name_display}>
            <CardHeader
              className="py-3 cursor-pointer hover:bg-accent/30 transition-colors"
              onClick={() => toggleCollapse(entry.exercise_name_display)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">
                    {isCollapsed ? "\u25B6" : "\u25BC"}
                  </span>
                  <CardTitle className="text-sm font-medium">
                    {entry.exercise_id ? (
                      <ExerciseHoverTooltip
                        exerciseId={entry.exercise_id}
                        exerciseName={entry.exercise_name_display}
                        onClick={() =>
                          setStatsExercise({
                            id: entry.exercise_id!,
                            name: entry.exercise_name_display,
                          })
                        }
                      />
                    ) : (
                      entry.exercise_name_display
                    )}
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {entry.sessionCount}{" "}
                    {entry.sessionCount === 1 ? "session" : "sessions"}
                  </Badge>
                </div>
                {entry.totalTonnage > 0 && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {entry.totalTonnage.toLocaleString()} lbs total
                  </span>
                )}
              </div>
            </CardHeader>
            {!isCollapsed && (
              <CardContent className="pt-0 pb-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-1.5 px-2 font-medium">Date</th>
                        <th className="py-1.5 px-2 font-medium hidden sm:table-cell">Type</th>
                        <th className="py-1.5 px-2 font-medium">Sets</th>
                        <th className="py-1.5 px-2 font-medium text-right hidden sm:table-cell">
                          Tonnage
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {entry.sessions.map((session, si) => {
                        const typeName = session.workout_type_id
                          ? typeMap.get(session.workout_type_id) ||
                            session.workout_type
                          : session.workout_type;

                        const hasSets = session.sets.length > 0;
                        const hasHiitData =
                          session.time_on_seconds ||
                          session.time_off_seconds ||
                          session.cycles;
                        const hasCardioData =
                          session.duration_minutes ||
                          session.distance_miles ||
                          session.incline_pct ||
                          session.weight;

                        let detailContent: React.ReactNode;
                        if (hasSets) {
                          detailContent = (
                            <span className="text-muted-foreground">
                              {session.sets.map((s, idx) => (
                                <span key={idx}>
                                  {idx > 0 && ", "}
                                  <SetBadge set={s} />
                                </span>
                              ))}
                            </span>
                          );
                        } else if (hasHiitData) {
                          const parts: string[] = [];
                          if (session.time_on_seconds)
                            parts.push(
                              `On ${Math.floor(session.time_on_seconds / 60)}:${String(session.time_on_seconds % 60).padStart(2, "0")}`
                            );
                          if (session.time_off_seconds)
                            parts.push(
                              `Off ${Math.floor(session.time_off_seconds / 60)}:${String(session.time_off_seconds % 60).padStart(2, "0")}`
                            );
                          if (session.cycles)
                            parts.push(`${session.cycles} cycles`);
                          detailContent = (
                            <span className="text-muted-foreground">
                              {parts.join(", ")}
                            </span>
                          );
                        } else if (hasCardioData) {
                          const parts: string[] = [];
                          if (session.duration_minutes)
                            parts.push(`${session.duration_minutes} min`);
                          if (session.distance_miles)
                            parts.push(`${session.distance_miles} mi`);
                          if (session.incline_pct)
                            parts.push(`${session.incline_pct}% incline`);
                          if (session.weight)
                            parts.push(`${session.weight} lbs`);
                          detailContent = (
                            <span className="text-muted-foreground">
                              {parts.join(", ")}
                            </span>
                          );
                        } else {
                          detailContent = (
                            <span className="text-muted-foreground">
                              {session.notes || "\u2014"}
                            </span>
                          );
                        }

                        return (
                          <tr
                            key={si}
                            className={`border-b last:border-0 ${
                              si % 2 === 0 ? "" : "bg-muted/20"
                            }`}
                          >
                            <td className="py-1.5 px-2 whitespace-nowrap tabular-nums">
                              {session.date}
                            </td>
                            <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap hidden sm:table-cell">
                              {typeName?.replace("_", " ") || "\u2014"}
                            </td>
                            <td className="py-1.5 px-2 tabular-nums">
                              {detailContent}
                            </td>
                            <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                              {session.tonnage > 0
                                ? `${session.tonnage.toLocaleString()} lbs`
                                : "\u2014"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Pagination */}
      {data.length > 0 && (
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
              {safePage * pageSize + 1}\u2013
              {Math.min((safePage + 1) * pageSize, data.length)} of{" "}
              {data.length} exercises
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={safePage >= totalPages - 1}
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
