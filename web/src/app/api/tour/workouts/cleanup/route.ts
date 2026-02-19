import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type WorkoutSeedIds = {
  type_ids: string[];
  group_ids: string[];
  modifier_ids: string[];
  exercise_ids: string[];
  workout_ids: string[];
};

export async function POST(req: Request) {
  try {
    const supabase = supabaseServerFromRequest(req);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const ids = body.ids as WorkoutSeedIds | null;

    if (!ids) {
      return NextResponse.json({ ok: true, message: "No IDs to clean up" });
    }

    // Delete in FK order: sets/exercises/workouts first, then the config tables
    if (ids.workout_ids?.length) {
      await supabaseAdmin.from("workout_sets").delete().in("workout_id", ids.workout_ids);
      await supabaseAdmin.from("workout_exercises").delete().in("workout_id", ids.workout_ids);
      await supabaseAdmin
        .from("workouts")
        .delete()
        .in("id", ids.workout_ids)
        .eq("owner_id", user.id);
    }

    if (ids.exercise_ids?.length) {
      await supabaseAdmin
        .from("exercises")
        .delete()
        .in("id", ids.exercise_ids)
        .eq("owner_id", user.id);
    }

    if (ids.modifier_ids?.length) {
      await supabaseAdmin
        .from("exercise_modifiers")
        .delete()
        .in("id", ids.modifier_ids)
        .eq("owner_id", user.id);
    }

    if (ids.group_ids?.length) {
      await supabaseAdmin
        .from("exercise_groups")
        .delete()
        .in("id", ids.group_ids)
        .eq("owner_id", user.id);
    }

    if (ids.type_ids?.length) {
      await supabaseAdmin
        .from("workout_types")
        .delete()
        .in("id", ids.type_ids)
        .eq("owner_id", user.id);
    }

    return NextResponse.json({ ok: true });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[tour/workouts/cleanup] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
