"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getAuthHeaders } from "@/lib/authHeaders";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import WorkoutTypeSelector from "./components/WorkoutTypeSelector";
import ExerciseGroupPanels from "./components/ExerciseGroupPanels";
import ExerciseBucket from "./components/ExerciseBucket";
import { type BucketExerciseData } from "./components/BucketExerciseRow";
import WorkoutRating from "./components/WorkoutRating";
import CustomExerciseSheet from "./components/CustomExerciseSheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { DurationPicker } from "@/components/ui/mobile-pickers";
import { getLocalDateString } from "@/lib/dateUtils";
import { usePageTour } from "@/hooks/usePageTour";
import "driver.js/dist/driver.css";

type WorkoutType = {
  id: string;
  name: string;
  group_ids: string[];
};

type ExerciseGroup = {
  id: string;
  name: string;
  short_code: string | null;
  input_type: string;
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
  adjective_order: number;
};

type WorkoutExercise = {
  id?: string;
  exercise_id?: string | null;
  exercise_name_display: string;
  modifier_ids?: string[];
  exercise_order?: number;
  superset_group?: number | null;
  sets: {
    set_number: number;
    reps: number | null;
    weight: number | null;
    is_pr: boolean;
    is_cycle_max: boolean;
    is_missed: boolean;
  }[];
  // Cardio/HIIT/sport fields
  duration_minutes?: number | null;
  distance_miles?: number | null;
  incline_pct?: number | null;
  weight?: number | null;
  time_on_seconds?: number | null;
  time_off_seconds?: number | null;
  cycles?: number | null;
  notes?: string | null;
};

type WorkoutHistory = {
  id: string;
  date: string;
  workout_type: string | null;
  workout_type_id: string | null;
  rating: number | null;
  duration_minutes: number | null;
  notes: string | null;
  exercises?: WorkoutExercise[];
  sets?: {
    exercise_name_display: string;
    set_number: number;
    reps: number | null;
    weight: number | null;
    is_pr: boolean;
    is_cycle_max: boolean;
    is_missed: boolean;
  }[];
};

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

export default function WorkoutsPage() {
  const isMobile = useMediaQuery("(max-width: 639px)");
  const searchParams = useSearchParams();
  const router = useRouter();

  // Data
  const [workoutTypes, setWorkoutTypes] = useState<WorkoutType[]>([]);
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutHistory[]>([]);
  const [ghostData, setGhostData] = useState<GhostData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [workoutDate, setWorkoutDate] = useState(
    getLocalDateString()
  );
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [bucketExercises, setBucketExercises] = useState<BucketExerciseData[]>([]);
  const [workoutNotes, setWorkoutNotes] = useState("");
  const [workoutRating, setWorkoutRating] = useState<number | null>(null);
  const [workoutDuration, setWorkoutDuration] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCustomSheet, setShowCustomSheet] = useState(false);
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);

  const bucketRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Tour
  const { completed: tourCompleted, complete: tourComplete, devReset: tourDevReset } = usePageTour("workouts");
  const tourLaunched = useRef(false);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();

      const [typesRes, groupsRes, exRes, modRes, workoutRes] = await Promise.all([
        fetch("/api/workouts/types", { headers }),
        fetch("/api/workouts/groups", { headers }),
        fetch("/api/workouts/exercises", { headers }),
        fetch("/api/workouts/modifiers", { headers }),
        fetch("/api/workouts?include_sets=true&limit=20", { headers }),
      ]);

      const [typesData, groupsData, exData, modData, workoutData] = await Promise.all([
        typesRes.ok ? typesRes.json() : [],
        groupsRes.ok ? groupsRes.json() : [],
        exRes.ok ? exRes.json() : [],
        modRes.ok ? modRes.json() : [],
        workoutRes.ok ? workoutRes.json() : [],
      ]);

      setWorkoutTypes(typesData);
      setGroups(groupsData);
      setExercises(exData);
      setModifiers(modData);
      setWorkouts(workoutData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch ghost data when bucket exercises change
  useEffect(() => {
    const exerciseIds = bucketExercises
      .map((be) => be.exercise_id)
      .filter((id): id is string => id !== null);

    // Only fetch for IDs we don't already have
    const newIds = exerciseIds.filter((id) => !(id in ghostData));
    if (newIds.length === 0) return;

    const fetchGhost = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/workouts/exercises/last-sets?exercise_ids=${newIds.join(",")}`,
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          setGhostData((prev) => ({ ...prev, ...data }));
        }
      } catch {
        // Ghost text is best-effort
      }
    };
    fetchGhost();
  }, [bucketExercises, ghostData]);

  // Get groups filtered by selected type, ordered by the type's group_ids array
  const displayGroups = selectedTypeId
    ? (() => {
        const type = workoutTypes.find((t) => t.id === selectedTypeId);
        if (!type) return groups;
        const groupMap = new Map(groups.map((g) => [g.id, g]));
        return type.group_ids
          .map((id) => groupMap.get(id))
          .filter((g): g is ExerciseGroup => !!g);
      })()
    : groups;

  const buildExerciseDisplayName = (exercise: Exercise, modifierIds: string[]) => {
    if (modifierIds.length === 0) return exercise.name;

    const sortedModifiers = modifierIds
      .map((id) => modifiers.find((m) => m.id === id))
      .filter(Boolean)
      .sort((a, b) => (a!.adjective_order || 0) - (b!.adjective_order || 0))
      .map((m) => m!.name);

    // If exercise name starts with "X ", modifiers replace the "X"
    if (exercise.name.startsWith("X ")) {
      const baseName = exercise.name.slice(2); // remove "X "
      return [...sortedModifiers, baseName].join(" ");
    }

    return [...sortedModifiers, exercise.name].join(" ");
  };

  // Determine input_type for an exercise based on its groups
  const getExerciseInputType = (exercise: Exercise): string => {
    for (const gid of exercise.group_ids) {
      const group = groups.find((g) => g.id === gid);
      if (group && group.input_type && group.input_type !== "strength") {
        return group.input_type;
      }
    }
    return "strength";
  };

  // Helper: convert seconds to "M:SS" string
  const secondsToTimeStr = (secs: number | null | undefined): string => {
    if (!secs) return "";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  // Helper: convert minutes to "h:mm:ss" or "mm:ss" display string
  const minutesToDurationStr = (mins: number | null | undefined): string => {
    if (!mins) return "";
    const totalSeconds = Math.round(mins * 60);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    if (s > 0) return `${m}:${String(s).padStart(2, "0")}`;
    return String(m);
  };

  const loadWorkoutForEdit = (workout: WorkoutHistory) => {
    // Confirm if there's unsaved data in the bucket
    if (
      bucketExercises.length > 0 &&
      !confirm("Loading a workout for editing will discard your current entry. Continue?")
    ) {
      return;
    }

    setEditingWorkoutId(workout.id);
    setWorkoutDate(workout.date);
    setSelectedTypeId(workout.workout_type_id || "");
    setWorkoutNotes(workout.notes || "");
    setWorkoutRating(workout.rating);
    setWorkoutDuration(minutesToDurationStr(workout.duration_minutes));

    // Convert WorkoutExercise[] to BucketExerciseData[]
    const bucketData: BucketExerciseData[] = (workout.exercises || []).map((ex) => {
      // Determine input_type: check the exercise's groups if we have the exercise_id
      let inputType = "strength";
      if (ex.exercise_id) {
        const exerciseDef = exercises.find((e) => e.id === ex.exercise_id);
        if (exerciseDef) {
          inputType = getExerciseInputType(exerciseDef);
        }
      }
      // If no sets but has cardio/hiit/sport data, infer type
      if (inputType === "strength" && (!ex.sets || ex.sets.length === 0)) {
        if (ex.time_on_seconds || ex.time_off_seconds || ex.cycles) inputType = "hiit";
        else if (ex.duration_minutes || ex.distance_miles || ex.incline_pct) inputType = "cardio";
        else if (ex.notes) inputType = "sport";
      }

      return {
        id: crypto.randomUUID(),
        exercise_id: ex.exercise_id || null,
        exercise_name_display: ex.exercise_name_display,
        modifier_ids: ex.modifier_ids || [],
        input_type: inputType,
        sets: inputType === "strength" && ex.sets && ex.sets.length > 0
          ? ex.sets.map((s) => ({
              reps: s.reps !== null ? String(s.reps) : "",
              weight: s.weight !== null ? String(s.weight) : "",
              is_pr: s.is_pr,
              is_cycle_max: s.is_cycle_max,
              is_missed: s.is_missed,
            }))
          : inputType === "strength"
            ? Array.from({ length: 5 }, () => ({
                reps: "",
                weight: "",
                is_pr: false,
                is_cycle_max: false,
                is_missed: false,
              }))
            : [],
        superset_group: ex.superset_group ?? null,
        duration_minutes: ex.duration_minutes != null ? String(ex.duration_minutes) : "",
        distance_miles: ex.distance_miles != null ? String(ex.distance_miles) : "",
        incline_pct: ex.incline_pct != null ? String(ex.incline_pct) : "",
        cardio_weight: ex.weight != null ? String(ex.weight) : "",
        cycles: ex.cycles != null ? String(ex.cycles) : "",
        time_on: secondsToTimeStr(ex.time_on_seconds),
        time_off: secondsToTimeStr(ex.time_off_seconds),
        exercise_notes: ex.notes || "",
      };
    });

    setBucketExercises(bucketData);

    // Scroll to form
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  // Load workout for editing from ?edit=<id> query param
  const editParamHandled = useRef(false);
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || loading || editParamHandled.current) return;
    editParamHandled.current = true;

    // Check if the workout is already in the recent workouts list
    const existing = workouts.find((w) => w.id === editId);
    if (existing) {
      loadWorkoutForEdit(existing);
      router.replace("/workouts", { scroll: false });
      return;
    }

    // Fetch the workout by ID
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/workouts/${editId}`, { headers });
        if (!res.ok) {
          setError("Could not load workout for editing");
          return;
        }
        const workout = await res.json();
        loadWorkoutForEdit(workout);
        router.replace("/workouts", { scroll: false });
      } catch {
        setError("Could not load workout for editing");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading, workouts]);

  const handleAddToBucket = (exercise: Exercise, selectedModifiers: string[]) => {
    const displayName = buildExerciseDisplayName(exercise, selectedModifiers);
    const inputType = getExerciseInputType(exercise);
    const newEntry: BucketExerciseData = {
      id: crypto.randomUUID(),
      exercise_id: exercise.id,
      exercise_name_display: displayName,
      modifier_ids: selectedModifiers,
      input_type: inputType,
      sets: inputType === "strength"
        ? Array.from({ length: 5 }, () => ({
            reps: "",
            weight: "",
            is_pr: false,
            is_cycle_max: false,
            is_missed: false,
          }))
        : [],
      superset_group: null,
      duration_minutes: "",
      distance_miles: "",
      incline_pct: "",
      cardio_weight: "",
      cycles: "",
      time_on: "",
      time_off: "",
      exercise_notes: "",
    };

    setBucketExercises((prev) => [...prev, newEntry]);
  };

  const handleCustomExerciseCreated = (exercise: {
    id: string;
    name: string;
    exercise_type: string;
    group_ids: string[];
    available_modifier_ids: string[];
  }) => {
    // Add to local exercises list
    setExercises((prev) => [...prev, exercise as Exercise]);

    const inputType = getExerciseInputType(exercise as Exercise);
    const newEntry: BucketExerciseData = {
      id: crypto.randomUUID(),
      exercise_id: exercise.id,
      exercise_name_display: exercise.name,
      modifier_ids: [],
      input_type: inputType,
      sets: inputType === "strength"
        ? Array.from({ length: 5 }, () => ({
            reps: "",
            weight: "",
            is_pr: false,
            is_cycle_max: false,
            is_missed: false,
          }))
        : [],
      superset_group: null,
      duration_minutes: "",
      distance_miles: "",
      incline_pct: "",
      cardio_weight: "",
      cycles: "",
      time_on: "",
      time_off: "",
      exercise_notes: "",
    };
    setBucketExercises((prev) => [...prev, newEntry]);
  };

  // Parse "h:mm:ss" or "mm:ss" or "mm" to total minutes
  const parseDurationToMinutes = (dur: string): number | null => {
    if (!dur) return null;
    const parts = dur.split(":").map((p) => parseInt(p) || 0);
    if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
    if (parts.length === 2) return parts[0] + parts[1] / 60;
    if (parts.length === 1) return parts[0];
    return null;
  };

  // Parse "M:SS" time format to total seconds
  const parseTimeToSeconds = (time: string): number | null => {
    if (!time) return null;
    const parts = time.split(":");
    if (parts.length === 2) {
      const mins = parseInt(parts[0]) || 0;
      const secs = parseInt(parts[1]) || 0;
      return mins * 60 + secs;
    }
    // Just seconds
    const secs = parseInt(time);
    return isNaN(secs) ? null : secs;
  };

  const handleSave = async () => {
    // Filter out exercises with no data at all
    const exercisesWithData = bucketExercises.filter((ex) => {
      if (ex.input_type === "strength") {
        return ex.sets.some((s) => s.reps || s.weight);
      }
      if (ex.input_type === "hiit") {
        return ex.time_on || ex.time_off || ex.cycles;
      }
      if (ex.input_type === "cardio") {
        return ex.duration_minutes || ex.distance_miles || ex.incline_pct || ex.cardio_weight;
      }
      if (ex.input_type === "sport") {
        return true; // always save sport exercises if in bucket
      }
      return ex.sets.some((s) => s.reps || s.weight);
    });

    if (exercisesWithData.length === 0) {
      setError("Add at least one exercise with data before saving");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();

      const exercisesPayload = exercisesWithData.map((ex, index) => {
        // Filter out empty trailing sets (strength only)
        const filledSets = ex.input_type === "strength"
          ? ex.sets
              .map((s, i) => ({ ...s, set_number: i + 1 }))
              .filter((s) => s.reps || s.weight)
          : [];

        return {
          exercise_id: ex.exercise_id,
          exercise_name_display: ex.exercise_name_display,
          modifier_ids: ex.modifier_ids,
          exercise_order: index,
          superset_group: ex.superset_group,
          input_type: ex.input_type,
          sets: filledSets.map((s) => ({
            set_number: s.set_number,
            reps: s.reps ? parseInt(s.reps) : null,
            weight: s.weight ? parseFloat(s.weight) : null,
            is_pr: s.is_pr,
            is_cycle_max: s.is_cycle_max,
            is_missed: s.is_missed,
          })),
          // Cardio fields
          duration_minutes: ex.duration_minutes ? parseFloat(ex.duration_minutes) : null,
          distance_miles: ex.distance_miles ? parseFloat(ex.distance_miles) : null,
          incline_pct: ex.incline_pct ? parseFloat(ex.incline_pct) : null,
          weight: ex.cardio_weight ? parseFloat(ex.cardio_weight) : null,
          // HIIT fields
          time_on_seconds: parseTimeToSeconds(ex.time_on),
          time_off_seconds: parseTimeToSeconds(ex.time_off),
          cycles: ex.cycles ? parseInt(ex.cycles) : null,
          // Notes
          notes: ex.exercise_notes || null,
        };
      });

      const payload = {
        date: workoutDate,
        workout_type_id: selectedTypeId || null,
        location: "Garage",
        rating: workoutRating,
        duration_minutes: workoutDuration ? parseDurationToMinutes(workoutDuration) : null,
        notes: workoutNotes || null,
        exercises: exercisesPayload,
      };

      const url = editingWorkoutId
        ? `/api/workouts/${editingWorkoutId}`
        : "/api/workouts";
      const method = editingWorkoutId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to save workout");
      }

      // Check for partial success (207 - workout created but exercises/sets failed)
      if (res.status === 207 || json.error) {
        setError(`Workout saved partially: ${json.error}`);
      }

      // Reset form
      resetForm();
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save workout");
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setEditingWorkoutId(null);
    setWorkoutDate(getLocalDateString());
    setSelectedTypeId("");
    setBucketExercises([]);
    setWorkoutNotes("");
    setWorkoutRating(null);
    setWorkoutDuration("");
    setGhostData({});
  };

  const handleCancel = () => {
    const msg = editingWorkoutId
      ? "Discard changes to this workout?"
      : "Discard current workout entry?";
    if (bucketExercises.length > 0 && !confirm(msg)) {
      return;
    }
    resetForm();
  };

  const deleteWorkout = async (id: string) => {
    if (!confirm("Delete this workout?")) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`/api/workouts/${id}`, { method: "DELETE", headers });
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete workout");
    }
  };

  const clearAllData = async () => {
    if (!confirm("This will DELETE ALL workout data. Are you sure?")) return;
    if (!confirm("FINAL WARNING: This cannot be undone.")) return;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/workouts/dev", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clear_all_workout_data",
          confirm: "DELETE_ALL_MY_WORKOUT_DATA",
        }),
      });
      const json = await res.json();
      alert(json.message || "Data cleared");
      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear data");
    }
  };

  // Group legacy sets by exercise for history display
  const groupSetsByExercise = (
    sets: NonNullable<WorkoutHistory["sets"]>
  ) => {
    const grouped: { name: string; sets: typeof sets }[] = [];
    let currentName = "";
    let currentGroup: typeof sets = [];

    for (const set of sets) {
      if (set.exercise_name_display !== currentName) {
        if (currentGroup.length > 0) {
          grouped.push({ name: currentName, sets: currentGroup });
        }
        currentName = set.exercise_name_display;
        currentGroup = [set];
      } else {
        currentGroup.push(set);
      }
    }
    if (currentGroup.length > 0) {
      grouped.push({ name: currentName, sets: currentGroup });
    }
    return grouped;
  };

  const getTypeName = (typeId: string | null) => {
    if (!typeId) return null;
    return workoutTypes.find((t) => t.id === typeId)?.name || null;
  };

  // --- Workouts Tour ---
  const launchWorkoutsTour = useCallback(() => {
    import("driver.js").then(({ driver }) => {
      const driverObj = driver({
        animate: true,
        showProgress: true,
        allowClose: false,
        steps: [
          {
            popover: {
              title: "Your Workout Log",
              description:
                "Log every session, track sets and reps, see PRs auto-detected, and review your full history. Supports strength, cardio, HIIT, and sport activities.",
              nextBtnText: "Next →",
            },
          },
          {
            element: "[data-tour='workout-entry-card']",
            popover: {
              title: "Logging a Workout",
              description:
                "Pick a date and workout type. Exercise groups appear so you can click any exercise to add it to your session. Your last session's numbers show as hints in each set — so you always know what to beat.",
              side: "bottom",
              align: "start",
              nextBtnText: "Next →",
            },
          },
          {
            element: "[data-tour='exercise-library-btn']",
            popover: {
              title: "Exercise Library",
              description:
                "Set up your workout types, muscle groups, and exercises here before your first session. You can also create custom exercises and add modifiers (e.g. 'Paused', 'Wide Grip').",
              side: "bottom",
              align: "end",
              nextBtnText: "Next →",
            },
          },
          {
            element: "[data-tour='recent-workouts-section']",
            popover: {
              title: "Recent Workouts",
              description:
                "Your 20 most recent sessions appear here. PRs are highlighted in amber, cycle maxes in green, missed sets in red. Click Edit to load any past workout for editing.",
              side: "top",
              align: "start",
              nextBtnText: "Next →",
            },
          },
          {
            popover: {
              title: "Quick Stats & Full History",
              description:
                "Hover any exercise name in your history for a quick stats preview — tonnage trend, last session, and all-time PR. Use the Log page (in the nav) for your full history with date filters and an exercise-centric view.",
              nextBtnText: "Got it!",
              onNextClick: () => {
                driverObj.destroy();
                tourComplete();
              },
            },
          },
        ],
      });
      driverObj.drive();
    });
  }, [tourComplete]);

  // Auto-launch on first visit when no workouts logged
  useEffect(() => {
    if (loading || tourCompleted || tourLaunched.current) return;
    if (workouts.length > 0) return;
    tourLaunched.current = true;
    setTimeout(launchWorkoutsTour, 400);
  }, [loading, tourCompleted, workouts.length, launchWorkoutsTour]);

  if (loading) {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Workouts</h1>
        <p className="text-muted-foreground">Loading...</p>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Workouts</h1>
          {tourCompleted && (
            <button
              onClick={() => { tourDevReset(); setTimeout(launchWorkoutsTour, 50); }}
              className="text-xs text-muted-foreground hover:text-foreground border rounded-full w-5 h-5 flex items-center justify-center"
              title="Replay tour"
            >
              ?
            </button>
          )}
        </div>
        <Link href="/workouts/exercises">
          <Button data-tour="exercise-library-btn" variant="outline" size="sm">
            Exercise Library
          </Button>
        </Link>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* ── WORKOUT ENTRY AREA ── */}
      <Card ref={formRef} data-tour="workout-entry-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {editingWorkoutId ? "Edit Workout" : "Log Workout"}
            </CardTitle>
            {editingWorkoutId && (
              <span className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-0.5 rounded">
                Editing {workoutDate}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date + Type row */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs text-muted-foreground">Date</label>
              <input
                type="date"
                value={workoutDate}
                onChange={(e) => setWorkoutDate(e.target.value)}
                className="block w-[160px] h-9 px-3 border rounded-md text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <WorkoutTypeSelector
                types={workoutTypes}
                value={selectedTypeId}
                onChange={setSelectedTypeId}
              />
            </div>
          </div>

          {/* Group Panels - only show after type is selected */}
          {selectedTypeId && (
            <ExerciseGroupPanels
              groups={displayGroups}
              exercises={exercises}
              modifiers={modifiers}
              onAddToBucket={handleAddToBucket}
              onCustomExercise={() => setShowCustomSheet(true)}
            />
          )}

          {/* Exercise Bucket */}
          {selectedTypeId && (
            <div ref={bucketRef}>
              <ExerciseBucket
                exercises={bucketExercises}
                ghostData={ghostData}
                onExercisesChange={setBucketExercises}
              />
            </div>
          )}

          {/* Notes + Rating + Save/Cancel - only show after type is selected */}
          {selectedTypeId && (
            <>
              <div className="flex flex-wrap items-end gap-4 border-t pt-4">
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs text-muted-foreground">Notes</label>
                  <textarea
                    value={workoutNotes}
                    onChange={(e) => setWorkoutNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border rounded-md text-sm resize-none"
                    placeholder="How did it go?"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Duration</label>
                  {isMobile ? (
                    <DurationPicker
                      value={workoutDuration ? parseDurationToMinutes(workoutDuration) : null}
                      onChange={(mins) => setWorkoutDuration(minutesToDurationStr(mins))}
                    />
                  ) : (
                    <input
                      type="text"
                      value={workoutDuration}
                      onChange={(e) => setWorkoutDuration(e.target.value)}
                      placeholder="h:mm:ss"
                      className="w-24 px-3 py-2 border rounded-md text-sm tabular-nums"
                    />
                  )}
                </div>
                <WorkoutRating value={workoutRating} onChange={setWorkoutRating} />
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={saving}>
                  {saving
                    ? "Saving..."
                    : editingWorkoutId
                      ? "Update Workout"
                      : "Save Workout"}
                </Button>
                <Button variant="outline" onClick={handleCancel}>
                  {editingWorkoutId ? "Cancel Edit" : "Cancel"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── RECENT WORKOUTS ── */}
      <div data-tour="recent-workouts-section" className="space-y-4">
        <h2 className="text-lg font-medium">Recent Workouts</h2>
        {workouts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No workouts logged yet.
            </CardContent>
          </Card>
        ) : (
          workouts.map((workout) => {
            const typeName =
              getTypeName(workout.workout_type_id) ||
              workout.workout_type?.replace("_", " ") ||
              null;

            const hasExercises =
              workout.exercises && workout.exercises.length > 0;

            // Superset color palette - vibrant, distinct colors
            const supersetColors = [
              { border: "border-l-blue-400", bg: "bg-blue-400/10" },
              { border: "border-l-green-500", bg: "bg-green-500/10" },
              { border: "border-l-red-400", bg: "bg-red-400/10" },
              { border: "border-l-orange-400", bg: "bg-orange-400/10" },
              { border: "border-l-purple-400", bg: "bg-purple-400/10" },
            ];

            // Map superset_group numbers to color indices
            const supersetGroupNums = new Set<number>();
            for (const ex of workout.exercises || []) {
              if (ex.superset_group != null) supersetGroupNums.add(ex.superset_group);
            }
            const supersetColorMap = new Map<number, number>();
            let colorIdx = 0;
            for (const g of supersetGroupNums) {
              supersetColorMap.set(g, colorIdx % supersetColors.length);
              colorIdx++;
            }

            // Calculate total workout tonnage
            let workoutTonnage = 0;
            if (hasExercises) {
              for (const ex of workout.exercises!) {
                if (ex.sets) {
                  for (const s of ex.sets) {
                    workoutTonnage += (s.reps || 0) * (s.weight || 0);
                  }
                }
              }
            }

            return (
              <Card key={workout.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {workout.date}
                        {typeName && (
                          <span className="text-muted-foreground font-normal ml-2">
                            {typeName}
                          </span>
                        )}
                        {workout.duration_minutes && (
                          <span className="text-muted-foreground font-normal ml-2 text-xs">
                            {workout.duration_minutes >= 60
                              ? `${Math.floor(workout.duration_minutes / 60)}h ${Math.round(workout.duration_minutes % 60)}m`
                              : `${Math.round(workout.duration_minutes)}m`}
                          </span>
                        )}
                        {workout.rating && (
                          <span className="text-muted-foreground font-normal ml-2 text-xs">
                            {"*".repeat(workout.rating)}/5
                          </span>
                        )}
                      </CardTitle>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadWorkoutForEdit(workout)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteWorkout(workout.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {hasExercises ? (
                    <div>
                      <table className="w-full text-sm border-collapse">
                        <tbody>
                          {workout.exercises!.map((ex, i) => {
                            const hasSets = ex.sets && ex.sets.length > 0;
                            const hasCardioData = ex.duration_minutes || ex.distance_miles || ex.incline_pct || ex.weight;
                            const hasHiitData = ex.time_on_seconds || ex.time_off_seconds || ex.cycles;

                            const exTonnage = hasSets
                              ? ex.sets.reduce((sum, s) => sum + (s.reps || 0) * (s.weight || 0), 0)
                              : 0;

                            const ssGroup = ex.superset_group;
                            const ssColorIdx = ssGroup != null ? supersetColorMap.get(ssGroup) : undefined;
                            const ssStyle = ssColorIdx != null ? supersetColors[ssColorIdx] : null;

                            let detailElements: React.ReactNode = null;
                            if (hasSets) {
                              detailElements = (
                                <span className="text-muted-foreground">
                                  {ex.sets.map((s, si) => (
                                    <span key={si}>
                                      {si > 0 && ", "}
                                      {s.is_pr ? (
                                        <span className="inline-block px-1.5 py-0.5 rounded text-xs border border-amber-600/30 bg-amber-600/10 text-amber-700">
                                          {s.reps || 0}x{s.weight || 0}
                                        </span>
                                      ) : s.is_cycle_max ? (
                                        <span className="inline-block px-1.5 py-0.5 rounded text-xs border border-emerald-700/30 bg-emerald-700/10 text-emerald-700">
                                          {s.reps || 0}x{s.weight || 0}
                                        </span>
                                      ) : s.is_missed ? (
                                        <span className="inline-block px-1.5 py-0.5 rounded text-xs border border-red-700/30 bg-red-700/10 text-red-700">
                                          {s.reps || 0}x{s.weight || 0}
                                        </span>
                                      ) : (
                                        <span>{s.reps || 0}x{s.weight || 0}</span>
                                      )}
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
                              if (ex.time_on_seconds) parts.push(`On ${Math.floor(ex.time_on_seconds / 60)}:${String(ex.time_on_seconds % 60).padStart(2, "0")}`);
                              if (ex.time_off_seconds) parts.push(`Off ${Math.floor(ex.time_off_seconds / 60)}:${String(ex.time_off_seconds % 60).padStart(2, "0")}`);
                              if (ex.cycles) parts.push(`${ex.cycles} cycles`);
                              detailElements = <span className="text-muted-foreground">{parts.join(", ")}</span>;
                            } else if (hasCardioData) {
                              const parts: string[] = [];
                              if (ex.duration_minutes) parts.push(`${ex.duration_minutes} min`);
                              if (ex.distance_miles) parts.push(`${ex.distance_miles} mi`);
                              if (ex.incline_pct) parts.push(`${ex.incline_pct}% incline`);
                              if (ex.weight) parts.push(`${ex.weight} lbs`);
                              detailElements = <span className="text-muted-foreground">{parts.join(", ")}</span>;
                            }

                            return (
                              <tr
                                key={i}
                                className={cn(
                                  ssStyle && `border-l-2 ${ssStyle.border} ${ssStyle.bg}`
                                )}
                              >
                                <td className="text-right font-medium pr-3 py-1 whitespace-nowrap align-top">
                                  {ex.exercise_name_display}
                                </td>
                                <td className="w-px bg-border py-1" />
                                <td className="pl-3 py-1 tabular-nums align-top">
                                  {detailElements}
                                  {ex.notes && (
                                    <span className="text-muted-foreground italic ml-2 text-xs">
                                      {ex.notes}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {workoutTonnage > 0 && (
                        <div className="text-xs text-muted-foreground/60 text-right pt-2 border-t mt-2">
                          Total tonnage: {workoutTonnage.toLocaleString()} lbs
                        </div>
                      )}
                    </div>
                  ) : workout.sets && workout.sets.length > 0 ? (
                    <table className="w-full text-sm border-collapse">
                      <tbody>
                        {groupSetsByExercise(workout.sets).map((group, gIdx) => (
                          <tr key={gIdx}>
                            <td className="text-right font-medium pr-3 py-1 whitespace-nowrap align-top">
                              {group.name}
                            </td>
                            <td className="w-px bg-border py-1" />
                            <td className="pl-3 py-1 text-muted-foreground tabular-nums align-top">
                              {group.sets.map((s, si) => (
                                <span key={si}>
                                  {si > 0 && ", "}
                                  {s.is_pr ? (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-xs border border-amber-600/30 bg-amber-600/10 text-amber-700">
                                      {s.reps || 0}x{s.weight || 0}
                                    </span>
                                  ) : s.is_cycle_max ? (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-xs border border-emerald-700/30 bg-emerald-700/10 text-emerald-700">
                                      {s.reps || 0}x{s.weight || 0}
                                    </span>
                                  ) : s.is_missed ? (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-xs border border-red-700/30 bg-red-700/10 text-red-700">
                                      {s.reps || 0}x{s.weight || 0}
                                    </span>
                                  ) : (
                                    <span>{s.reps || 0}x{s.weight || 0}</span>
                                  )}
                                </span>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No sets recorded
                    </p>
                  )}
                  {workout.notes && (
                    <p className="text-sm text-muted-foreground mt-2 italic">
                      {workout.notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* ── DEV TOOLS ── */}
      <Card className="border-dashed border-orange-500/50">
        <CardHeader>
          <CardTitle className="text-base text-orange-600">Dev Tools</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size="sm" onClick={clearAllData}>
            Clear All Workout Data
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            This will delete all workouts, exercises, groups, and modifiers.
          </p>
        </CardContent>
      </Card>

      {/* Custom Exercise Sheet */}
      <CustomExerciseSheet
        open={showCustomSheet}
        onOpenChange={setShowCustomSheet}
        groups={groups}
        modifiers={modifiers}
        onCreated={handleCustomExerciseCreated}
      />

      {process.env.NODE_ENV === "development" && (
        <div className="fixed bottom-4 right-4 z-50">
          <Button
            onClick={() => {
              tourDevReset();
              tourLaunched.current = false;
            }}
          >
            Reset Tour ({tourCompleted ? "completed" : "not started"})
          </Button>
        </div>
      )}
    </main>
  );
}
