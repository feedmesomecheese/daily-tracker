import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

// GET /api/workouts/exercises/last-sets?exercise_ids=id1,id2,...
// Returns the most recent workout_exercises entry with its sets for each exercise_id
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
  const exerciseIdsParam = url.searchParams.get("exercise_ids");

  if (!exerciseIdsParam) {
    return NextResponse.json({ error: "exercise_ids parameter required" }, { status: 400 });
  }

  const exerciseIds = exerciseIdsParam.split(",").filter(Boolean);

  if (exerciseIds.length === 0) {
    return NextResponse.json({});
  }

  const result: Record<string, { sets: Array<{ set_number: number; reps: number | null; weight: number | null; is_pr: boolean; is_cycle_max: boolean; is_missed: boolean }> }> = {};

  // For each exercise_id, find the most recent workout_exercises entry
  for (const exerciseId of exerciseIds) {
    // First try new workout_exercises table
    const { data: recentExercise } = await supabase
      .from("workout_exercises")
      .select(`
        id,
        workout_id,
        workouts!inner(owner_id, date)
      `)
      .eq("exercise_id", exerciseId)
      .eq("workouts.owner_id", user.id)
      .order("workouts(date)", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentExercise) {
      // Get sets for this workout_exercise
      const { data: sets } = await supabase
        .from("workout_sets")
        .select("set_number, reps, weight, is_pr, is_cycle_max, is_missed")
        .eq("workout_exercise_id", recentExercise.id)
        .order("set_number", { ascending: true });

      result[exerciseId] = { sets: sets || [] };
    } else {
      // Fall back to old workout_sets table (legacy data without workout_exercise_id)
      const { data: legacySets } = await supabase
        .from("workout_sets")
        .select(`
          set_number, reps, weight, is_pr, is_cycle_max, is_missed,
          workout_id,
          workouts!inner(owner_id, date)
        `)
        .eq("exercise_id", exerciseId)
        .eq("workouts.owner_id", user.id)
        .is("workout_exercise_id", null)
        .order("workouts(date)", { ascending: false })
        .limit(10);

      if (legacySets && legacySets.length > 0) {
        // Group by workout_id and take sets from the most recent workout
        const firstWorkoutId = legacySets[0].workout_id;
        const setsFromMostRecent = legacySets
          .filter((s: { workout_id: string }) => s.workout_id === firstWorkoutId)
          .map((s: { set_number: number; reps: number | null; weight: number | null; is_pr: boolean; is_cycle_max: boolean; is_missed: boolean }) => ({
            set_number: s.set_number,
            reps: s.reps,
            weight: s.weight,
            is_pr: s.is_pr,
            is_cycle_max: s.is_cycle_max,
            is_missed: s.is_missed,
          }));
        result[exerciseId] = { sets: setsFromMostRecent };
      }
    }
  }

  return NextResponse.json(result);
}
