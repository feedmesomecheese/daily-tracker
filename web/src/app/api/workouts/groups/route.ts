import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export type ExerciseGroup = {
  id: string;
  owner_id: string;
  name: string;
  short_code: string | null;
  color: string | null;
  input_type: "strength" | "hiit" | "cardio" | "sport";
  sort_order: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

// GET /api/workouts/groups - List all groups
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
  const includeArchived = url.searchParams.get("include_archived") === "true";
  const typeId = url.searchParams.get("type_id");

  let query = supabase
    .from("exercise_groups")
    .select("*")
    .eq("owner_id", user.id)
    .order("sort_order", { ascending: true });

  if (!includeArchived) {
    query = query.eq("is_archived", false);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If type_id is provided, filter to only groups belonging to that type
  if (typeId && data) {
    const { data: workoutType } = await supabase
      .from("workout_types")
      .select("group_ids")
      .eq("id", typeId)
      .eq("owner_id", user.id)
      .single();

    if (workoutType?.group_ids) {
      const filtered = data.filter((g: ExerciseGroup) =>
        workoutType.group_ids.includes(g.id)
      );
      return NextResponse.json(filtered);
    }
  }

  return NextResponse.json(data);
}

// POST /api/workouts/groups - Create a new group
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
  const { name, short_code, color, input_type, sort_order } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Get max sort_order if not provided
  let finalSortOrder = sort_order;
  if (finalSortOrder === undefined || finalSortOrder === null) {
    const { data: maxData } = await supabase
      .from("exercise_groups")
      .select("sort_order")
      .eq("owner_id", user.id)
      .order("sort_order", { ascending: false })
      .limit(1);
    finalSortOrder = (maxData?.[0]?.sort_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from("exercise_groups")
    .insert({
      owner_id: user.id,
      name: name.trim(),
      short_code: short_code?.trim() || null,
      color: color || null,
      input_type: input_type || "strength",
      sort_order: finalSortOrder,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/workouts/groups - Bulk update (for reordering)
export async function PATCH(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
        .from("exercise_groups")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("owner_id", user.id);
      return { id, error: error?.message };
    })
  );

  const errors = results.filter((r) => r.error);
  if (errors.length > 0) {
    return NextResponse.json({ error: "Some updates failed", details: errors }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
