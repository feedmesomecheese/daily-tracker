import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export type Workout = {
  id: string;
  owner_id: string;
  date: string;
  workout_type: string | null;
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

  let query = supabase
    .from("workouts")
    .select("*")
    .eq("owner_id", user.id)
    .order("date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (workoutType) {
    query = query.eq("workout_type", workoutType);
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

  // Optionally include sets for each workout
  if (includeSets && workouts && workouts.length > 0) {
    const workoutIds = workouts.map((w: Workout) => w.id);
    const { data: sets } = await supabase
      .from("workout_sets")
      .select("*")
      .in("workout_id", workoutIds)
      .order("set_order", { ascending: true });

    // Group sets by workout
    const setsByWorkout = new Map<string, WorkoutSet[]>();
    for (const set of sets || []) {
      const existing = setsByWorkout.get(set.workout_id) || [];
      existing.push(set);
      setsByWorkout.set(set.workout_id, existing);
    }

    // Attach sets to workouts
    const workoutsWithSets = workouts.map((w: Workout) => ({
      ...w,
      sets: setsByWorkout.get(w.id) || [],
    }));

    return NextResponse.json(workoutsWithSets);
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
    location,
    started_at,
    ended_at,
    duration_minutes,
    body_weight,
    body_fat_pct,
    notes,
    sets = [],
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

  // Create sets if provided
  if (sets.length > 0) {
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
      // Workout was created but sets failed - return partial success
      return NextResponse.json(
        { workout, error: `Workout created but sets failed: ${setsError.message}` },
        { status: 207 }
      );
    }
  }

  // Fetch the complete workout with sets
  const { data: completeWorkout } = await supabase
    .from("workouts")
    .select("*")
    .eq("id", workout.id)
    .single();

  const { data: workoutSets } = await supabase
    .from("workout_sets")
    .select("*")
    .eq("workout_id", workout.id)
    .order("set_order", { ascending: true });

  return NextResponse.json(
    { ...completeWorkout, sets: workoutSets || [] },
    { status: 201 }
  );
}
