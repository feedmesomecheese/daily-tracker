"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import WorkoutLogFilters, {
  getInitialFilters,
  type FilterState,
} from "../components/WorkoutLogFilters";
import WorkoutCentricView from "../components/WorkoutCentricView";
import ExerciseCentricView from "../components/ExerciseCentricView";
import type {
  WorkoutType,
  ExerciseGroup,
  Exercise,
  WorkoutHistory,
  WorkoutTag,
} from "../types";

export default function WorkoutLogPage() {
  const [workoutTypes, setWorkoutTypes] = useState<WorkoutType[]>([]);
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [tags, setTags] = useState<WorkoutTag[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(getInitialFilters);
  const [activeTab, setActiveTab] = useState("workout");
  const [exporting, setExporting] = useState(false);

  // Fetch reference data once
  const fetchRefData = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const [typesRes, groupsRes, exRes, tagsRes] = await Promise.all([
        fetch("/api/workouts/types", { headers }),
        fetch("/api/workouts/groups", { headers }),
        fetch("/api/workouts/exercises?include_archived=true", { headers }),
        fetch("/api/workouts/tags", { headers }),
      ]);
      const [typesData, groupsData, exData, tagsData] = await Promise.all([
        typesRes.ok ? typesRes.json() : [],
        groupsRes.ok ? groupsRes.json() : [],
        exRes.ok ? exRes.json() : [],
        tagsRes.ok ? tagsRes.json() : [],
      ]);
      setWorkoutTypes(typesData);
      setGroups(groupsData);
      setExercises(exData);
      setTags(tagsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load reference data");
    }
  }, []);

  // Debounce exercise search for API calls
  const [debouncedExerciseSearch, setDebouncedExerciseSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedExerciseSearch(filters.exerciseSearch);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [filters.exerciseSearch]);

  // Fetch workouts when date range or exercise search changes
  const fetchWorkouts = useCallback(async () => {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({
        include_sets: "true",
        limit: "500",
      });
      if (filters.startDate) params.set("start_date", filters.startDate);
      if (filters.endDate) params.set("end_date", filters.endDate);
      if (debouncedExerciseSearch) params.set("exercise_name", debouncedExerciseSearch);

      const res = await fetch(`/api/workouts?${params}`, { headers });
      if (!res.ok) throw new Error("Failed to fetch workouts");
      const data = await res.json();
      setWorkouts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workouts");
    } finally {
      setLoading(false);
    }
  }, [filters.startDate, filters.endDate, debouncedExerciseSearch]);

  useEffect(() => {
    fetchRefData();
  }, [fetchRefData]);

  useEffect(() => {
    fetchWorkouts();
  }, [fetchWorkouts]);

  // Build exercise lookup for group filtering
  const exerciseGroupMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const ex of exercises) {
      map.set(ex.id, ex.group_ids);
    }
    return map;
  }, [exercises]);

  // Client-side filtering
  const filteredWorkouts = useMemo(() => {
    let result = workouts;

    // Filter by workout type IDs
    if (filters.typeIds.size > 0) {
      result = result.filter(
        (w) => w.workout_type_id && filters.typeIds.has(w.workout_type_id)
      );
    }

    // Filter by tags
    if (filters.tagIds.size > 0) {
      result = result.filter((w) =>
        (w.applied_tag_ids || []).some((tid) => filters.tagIds.has(tid))
      );
    }

    // Filter by group
    if (filters.groupId) {
      result = result.filter((w) =>
        (w.exercises || []).some((ex) => {
          if (!ex.exercise_id) return false;
          const gids = exerciseGroupMap.get(ex.exercise_id);
          return gids?.includes(filters.groupId);
        })
      );
    }

    // Filter by exercise search (workout-centric: keep workouts that contain matching exercise)
    if (filters.exerciseSearch) {
      const search = filters.exerciseSearch.toLowerCase();
      result = result.filter((w) =>
        (w.exercises || []).some((ex) =>
          ex.exercise_name_display.toLowerCase().includes(search)
        )
      );
    }

    // Filter by flags (PR/Max/Miss) — keep workouts that have at least one matching set
    if (filters.flags.size > 0) {
      result = result.filter((w) =>
        (w.exercises || []).some((ex) =>
          (ex.sets || []).some((s) => {
            if (filters.flags.has("pr") && s.is_pr) return true;
            if (filters.flags.has("max") && s.is_cycle_max) return true;
            if (filters.flags.has("miss") && s.is_missed) return true;
            return false;
          })
        )
      );
    }

    return result;
  }, [workouts, filters.typeIds, filters.tagIds, filters.groupId, filters.exerciseSearch, filters.flags, exerciseGroupMap]);

  // For exercise-centric view: filter exercises within workouts too
  const exerciseFilteredWorkouts = useMemo(() => {
    if (!filters.exerciseSearch && !filters.groupId && filters.flags.size === 0)
      return filteredWorkouts;

    const search = filters.exerciseSearch?.toLowerCase() || "";

    return filteredWorkouts.map((w) => ({
      ...w,
      exercises: (w.exercises || []).filter((ex) => {
        if (search && !ex.exercise_name_display.toLowerCase().includes(search)) {
          return false;
        }
        if (filters.groupId && ex.exercise_id) {
          const gids = exerciseGroupMap.get(ex.exercise_id);
          if (!gids?.includes(filters.groupId)) return false;
        }
        if (filters.flags.size > 0) {
          const hasMatchingSet = (ex.sets || []).some((s) => {
            if (filters.flags.has("pr") && s.is_pr) return true;
            if (filters.flags.has("max") && s.is_cycle_max) return true;
            if (filters.flags.has("miss") && s.is_missed) return true;
            return false;
          });
          if (!hasMatchingSet) return false;
        }
        return true;
      }),
    })).filter((w) => (w.exercises || []).length > 0);
  }, [filteredWorkouts, filters.exerciseSearch, filters.groupId, filters.flags, exerciseGroupMap]);

  return (
    <main className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Workout Log</h1>
          <Badge variant="secondary">
            {filteredWorkouts.length}{" "}
            {filteredWorkouts.length === 1 ? "workout" : "workouts"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {filteredWorkouts.length} {filteredWorkouts.length === 1 ? "workout" : "workouts"}
            {filters.startDate || filters.endDate ? " in range" : " total"}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                const headers = await getAuthHeaders();
                const params = new URLSearchParams();
                if (filters.startDate) params.set("start", filters.startDate);
                if (filters.endDate) params.set("end", filters.endDate);
                const queryStr = params.toString();

                const res = await fetch(`/api/export/workout-log.csv${queryStr ? `?${queryStr}` : ""}`, { headers });
                if (!res.ok) {
                  let msg = `Export failed (${res.status})`;
                  try { const j = await res.json(); msg = j?.error || msg; } catch {}
                  throw new Error(msg);
                }

                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `workout-log${filters.startDate ? `_${filters.startDate}` : ""}${filters.endDate ? `_to_${filters.endDate}` : ""}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
              } catch (e: unknown) {
                alert(e instanceof Error ? e.message : String(e));
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Filters */}
      <WorkoutLogFilters
        filters={filters}
        onChange={setFilters}
        workoutTypes={workoutTypes}
        groups={groups}
        exercises={exercises}
        tags={tags}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="workout">Workout</TabsTrigger>
          <TabsTrigger value="exercise">Exercise</TabsTrigger>
        </TabsList>

        <TabsContent value="workout">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading...
            </div>
          ) : (
            <WorkoutCentricView
              workouts={filteredWorkouts}
              workoutTypes={workoutTypes}
              tags={tags}
            />
          )}
        </TabsContent>

        <TabsContent value="exercise">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading...
            </div>
          ) : (
            <ExerciseCentricView
              workouts={exerciseFilteredWorkouts}
              workoutTypes={workoutTypes}
              exercises={exercises}
            />
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}
