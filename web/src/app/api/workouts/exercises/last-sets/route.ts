import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

// GET /api/workouts/exercises/last-sets?exercises=id1:mod1+mod2,id2:,id3:mod3
// Returns the most recent workout_exercises entry with matching modifier_ids for each exercise
// Key format in response: "exerciseId:sortedMod1,sortedMod2"
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
  const exercisesParam = url.searchParams.get("exercises");

  if (!exercisesParam) {
    return NextResponse.json({ error: "exercises parameter required" }, { status: 400 });
  }

  // Parse "id1:mod1+mod2,id2:,id3:mod3" into [{id, modifierIds}]
  const exerciseList = exercisesParam
    .split(",")
    .map((part) => {
      const colonIdx = part.indexOf(":");
      if (colonIdx === -1) return { id: part, modifierIds: [] as string[] };
      const id = part.slice(0, colonIdx);
      const modsStr = part.slice(colonIdx + 1);
      const modifierIds = modsStr ? modsStr.split("+").filter(Boolean) : [];
      return { id, modifierIds };
    })
    .filter((x) => x.id);

  if (exerciseList.length === 0) {
    return NextResponse.json({});
  }

  const ghostKey = (exerciseId: string, modifierIds: string[]) =>
    `${exerciseId}:${[...modifierIds].sort().join(",")}`;

  const result: Record<
    string,
    { sets: Array<{ set_number: number; reps: number | null; weight: number | null; is_pr: boolean; is_cycle_max: boolean; is_missed: boolean }> }
  > = {};

  for (const { id: exerciseId, modifierIds } of exerciseList) {
    const key = ghostKey(exerciseId, modifierIds);
    const sortedTarget = [...modifierIds].sort();

    // Fetch recent workout_exercises for this exercise (enough to find one with matching modifiers)
    const { data: recentExercises } = await supabase
      .from("workout_exercises")
      .select(`
        id,
        modifier_ids,
        workout_id,
        workouts!inner(owner_id, date)
      `)
      .eq("exercise_id", exerciseId)
      .eq("workouts.owner_id", user.id)
      .order("workouts(date)", { ascending: false })
      .limit(50);

    // Find most recent entry with exactly matching modifier set
    const match = recentExercises?.find((we: { modifier_ids: string[] | null }) => {
      const sortedActual = [...(we.modifier_ids || [])].sort();
      return JSON.stringify(sortedActual) === JSON.stringify(sortedTarget);
    });

    if (match) {
      const { data: sets } = await supabase
        .from("workout_sets")
        .select("set_number, reps, weight, is_pr, is_cycle_max, is_missed")
        .eq("workout_exercise_id", match.id)
        .order("set_number", { ascending: true });

      result[key] = { sets: sets || [] };
    } else {
      // Fall back to legacy workout_sets (imported data without workout_exercise_id)
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
        result[key] = { sets: setsFromMostRecent };
      }
    }
  }

  return NextResponse.json(result);
}
