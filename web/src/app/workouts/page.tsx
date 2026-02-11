"use client";

import { useEffect, useState, useCallback } from "react";
import { getAuthHeaders } from "@/lib/authHeaders";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type WorkoutSet = {
  id: string;
  exercise_name_display: string;
  set_number: number;
  set_type: string;
  reps: number | null;
  weight: number | null;
  is_pr: boolean;
  is_cycle_max: boolean;
  is_missed: boolean;
};

type Workout = {
  id: string;
  date: string;
  workout_type: string | null;
  location: string | null;
  duration_minutes: number | null;
  body_weight: number | null;
  notes: string | null;
  sets?: WorkoutSet[];
};

type Category = {
  id: string;
  name: string;
  short_code: string | null;
};

type Exercise = {
  id: string;
  name: string;
  exercise_type: string;
  category_ids: string[];
  available_modifier_ids: string[];
};

type Modifier = {
  id: string;
  name: string;
  adjective_order: number;
};

export default function WorkoutsPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New workout form state
  const [showNewWorkout, setShowNewWorkout] = useState(false);
  const [newWorkoutDate, setNewWorkoutDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [newWorkoutType, setNewWorkoutType] = useState("");
  const [newWorkoutLocation, setNewWorkoutLocation] = useState("");
  const [newWorkoutNotes, setNewWorkoutNotes] = useState("");
  const [newWorkoutBodyWeight, setNewWorkoutBodyWeight] = useState("");
  const [newWorkoutSets, setNewWorkoutSets] = useState<
    {
      exercise_id: string;
      exercise_name_display: string;
      modifier_ids: string[];
      set_number: number;
      reps: string;
      weight: string;
      is_pr: boolean;
      is_cycle_max: boolean;
      is_missed: boolean;
    }[]
  >([]);

  // For adding sets
  const [selectedExerciseId, setSelectedExerciseId] = useState("");
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();

      const [workoutRes, catRes, exRes, modRes] = await Promise.all([
        fetch("/api/workouts?include_sets=true&limit=20", { headers }),
        fetch("/api/workouts/categories", { headers }),
        fetch("/api/workouts/exercises", { headers }),
        fetch("/api/workouts/modifiers", { headers }),
      ]);

      if (!workoutRes.ok) throw new Error("Failed to load workouts");

      const [workoutData, catData, exData, modData] = await Promise.all([
        workoutRes.json(),
        catRes.ok ? catRes.json() : [],
        exRes.ok ? exRes.json() : [],
        modRes.ok ? modRes.json() : [],
      ]);

      setWorkouts(workoutData);
      setCategories(catData);
      setExercises(exData);
      setModifiers(modData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const buildExerciseDisplayName = (exerciseId: string, modifierIds: string[]) => {
    const exercise = exercises.find((e) => e.id === exerciseId);
    if (!exercise) return "Unknown Exercise";

    if (modifierIds.length === 0) return exercise.name;

    // Sort modifiers by adjective_order
    const sortedModifiers = modifierIds
      .map((id) => modifiers.find((m) => m.id === id))
      .filter(Boolean)
      .sort((a, b) => (a!.adjective_order || 0) - (b!.adjective_order || 0))
      .map((m) => m!.name);

    return [...sortedModifiers, exercise.name].join(" ");
  };

  const addSetToNewWorkout = () => {
    if (!selectedExerciseId) return;

    const displayName = buildExerciseDisplayName(selectedExerciseId, selectedModifiers);
    const existingSetsForExercise = newWorkoutSets.filter(
      (s) => s.exercise_id === selectedExerciseId &&
        JSON.stringify(s.modifier_ids.sort()) === JSON.stringify([...selectedModifiers].sort())
    );

    setNewWorkoutSets([
      ...newWorkoutSets,
      {
        exercise_id: selectedExerciseId,
        exercise_name_display: displayName,
        modifier_ids: [...selectedModifiers],
        set_number: existingSetsForExercise.length + 1,
        reps: "",
        weight: "",
        is_pr: false,
        is_cycle_max: false,
        is_missed: false,
      },
    ]);
  };

  const updateSet = (
    index: number,
    field: string,
    value: string | boolean
  ) => {
    const updated = [...newWorkoutSets];
    updated[index] = { ...updated[index], [field]: value };
    setNewWorkoutSets(updated);
  };

  const removeSet = (index: number) => {
    setNewWorkoutSets(newWorkoutSets.filter((_, i) => i !== index));
  };

  const saveNewWorkout = async () => {
    try {
      const headers = await getAuthHeaders();

      const sets = newWorkoutSets.map((s, idx) => ({
        exercise_id: s.exercise_id,
        exercise_name_display: s.exercise_name_display,
        modifier_ids: s.modifier_ids,
        set_order: idx,
        set_number: s.set_number,
        set_type: "working",
        reps: s.reps ? parseInt(s.reps) : null,
        weight: s.weight ? parseFloat(s.weight) : null,
        is_pr: s.is_pr,
        is_cycle_max: s.is_cycle_max,
        is_missed: s.is_missed,
      }));

      const res = await fetch("/api/workouts", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          date: newWorkoutDate,
          workout_type: newWorkoutType || null,
          location: newWorkoutLocation || null,
          body_weight: newWorkoutBodyWeight ? parseFloat(newWorkoutBodyWeight) : null,
          notes: newWorkoutNotes || null,
          sets,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to save workout");
      }

      // Reset form
      setShowNewWorkout(false);
      setNewWorkoutDate(new Date().toISOString().slice(0, 10));
      setNewWorkoutType("");
      setNewWorkoutLocation("");
      setNewWorkoutNotes("");
      setNewWorkoutBodyWeight("");
      setNewWorkoutSets([]);
      setSelectedExerciseId("");
      setSelectedModifiers([]);

      fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save workout");
    }
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
    if (!confirm("FINAL WARNING: This cannot be undone. Type 'yes' to confirm.")) return;

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

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  };

  // Group sets by exercise for display
  const groupSetsByExercise = (sets: WorkoutSet[]) => {
    const groups: { name: string; sets: WorkoutSet[] }[] = [];
    let currentName = "";
    let currentGroup: WorkoutSet[] = [];

    for (const set of sets) {
      if (set.exercise_name_display !== currentName) {
        if (currentGroup.length > 0) {
          groups.push({ name: currentName, sets: currentGroup });
        }
        currentName = set.exercise_name_display;
        currentGroup = [set];
      } else {
        currentGroup.push(set);
      }
    }
    if (currentGroup.length > 0) {
      groups.push({ name: currentName, sets: currentGroup });
    }
    return groups;
  };

  const getExerciseModifiers = (exerciseId: string) => {
    const exercise = exercises.find((e) => e.id === exerciseId);
    if (!exercise) return [];
    return modifiers.filter((m) => exercise.available_modifier_ids.includes(m.id));
  };

  if (loading) {
    return (
      <main className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4">Workouts</h1>
        <p className="text-muted-foreground">Loading...</p>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold">Workouts</h1>
        <div className="flex gap-2">
          <Link href="/workouts/exercises">
            <Button variant="outline" size="sm">
              Exercise Library
            </Button>
          </Link>
          <Button onClick={() => setShowNewWorkout(!showNewWorkout)} size="sm">
            {showNewWorkout ? "Cancel" : "New Workout"}
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

      {/* New Workout Form */}
      {showNewWorkout && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Log Workout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Date</label>
                <input
                  type="date"
                  value={newWorkoutDate}
                  onChange={(e) => setNewWorkoutDate(e.target.value)}
                  className="w-full h-9 px-3 border rounded-md text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Type</label>
                <Select value={newWorkoutType} onValueChange={setNewWorkoutType}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="squat_day">Squat Day</SelectItem>
                    <SelectItem value="bench_day">Bench Day</SelectItem>
                    <SelectItem value="deadlift_day">Deadlift Day</SelectItem>
                    <SelectItem value="cardio">Cardio</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Location</label>
                <input
                  type="text"
                  value={newWorkoutLocation}
                  onChange={(e) => setNewWorkoutLocation(e.target.value)}
                  placeholder="e.g., Garage"
                  className="w-full h-9 px-3 border rounded-md text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Body Weight</label>
                <input
                  type="number"
                  value={newWorkoutBodyWeight}
                  onChange={(e) => setNewWorkoutBodyWeight(e.target.value)}
                  placeholder="lbs"
                  className="w-full h-9 px-3 border rounded-md text-sm"
                />
              </div>
            </div>

            {/* Add Exercise */}
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">Add Sets</p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[200px]">
                  <Select value={selectedExerciseId} onValueChange={(v) => {
                    setSelectedExerciseId(v);
                    setSelectedModifiers([]);
                  }}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select exercise..." />
                    </SelectTrigger>
                    <SelectContent>
                      {exercises.map((ex) => (
                        <SelectItem key={ex.id} value={ex.id}>
                          {ex.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={addSetToNewWorkout} size="sm" disabled={!selectedExerciseId}>
                  + Add Set
                </Button>
              </div>

              {/* Modifiers for selected exercise */}
              {selectedExerciseId && getExerciseModifiers(selectedExerciseId).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {getExerciseModifiers(selectedExerciseId).map((mod) => (
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
            </div>

            {/* Sets List */}
            {newWorkoutSets.length > 0 && (
              <div className="border-t pt-4 space-y-2">
                <p className="text-sm font-medium">Sets</p>
                {newWorkoutSets.map((set, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className="w-48 truncate">{set.exercise_name_display}</span>
                    <span className="text-muted-foreground">#{set.set_number}</span>
                    <input
                      type="number"
                      placeholder="Reps"
                      value={set.reps}
                      onChange={(e) => updateSet(idx, "reps", e.target.value)}
                      className="w-16 h-8 px-2 border rounded text-sm"
                    />
                    <span className="text-muted-foreground">x</span>
                    <input
                      type="number"
                      placeholder="Weight"
                      value={set.weight}
                      onChange={(e) => updateSet(idx, "weight", e.target.value)}
                      className="w-20 h-8 px-2 border rounded text-sm"
                    />
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={set.is_pr}
                        onChange={(e) => updateSet(idx, "is_pr", e.target.checked)}
                      />
                      PR
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={set.is_cycle_max}
                        onChange={(e) => updateSet(idx, "is_cycle_max", e.target.checked)}
                      />
                      Max
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={set.is_missed}
                        onChange={(e) => updateSet(idx, "is_missed", e.target.checked)}
                      />
                      Miss
                    </label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSet(idx)}
                      className="h-8 px-2"
                    >
                      x
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="text-xs text-muted-foreground">Notes</label>
              <textarea
                value={newWorkoutNotes}
                onChange={(e) => setNewWorkoutNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border rounded-md text-sm resize-none"
              />
            </div>

            {/* Save */}
            <Button onClick={saveNewWorkout}>Save Workout</Button>
          </CardContent>
        </Card>
      )}

      {/* Workout History */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium">Recent Workouts</h2>
        {workouts.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No workouts logged yet. Click "New Workout" to get started.
            </CardContent>
          </Card>
        ) : (
          workouts.map((workout) => (
            <Card key={workout.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {workout.date}
                      {workout.workout_type && (
                        <span className="text-muted-foreground font-normal ml-2">
                          {workout.workout_type.replace("_", " ")}
                        </span>
                      )}
                    </CardTitle>
                    {(workout.location || workout.duration_minutes || workout.body_weight) && (
                      <p className="text-xs text-muted-foreground">
                        {[
                          workout.location,
                          formatDuration(workout.duration_minutes),
                          workout.body_weight ? `${workout.body_weight} lbs` : null,
                        ]
                          .filter(Boolean)
                          .join(" • ")}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteWorkout(workout.id)}
                  >
                    Delete
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {workout.sets && workout.sets.length > 0 ? (
                  <div className="space-y-2">
                    {groupSetsByExercise(workout.sets).map((group, gIdx) => (
                      <div key={gIdx} className="text-sm">
                        <span className="font-medium">{group.name}:</span>{" "}
                        <span className="text-muted-foreground">
                          {group.sets
                            .map((s) => {
                              let str = `${s.reps || 0}x${s.weight || 0}`;
                              if (s.is_pr) str += " PR";
                              if (s.is_cycle_max) str += " MAX";
                              if (s.is_missed) str += " MISS";
                              return str;
                            })
                            .join(", ")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No sets recorded</p>
                )}
                {workout.notes && (
                  <p className="text-sm text-muted-foreground mt-2 italic">
                    {workout.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Dev Tools */}
      <Card className="border-dashed border-orange-500/50">
        <CardHeader>
          <CardTitle className="text-base text-orange-600">Dev Tools</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size="sm" onClick={clearAllData}>
            Clear All Workout Data
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            This will delete all workouts, exercises, categories, and modifiers.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
