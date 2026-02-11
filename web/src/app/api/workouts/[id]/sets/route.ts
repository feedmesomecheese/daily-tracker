import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type Params = { params: Promise<{ id: string }> };

// POST /api/workouts/[id]/sets - Add sets to a workout
export async function POST(req: Request, { params }: Params) {
  const { id: workoutId } = await params;
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Verify workout ownership
  const { data: workout } = await supabase
    .from("workouts")
    .select("id")
    .eq("id", workoutId)
    .eq("owner_id", user.id)
    .single();

  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  const body = await req.json();
  const { sets } = body;

  if (!Array.isArray(sets) || sets.length === 0) {
    return NextResponse.json({ error: "Sets array required" }, { status: 400 });
  }

  // Get current max set_order
  const { data: maxOrderData } = await supabase
    .from("workout_sets")
    .select("set_order")
    .eq("workout_id", workoutId)
    .order("set_order", { ascending: false })
    .limit(1);

  let nextOrder = (maxOrderData?.[0]?.set_order ?? -1) + 1;

  const setsToInsert = sets.map((set: Record<string, unknown>) => ({
    workout_id: workoutId,
    exercise_id: set.exercise_id || null,
    exercise_name_display: set.exercise_name_display || "Unknown",
    modifier_ids: set.modifier_ids || [],
    set_order: set.set_order ?? nextOrder++,
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

  const { data, error } = await supabase
    .from("workout_sets")
    .insert(setsToInsert)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/workouts/[id]/sets - Bulk update sets
export async function PATCH(req: Request, { params }: Params) {
  const { id: workoutId } = await params;
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Verify workout ownership
  const { data: workout } = await supabase
    .from("workouts")
    .select("id")
    .eq("id", workoutId)
    .eq("owner_id", user.id)
    .single();

  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  const body = await req.json();
  const { updates } = body;

  if (!Array.isArray(updates)) {
    return NextResponse.json({ error: "Updates array required" }, { status: 400 });
  }

  const results = await Promise.all(
    updates.map(async (update: { id: string; [key: string]: unknown }) => {
      const { id, ...fields } = update;
      const { error } = await supabase
        .from("workout_sets")
        .update(fields)
        .eq("id", id)
        .eq("workout_id", workoutId);
      return { id, error: error?.message };
    })
  );

  const errors = results.filter((r) => r.error);
  if (errors.length > 0) {
    return NextResponse.json({ error: "Some updates failed", details: errors }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/workouts/[id]/sets - Delete sets (by IDs in body)
export async function DELETE(req: Request, { params }: Params) {
  const { id: workoutId } = await params;
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Verify workout ownership
  const { data: workout } = await supabase
    .from("workouts")
    .select("id")
    .eq("id", workoutId)
    .eq("owner_id", user.id)
    .single();

  if (!workout) {
    return NextResponse.json({ error: "Workout not found" }, { status: 404 });
  }

  const body = await req.json();
  const { set_ids } = body;

  if (!Array.isArray(set_ids) || set_ids.length === 0) {
    return NextResponse.json({ error: "set_ids array required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("workout_sets")
    .delete()
    .in("id", set_ids)
    .eq("workout_id", workoutId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
