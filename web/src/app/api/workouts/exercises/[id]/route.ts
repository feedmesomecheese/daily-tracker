import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type Params = { params: Promise<{ id: string }> };

// GET /api/workouts/exercises/[id] - Get a single exercise
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

  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

// PATCH /api/workouts/exercises/[id] - Update an exercise
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
    name,
    exercise_type,
    measure_type,
    counts_toward_volume,
    group_ids,
    available_modifier_ids,
    muscle_groups,
    aliases,
    is_archived,
    sort_order,
    parent_exercise_id,
    parent_modifier_filter,
  } = body;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name.trim();
  if (exercise_type !== undefined) updates.exercise_type = exercise_type;
  if (measure_type !== undefined) updates.measure_type = measure_type;
  if (counts_toward_volume !== undefined) updates.counts_toward_volume = counts_toward_volume;
  if (group_ids !== undefined) updates.group_ids = group_ids;
  if (available_modifier_ids !== undefined) updates.available_modifier_ids = available_modifier_ids;
  if (muscle_groups !== undefined) updates.muscle_groups = muscle_groups;
  if (aliases !== undefined) updates.aliases = aliases;
  if (is_archived !== undefined) updates.is_archived = is_archived;
  if (sort_order !== undefined) updates.sort_order = sort_order;
  if (parent_exercise_id !== undefined) updates.parent_exercise_id = parent_exercise_id;
  if (parent_modifier_filter !== undefined) updates.parent_modifier_filter = parent_modifier_filter;

  const { data, error } = await supabase
    .from("exercises")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

// DELETE /api/workouts/exercises/[id] - Delete an exercise
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
    .from("exercises")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
