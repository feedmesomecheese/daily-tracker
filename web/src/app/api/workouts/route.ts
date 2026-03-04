import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export type Workout = {
  id: string;
  owner_id: string;
  date: string;
  workout_type: string | null;
  workout_type_id: string | null;
  rating: number | null;
  location: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
  body_weight: number | null;
  body_fat_pct: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkoutSet = {
  id: string;
  workout_id: string;
  workout_exercise_id: string | null;
  exercise_id: string | null;
  exercise_name_display: string;
  modifier_ids: string[];
  set_order: number;
  set_number: number;
  set_type: string;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  is_pr: boolean;
  is_cycle_max: boolean;
  is_missed: boolean;
  notes: string | null;
  created_at: string;
};

export type WorkoutExercise = {
  id: string;
  workout_id: string;
  exercise_id: string | null;
  exercise_name_display: string;
  modifier_ids: string[];
  exercise_order: number;
  superset_group: number | null;
  created_at: string;
};

type ExerciseSetInput = {
  set_number: number;
  reps: number | null;
  weight: number | null;
  is_pr?: boolean;
  is_cycle_max?: boolean;
  is_missed?: boolean;
};

type ExerciseInput = {
  exercise_id: string | null;
  exercise_name_display: string;
  modifier_ids?: string[];
  exercise_order: number;
  superset_group?: number | null;
  input_type?: string;
  sets: ExerciseSetInput[];
  // Cardio fields
  duration_minutes?: number | null;
  distance_miles?: number | null;
  incline_pct?: number | null;
  weight?: number | null;
  // HIIT fields
  time_on_seconds?: number | null;
  time_off_seconds?: number | null;
  cycles?: number | null;
  // Notes (exercise-level)
  notes?: string | null;
};

// GET /api/workouts - List workouts
export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const workoutType = url.searchParams.get("type");
  const startDate = url.searchParams.get("start_date");
  const endDate = url.searchParams.get("end_date");
  const includeSets = url.searchParams.get("include_sets") === "true";
  const exerciseName = url.searchParams.get("exercise_name");

  // If filtering by exercise name, first find matching workout IDs
  let exerciseWorkoutIds: string[] | null = null;
  if (exerciseName) {
    const { data: matchingExercises } = await supabase
      .from("workout_exercises")
      .select("workout_id")
      .ilike("exercise_name_display", `%${exerciseName}%`);

    if (!matchingExercises || matchingExercises.length === 0) {
      return NextResponse.json([]);
    }
    exerciseWorkoutIds = Array.from(new Set((matchingExercises as { workout_id: string }[]).map((e) => e.workout_id)));
  }

  let query = supabase
    .from("workouts")
    .select("*")
    .eq("owner_id", user.id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (exerciseWorkoutIds) {
    // When filtering by exercise, use the matched IDs (capped at limit)
    query = query.in("id", exerciseWorkoutIds.slice(0, 2000));
  }
  query = query.range(offset, offset + limit - 1);

  if (workoutType) {
    query = query.eq("workout_type", workoutType);
  }
  const workoutTypeIds = url.searchParams.get("type_ids");
  if (workoutTypeIds) {
    query = query.in("workout_type_id", workoutTypeIds.split(","));
  }
  if (startDate) {
    query = query.gte("date", startDate);
  }
  if (endDate) {
    query = query.lte("date", endDate);
  }

  const { data: workouts, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (includeSets && workouts && workouts.length > 0) {
    const workoutIds = workouts.map((w: Workout) => w.id);

    // Fetch workout_exercises
    const { data: workoutExercises } = await supabase
      .from("workout_exercises")
      .select("*")
      .in("workout_id", workoutIds)
      .order("exercise_order", { ascending: true });

    // Fetch all sets
    const { data: sets } = await supabase
      .from("workout_sets")
      .select("*")
      .in("workout_id", workoutIds)
      .order("set_order", { ascending: true });

    // Fetch activity sessions (tennis, racquetball, etc.)
    const { data: activitySessions } = await supabase
      .from("activity_sessions")
      .select("*")
      .in("workout_id", workoutIds);

    // Fetch applied tags
    const { data: appliedTags } = await supabase
      .from("workout_applied_tags")
      .select("workout_id, tag_id")
      .in("workout_id", workoutIds);

    // Group workout_exercises by workout
    const exercisesByWorkout = new Map<string, WorkoutExercise[]>();
    for (const we of workoutExercises || []) {
      const existing = exercisesByWorkout.get(we.workout_id) || [];
      existing.push(we);
      exercisesByWorkout.set(we.workout_id, existing);
    }

    // Group activity sessions by workout
    const activitiesByWorkout = new Map<string, typeof activitySessions>();
    for (const a of activitySessions || []) {
      const existing = activitiesByWorkout.get(a.workout_id) || [];
      existing.push(a);
      activitiesByWorkout.set(a.workout_id, existing);
    }

    // Group applied tags by workout
    const tagsByWorkout = new Map<string, string[]>();
    for (const t of appliedTags || []) {
      const existing = tagsByWorkout.get(t.workout_id) || [];
      existing.push(t.tag_id);
      tagsByWorkout.set(t.workout_id, existing);
    }

    // Group sets by workout_exercise_id
    const setsByExerciseEntry = new Map<string, WorkoutSet[]>();
    const orphanSetsByWorkout = new Map<string, WorkoutSet[]>();

    for (const set of sets || []) {
      if (set.workout_exercise_id) {
        const existing = setsByExerciseEntry.get(set.workout_exercise_id) || [];
        existing.push(set);
        setsByExerciseEntry.set(set.workout_exercise_id, existing);
      } else {
        // Legacy set without workout_exercise_id
        const existing = orphanSetsByWorkout.get(set.workout_id) || [];
        existing.push(set);
        orphanSetsByWorkout.set(set.workout_id, existing);
      }
    }

    const workoutsWithData = workouts.map((w: Workout) => {
      const exercises = (exercisesByWorkout.get(w.id) || []).map((we) => ({
        ...we,
        sets: setsByExerciseEntry.get(we.id) || [],
      }));

      return {
        ...w,
        exercises,
        activity_sessions: activitiesByWorkout.get(w.id) || [],
        // Legacy: include orphan sets for backward compat
        sets: orphanSetsByWorkout.get(w.id) || [],
        applied_tag_ids: tagsByWorkout.get(w.id) || [],
      };
    });

    return NextResponse.json(workoutsWithData);
  }

  return NextResponse.json(workouts);
}

// POST /api/workouts - Create a new workout
export async function POST(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const {
    date,
    workout_type,
    workout_type_id,
    rating,
    location,
    started_at,
    ended_at,
    duration_minutes,
    body_weight,
    body_fat_pct,
    notes,
    exercises = [] as ExerciseInput[],
    sets = [] as Partial<WorkoutSet>[],
    tag_ids = [] as string[],
  } = body;

  if (!date) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 });
  }

  // Create the workout
  const { data: workout, error: workoutError } = await supabase
    .from("workouts")
    .insert({
      owner_id: user.id,
      date,
      workout_type: workout_type || null,
      workout_type_id: workout_type_id || null,
      rating: rating || null,
      location: location || null,
      started_at: started_at || null,
      ended_at: ended_at || null,
      duration_minutes: duration_minutes || null,
      body_weight: body_weight || null,
      body_fat_pct: body_fat_pct || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (workoutError) {
    return NextResponse.json({ error: workoutError.message }, { status: 500 });
  }

  // Insert applied tags
  if (tag_ids.length > 0) {
    const tagRows = tag_ids.map((tid: string) => ({ workout_id: workout.id, tag_id: tid }));
    await supabase.from("workout_applied_tags").insert(tagRows);
  }

  // New flow: exercises[] array with nested sets
  if (exercises.length > 0) {
    for (const ex of exercises) {
      // Create workout_exercise entry
      const { data: workoutExercise, error: weError } = await supabase
        .from("workout_exercises")
        .insert({
          workout_id: workout.id,
          exercise_id: ex.exercise_id || null,
          exercise_name_display: ex.exercise_name_display,
          modifier_ids: ex.modifier_ids || [],
          exercise_order: ex.exercise_order,
          superset_group: ex.superset_group ?? null,
          // Cardio fields
          duration_minutes: ex.duration_minutes ?? null,
          distance_miles: ex.distance_miles ?? null,
          incline_pct: ex.incline_pct ?? null,
          weight: ex.weight ?? null,
          // HIIT fields
          time_on_seconds: ex.time_on_seconds ?? null,
          time_off_seconds: ex.time_off_seconds ?? null,
          cycles: ex.cycles ?? null,
          // Notes
          notes: ex.notes ?? null,
        })
        .select()
        .single();

      if (weError) {
        return NextResponse.json(
          { workout, error: `Exercise entry failed: ${weError.message}` },
          { status: 207 }
        );
      }

      // Create sets for this exercise
      if (ex.sets && ex.sets.length > 0) {
        const setsToInsert = ex.sets.map((s: ExerciseSetInput, idx: number) => ({
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
        }));

        const { error: setsError } = await supabase
          .from("workout_sets")
          .insert(setsToInsert);

        if (setsError) {
          return NextResponse.json(
            { workout, error: `Sets failed for ${ex.exercise_name_display}: ${setsError.message}` },
            { status: 207 }
          );
        }
      }
    }
  }

  // Legacy flow: flat sets[] array (backward compat)
  if (sets.length > 0 && exercises.length === 0) {
    const setsToInsert = sets.map((set: Partial<WorkoutSet>, index: number) => ({
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
      notes: set.notes || null,
    }));

    const { error: setsError } = await supabase
      .from("workout_sets")
      .insert(setsToInsert);

    if (setsError) {
      return NextResponse.json(
        { workout, error: `Workout created but sets failed: ${setsError.message}` },
        { status: 207 }
      );
    }
  }

  // Fetch complete workout with exercises and sets
  const { data: completeWorkout } = await supabase
    .from("workouts")
    .select("*")
    .eq("id", workout.id)
    .single();

  const { data: workoutExercises } = await supabase
    .from("workout_exercises")
    .select("*")
    .eq("workout_id", workout.id)
    .order("exercise_order", { ascending: true });

  const { data: workoutSets } = await supabase
    .from("workout_sets")
    .select("*")
    .eq("workout_id", workout.id)
    .order("set_number", { ascending: true });

  // Group sets by workout_exercise_id
  const setsByExercise = new Map<string, typeof workoutSets>();
  const orphanSets: typeof workoutSets = [];
  for (const set of workoutSets || []) {
    if (set.workout_exercise_id) {
      const existing = setsByExercise.get(set.workout_exercise_id) || [];
      existing.push(set);
      setsByExercise.set(set.workout_exercise_id, existing);
    } else {
      orphanSets.push(set);
    }
  }

  const exercisesWithSets = (workoutExercises || []).map((we: WorkoutExercise) => ({
    ...we,
    sets: setsByExercise.get(we.id) || [],
  }));

  return NextResponse.json(
    { ...completeWorkout, exercises: exercisesWithSets, sets: orphanSets, applied_tag_ids: tag_ids },
    { status: 201 }
  );
}
