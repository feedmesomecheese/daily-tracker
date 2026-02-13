import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

// POST /api/workouts/dev - Dev tools (clear data, etc.)
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
  const { action, confirm } = body;

  if (action === "clear_all_workout_data") {
    // Require explicit confirmation
    if (confirm !== "DELETE_ALL_MY_WORKOUT_DATA") {
      return NextResponse.json(
        { error: "Confirmation required. Set confirm to 'DELETE_ALL_MY_WORKOUT_DATA'" },
        { status: 400 }
      );
    }

    // Delete in order to respect foreign key constraints
    // (though CASCADE should handle most of it)
    const deletions = [
      { table: "personal_records", label: "Personal records" },
      { table: "workout_sets", label: "Workout sets" },
      { table: "workout_exercises", label: "Workout exercises" },
      { table: "hiit_sessions", label: "HIIT sessions" },
      { table: "cardio_sessions", label: "Cardio sessions" },
      { table: "activity_sessions", label: "Activity sessions" },
      { table: "workouts", label: "Workouts" },
      { table: "exercises", label: "Exercises" },
      { table: "exercise_modifiers", label: "Modifiers" },
      { table: "exercise_groups", label: "Groups" },
      { table: "workout_types", label: "Workout types" },
      { table: "timer_presets", label: "Timer presets" },
    ];

    const results: { table: string; deleted: number; error?: string }[] = [];

    for (const { table, label } of deletions) {
      // For tables with owner_id
      if (["personal_records", "workouts", "exercises", "exercise_modifiers", "exercise_groups", "workout_types", "timer_presets"].includes(table)) {
        const { error, count } = await supabase
          .from(table)
          .delete({ count: "exact" })
          .eq("owner_id", user.id);

        results.push({
          table: label,
          deleted: count || 0,
          error: error?.message,
        });
      } else {
        // For tables linked via workout_id, delete via subquery
        // These should cascade from workouts deletion, but let's be thorough
        const { data: workoutIds } = await supabase
          .from("workouts")
          .select("id")
          .eq("owner_id", user.id);

        if (workoutIds && workoutIds.length > 0) {
          const ids = workoutIds.map((w: { id: string }) => w.id);
          const { error, count } = await supabase
            .from(table)
            .delete({ count: "exact" })
            .in("workout_id", ids);

          results.push({
            table: label,
            deleted: count || 0,
            error: error?.message,
          });
        } else {
          results.push({ table: label, deleted: 0 });
        }
      }
    }

    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      return NextResponse.json(
        { message: "Some deletions failed", results },
        { status: 207 }
      );
    }

    return NextResponse.json({
      message: "All workout data cleared",
      results,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
