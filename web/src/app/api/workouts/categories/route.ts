import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export type ExerciseCategory = {
  id: string;
  owner_id: string;
  name: string;
  short_code: string | null;
  color: string | null;
  sort_order: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

// GET /api/workouts/categories - List all categories
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

  let query = supabase
    .from("exercise_categories")
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

  return NextResponse.json(data);
}

// POST /api/workouts/categories - Create a new category
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
  const { name, short_code, color, sort_order } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Get max sort_order if not provided
  let finalSortOrder = sort_order;
  if (finalSortOrder === undefined || finalSortOrder === null) {
    const { data: maxData } = await supabase
      .from("exercise_categories")
      .select("sort_order")
      .eq("owner_id", user.id)
      .order("sort_order", { ascending: false })
      .limit(1);
    finalSortOrder = (maxData?.[0]?.sort_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from("exercise_categories")
    .insert({
      owner_id: user.id,
      name: name.trim(),
      short_code: short_code?.trim() || null,
      color: color || null,
      sort_order: finalSortOrder,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/workouts/categories - Bulk update (for reordering)
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
  const { updates } = body; // Array of { id, sort_order } or { id, ...fields }

  if (!Array.isArray(updates)) {
    return NextResponse.json({ error: "Updates array required" }, { status: 400 });
  }

  // Update each category
  const results = await Promise.all(
    updates.map(async (update: { id: string; [key: string]: unknown }) => {
      const { id, ...fields } = update;
      const { error } = await supabase
        .from("exercise_categories")
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
