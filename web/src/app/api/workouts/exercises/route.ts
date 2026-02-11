import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export type Exercise = {
  id: string;
  owner_id: string;
  name: string;
  exercise_type: "weighted" | "bodyweight" | "cardio_hiit" | "cardio_zone2" | "sport";
  counts_toward_volume: boolean;
  category_ids: string[];
  available_modifier_ids: string[];
  muscle_groups: string[];
  aliases: string[];
  is_archived: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// GET /api/workouts/exercises - List all exercises
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
  const categoryId = url.searchParams.get("category_id");
  const exerciseType = url.searchParams.get("type");

  let query = supabase
    .from("exercises")
    .select("*")
    .eq("owner_id", user.id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!includeArchived) {
    query = query.eq("is_archived", false);
  }

  if (exerciseType) {
    query = query.eq("exercise_type", exerciseType);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter by category if specified (array contains)
  let filteredData = data || [];
  if (categoryId) {
    filteredData = filteredData.filter((ex: Exercise) =>
      ex.category_ids?.includes(categoryId)
    );
  }

  return NextResponse.json(filteredData);
}

// POST /api/workouts/exercises - Create a new exercise
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
    name,
    exercise_type = "weighted",
    counts_toward_volume = true,
    category_ids = [],
    available_modifier_ids = [],
    muscle_groups = [],
    aliases = [],
    sort_order,
  } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Get max sort_order if not provided
  let finalSortOrder = sort_order;
  if (finalSortOrder === undefined || finalSortOrder === null) {
    const { data: maxData } = await supabase
      .from("exercises")
      .select("sort_order")
      .eq("owner_id", user.id)
      .order("sort_order", { ascending: false })
      .limit(1);
    finalSortOrder = (maxData?.[0]?.sort_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from("exercises")
    .insert({
      owner_id: user.id,
      name: name.trim(),
      exercise_type,
      counts_toward_volume,
      category_ids,
      available_modifier_ids,
      muscle_groups,
      aliases,
      sort_order: finalSortOrder,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
