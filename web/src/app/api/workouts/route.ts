import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { createWorkout, type CreateWorkoutInput } from "@/lib/domain/workouts";

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
  is_move_up: boolean;
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

// Exercise and set input shapes now live with the shared write path in
// @/lib/domain/workouts, so both this route and the agent tools use one type.

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

    // Helper: paginate a query across chunked workout_id lists (avoids 1000-row Supabase limit)
    const fetchAllByWorkoutIds = async (table: string, orderCol: string) => {
      const CHUNK = 200;
      const PAGE = 1000;
      const all: unknown[] = [];
      for (let i = 0; i < workoutIds.length; i += CHUNK) {
        const chunk = workoutIds.slice(i, i + CHUNK);
        let offset = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data } = await supabase
            .from(table)
            .select("*")
            .in("workout_id", chunk)
            .order(orderCol, { ascending: true })
            .range(offset, offset + PAGE - 1);
          if (data) all.push(...data);
          if (!data || data.length < PAGE) break;
          offset += PAGE;
        }
      }
      return all;
    };

    // Fetch workout_exercises (paginated)
    const workoutExercises = await fetchAllByWorkoutIds("workout_exercises", "exercise_order") as WorkoutExercise[];

    // Fetch all sets (paginated)
    const sets = await fetchAllByWorkoutIds("workout_sets", "set_order") as WorkoutSet[];

    // Fetch include_in_tonnage for each unique exercise_id
    const uniqueExerciseIds = [...new Set(workoutExercises.map((we) => we.exercise_id).filter(Boolean))] as string[];
    const includeInTonnageMap = new Map<string, boolean>();
    if (uniqueExerciseIds.length > 0) {
      const CHUNK = 200;
      for (let i = 0; i < uniqueExerciseIds.length; i += CHUNK) {
        const chunk = uniqueExerciseIds.slice(i, i + CHUNK);
        const { data: exDefs } = await supabase
          .from("exercises")
          .select("id, include_in_tonnage")
          .in("id", chunk);
        for (const ex of exDefs || []) {
          includeInTonnageMap.set(ex.id, ex.include_in_tonnage ?? true);
        }
      }
    }

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
    for (const we of workoutExercises) {
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

    for (const set of sets) {
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
        include_in_tonnage: we.exercise_id ? (includeInTonnageMap.get(we.exercise_id) ?? true) : true,
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
  if (!body?.date) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 });
  }

  const tagIds: string[] = body.tag_ids ?? [];

  let result;
  try {
    result = await createWorkout(supabase, user.id, body as CreateWorkoutInput);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Group sets under their exercise for the client, keeping any set that is
  // not tied to a workout_exercise row separate (legacy flat sets).
  type SetRow = { workout_exercise_id: string | null } & Record<string, unknown>;
  const setsByExercise = new Map<string, SetRow[]>();
  const orphanSets: SetRow[] = [];

  for (const set of result.sets as SetRow[]) {
    if (set.workout_exercise_id) {
      const existing = setsByExercise.get(set.workout_exercise_id) || [];
      existing.push(set);
      setsByExercise.set(set.workout_exercise_id, existing);
    } else {
      orphanSets.push(set);
    }
  }

  const exercisesWithSets = (result.exercises as WorkoutExercise[]).map((we) => ({
    ...we,
    sets: setsByExercise.get(we.id) || [],
  }));

  // A workout that saved but lost part of its detail is reported as 207 so the
  // client can surface the problem without discarding what was written.
  if (result.partialError) {
    return NextResponse.json(
      { ...result.workout, exercises: exercisesWithSets, sets: orphanSets, applied_tag_ids: tagIds, error: result.partialError },
      { status: 207 }
    );
  }

  return NextResponse.json(
    { ...result.workout, exercises: exercisesWithSets, sets: orphanSets, applied_tag_ids: tagIds },
    { status: 201 }
  );
}
