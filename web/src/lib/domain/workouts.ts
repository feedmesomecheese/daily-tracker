import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Workout creation, shared by the web UI (/api/workouts POST) and the agent
 * tool layer (/api/ai/workouts POST, MCP logWorkout).
 *
 * Extracted from the original route handler. Both the modern exercises[] shape
 * (nested sets) and the legacy flat sets[] shape are still supported.
 */

export type ExerciseSetInput = {
  set_number: number;
  reps: number | null;
  weight: number | null;
  is_pr?: boolean;
  is_cycle_max?: boolean;
  is_missed?: boolean;
  is_move_up?: boolean;
};

export type ExerciseInput = {
  exercise_id?: string | null;
  exercise_name_display: string;
  modifier_ids?: string[];
  exercise_order: number;
  superset_group?: number | null;
  input_type?: string;
  sets?: ExerciseSetInput[];
  duration_minutes?: number | null;
  distance_miles?: number | null;
  incline_pct?: number | null;
  weight?: number | null;
  time_on_seconds?: number | null;
  time_off_seconds?: number | null;
  cycles?: number | null;
  notes?: string | null;
};

export type FlatSetInput = {
  exercise_id?: string | null;
  exercise_name_display?: string;
  modifier_ids?: string[];
  set_order?: number;
  set_number?: number;
  set_type?: string;
  reps?: number | null;
  weight?: number | null;
  rpe?: number | null;
  is_pr?: boolean;
  is_cycle_max?: boolean;
  is_missed?: boolean;
  is_move_up?: boolean;
  notes?: string | null;
};

export type CreateWorkoutInput = {
  date: string;
  workout_type?: string | null;
  workout_type_id?: string | null;
  rating?: number | null;
  location?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_minutes?: number | null;
  body_weight?: number | null;
  body_fat_pct?: number | null;
  notes?: string | null;
  exercises?: ExerciseInput[];
  sets?: FlatSetInput[];
  tag_ids?: string[];
};

export type CreateWorkoutResult = {
  workout: Record<string, unknown>;
  exercises: unknown[];
  sets: unknown[];
  /** Set when the workout row was created but part of its detail failed. */
  partialError?: string;
};

export async function createWorkout(
  db: SupabaseClient,
  ownerId: string,
  input: CreateWorkoutInput
): Promise<CreateWorkoutResult> {
  const exercises = input.exercises ?? [];
  const flatSets = input.sets ?? [];
  const tagIds = input.tag_ids ?? [];

  const { data: workout, error: workoutError } = await db
    .from("workouts")
    .insert({
      owner_id: ownerId,
      date: input.date,
      workout_type: input.workout_type || null,
      workout_type_id: input.workout_type_id || null,
      rating: input.rating ?? null,
      location: input.location || null,
      started_at: input.started_at || null,
      ended_at: input.ended_at || null,
      duration_minutes: input.duration_minutes ?? null,
      body_weight: input.body_weight ?? null,
      body_fat_pct: input.body_fat_pct ?? null,
      notes: input.notes || null,
    })
    .select()
    .single();

  if (workoutError) throw new Error(workoutError.message);

  if (tagIds.length > 0) {
    const tagRows = tagIds.map((tid) => ({ workout_id: workout.id, tag_id: tid }));
    await db.from("workout_applied_tags").insert(tagRows);
  }

  let partialError: string | undefined;

  // Modern flow: exercises[] with nested sets
  if (exercises.length > 0) {
    for (const ex of exercises) {
      const { data: workoutExercise, error: weError } = await db
        .from("workout_exercises")
        .insert({
          workout_id: workout.id,
          exercise_id: ex.exercise_id || null,
          exercise_name_display: ex.exercise_name_display,
          modifier_ids: ex.modifier_ids || [],
          exercise_order: ex.exercise_order,
          superset_group: ex.superset_group ?? null,
          duration_minutes: ex.duration_minutes ?? null,
          distance_miles: ex.distance_miles ?? null,
          incline_pct: ex.incline_pct ?? null,
          weight: ex.weight ?? null,
          time_on_seconds: ex.time_on_seconds ?? null,
          time_off_seconds: ex.time_off_seconds ?? null,
          cycles: ex.cycles ?? null,
          notes: ex.notes ?? null,
        })
        .select()
        .single();

      if (weError) {
        partialError = `Exercise entry failed: ${weError.message}`;
        break;
      }

      if (ex.sets && ex.sets.length > 0) {
        const setsToInsert = ex.sets.map((s, idx) => ({
          workout_id: workout.id,
          workout_exercise_id: workoutExercise.id,
          exercise_id: ex.exercise_id || null,
          exercise_name_display: ex.exercise_name_display,
          modifier_ids: ex.modifier_ids || [],
          set_order: ex.exercise_order * 100 + idx,
          set_number: s.set_number,
          set_type: "working",
          reps: s.reps,
          weight: s.weight,
          is_pr: s.is_pr ?? false,
          is_cycle_max: s.is_cycle_max ?? false,
          is_missed: s.is_missed ?? false,
          is_move_up: s.is_move_up ?? false,
        }));

        const { error: setsError } = await db.from("workout_sets").insert(setsToInsert);
        if (setsError) {
          partialError = `Sets failed for ${ex.exercise_name_display}: ${setsError.message}`;
          break;
        }
      }
    }
  }

  // Legacy flow: flat sets[] array
  if (flatSets.length > 0 && exercises.length === 0) {
    const setsToInsert = flatSets.map((set, index) => ({
      workout_id: workout.id,
      exercise_id: set.exercise_id || null,
      exercise_name_display: set.exercise_name_display || "Unknown",
      modifier_ids: set.modifier_ids || [],
      set_order: set.set_order ?? index,
      set_number: set.set_number ?? 1,
      set_type: set.set_type || "working",
      reps: set.reps ?? null,
      weight: set.weight ?? null,
      rpe: set.rpe ?? null,
      is_pr: set.is_pr ?? false,
      is_cycle_max: set.is_cycle_max ?? false,
      is_missed: set.is_missed ?? false,
      is_move_up: set.is_move_up ?? false,
      notes: set.notes || null,
    }));

    const { error: setsError } = await db.from("workout_sets").insert(setsToInsert);
    if (setsError) {
      partialError = `Workout created but sets failed: ${setsError.message}`;
    }
  }

  const { data: completeWorkout } = await db
    .from("workouts")
    .select("*")
    .eq("id", workout.id)
    .single();

  const { data: workoutExercises } = await db
    .from("workout_exercises")
    .select("*")
    .eq("workout_id", workout.id)
    .order("exercise_order", { ascending: true });

  const { data: workoutSets } = await db
    .from("workout_sets")
    .select("*")
    .eq("workout_id", workout.id)
    .order("set_number", { ascending: true });

  return {
    workout: completeWorkout ?? workout,
    exercises: workoutExercises ?? [],
    sets: workoutSets ?? [],
    ...(partialError ? { partialError } : {}),
  };
}

/**
 * Resolve a free-text exercise name to the user's existing exercise row.
 *
 * Agents send names ("Bench Press"), not UUIDs. Linking to the real row keeps
 * per-exercise stats and PR tracking working; an unmatched name still logs
 * fine, it just won't roll up into that exercise's history.
 */
export async function resolveExerciseIds(
  db: SupabaseClient,
  ownerId: string,
  names: string[]
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  if (names.length === 0) return resolved;

  const { data } = await db
    .from("exercises")
    .select("id, name")
    .eq("owner_id", ownerId);

  if (!data) return resolved;

  const byLower = new Map<string, string>();
  for (const row of data as { id: string; name: string }[]) {
    byLower.set(row.name.trim().toLowerCase(), row.id);
  }

  for (const name of names) {
    const match = byLower.get(name.trim().toLowerCase());
    if (match) resolved.set(name, match);
  }

  return resolved;
}
