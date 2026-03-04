import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type Params = { params: Promise<{ id: string }> };

// GET /api/workouts/[id] - Get a single workout with exercises and sets
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: workout, error } = await supabase
    .from("workouts")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  // Get workout_exercises
  const { data: workoutExercises } = await supabase
    .from("workout_exercises")
    .select("*")
    .eq("workout_id", id)
    .order("exercise_order", { ascending: true });

  // Get sets
  const { data: sets } = await supabase
    .from("workout_sets")
    .select("*")
    .eq("workout_id", id)
    .order("set_number", { ascending: true });

  // Group sets by workout_exercise_id
  type SetRow = { workout_exercise_id: string | null; [key: string]: unknown };
  const setsByExercise = new Map<string, SetRow[]>();
  const orphanSets: SetRow[] = [];
  for (const set of (sets || []) as SetRow[]) {
    if (set.workout_exercise_id) {
      const existing = setsByExercise.get(set.workout_exercise_id) || [];
      existing.push(set);
      setsByExercise.set(set.workout_exercise_id, existing);
    } else {
      orphanSets.push(set);
    }
  }

  type ExerciseRow = { id: string; [key: string]: unknown };
  const exercisesWithSets = (workoutExercises || []).map((we: ExerciseRow) => ({
    ...we,
    sets: setsByExercise.get(we.id) || [],
  }));

  // Get HIIT sessions
  const { data: hiitSessions } = await supabase
    .from("hiit_sessions")
    .select("*")
    .eq("workout_id", id);

  // Get cardio sessions
  const { data: cardioSessions } = await supabase
    .from("cardio_sessions")
    .select("*")
    .eq("workout_id", id);

  // Get activity sessions
  const { data: activitySessions } = await supabase
    .from("activity_sessions")
    .select("*")
    .eq("workout_id", id);

  // Get applied tags
  const { data: appliedTags } = await supabase
    .from("workout_applied_tags")
    .select("tag_id")
    .eq("workout_id", id);

  return NextResponse.json({
    ...workout,
    exercises: exercisesWithSets,
    sets: orphanSets,
    hiit_sessions: hiitSessions || [],
    cardio_sessions: cardioSessions || [],
    activity_sessions: activitySessions || [],
    applied_tag_ids: (appliedTags || []).map((t: { tag_id: string }) => t.tag_id),
  });
}

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
  duration_minutes?: number | null;
  distance_miles?: number | null;
  incline_pct?: number | null;
  weight?: number | null;
  time_on_seconds?: number | null;
  time_off_seconds?: number | null;
  cycles?: number | null;
  notes?: string | null;
};

// PATCH /api/workouts/[id] - Update a workout (metadata + optional exercises)
export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
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
    exercises,
    tag_ids,
  } = body;

  // 1. Update workout metadata
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (date !== undefined) updates.date = date;
  if (workout_type !== undefined) updates.workout_type = workout_type;
  if (workout_type_id !== undefined) updates.workout_type_id = workout_type_id;
  if (rating !== undefined) updates.rating = rating;
  if (location !== undefined) updates.location = location;
  if (started_at !== undefined) updates.started_at = started_at;
  if (ended_at !== undefined) updates.ended_at = ended_at;
  if (duration_minutes !== undefined) updates.duration_minutes = duration_minutes;
  if (body_weight !== undefined) updates.body_weight = body_weight;
  if (body_fat_pct !== undefined) updates.body_fat_pct = body_fat_pct;
  if (notes !== undefined) updates.notes = notes;

  const { data: workout, error } = await supabase
    .from("workouts")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  // 2. If tag_ids provided, replace applied tags
  if (tag_ids !== undefined) {
    await supabase.from("workout_applied_tags").delete().eq("workout_id", id);
    if (Array.isArray(tag_ids) && tag_ids.length > 0) {
      const tagRows = tag_ids.map((tid: string) => ({ workout_id: id, tag_id: tid }));
      await supabase.from("workout_applied_tags").insert(tagRows);
    }
  }

  // 3. If exercises array is provided, delete-and-recreate
  if (exercises !== undefined) {
    // Delete existing workout_exercises (CASCADE deletes workout_sets linked via workout_exercise_id)
    await supabase
      .from("workout_exercises")
      .delete()
      .eq("workout_id", id);

    // Also delete any orphan sets (legacy sets without workout_exercise_id)
    await supabase
      .from("workout_sets")
      .delete()
      .eq("workout_id", id);

    // Re-create exercises and sets
    for (const ex of exercises as ExerciseInput[]) {
      const { data: workoutExercise, error: weError } = await supabase
        .from("workout_exercises")
        .insert({
          workout_id: id,
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
        return NextResponse.json(
          { workout, error: `Exercise update failed: ${weError.message}` },
          { status: 207 }
        );
      }

      if (ex.sets && ex.sets.length > 0) {
        const setsToInsert = ex.sets.map((s: ExerciseSetInput, idx: number) => ({
          workout_id: id,
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

  // 3. Return complete workout with exercises and sets
  const { data: workoutExercises } = await supabase
    .from("workout_exercises")
    .select("*")
    .eq("workout_id", id)
    .order("exercise_order", { ascending: true });

  const { data: workoutSets } = await supabase
    .from("workout_sets")
    .select("*")
    .eq("workout_id", id)
    .order("set_number", { ascending: true });

  type SetRow = { workout_exercise_id: string | null; [key: string]: unknown };
  const setsByExercise = new Map<string, SetRow[]>();
  for (const set of (workoutSets || []) as SetRow[]) {
    if (set.workout_exercise_id) {
      const existing = setsByExercise.get(set.workout_exercise_id as string) || [];
      existing.push(set);
      setsByExercise.set(set.workout_exercise_id as string, existing);
    }
  }

  type ExerciseRow = { id: string; [key: string]: unknown };
  const exercisesWithSets = (workoutExercises || []).map((we: ExerciseRow) => ({
    ...we,
    sets: setsByExercise.get(we.id) || [],
  }));

  // Fetch current applied tags for response
  const { data: currentTags } = await supabase
    .from("workout_applied_tags")
    .select("tag_id")
    .eq("workout_id", id);

  return NextResponse.json({
    ...workout,
    exercises: exercisesWithSets,
    applied_tag_ids: (currentTags || []).map((t: { tag_id: string }) => t.tag_id),
  });
}

// DELETE /api/workouts/[id] - Delete a workout (cascades to sets)
export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await supabase
    .from("workouts")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
