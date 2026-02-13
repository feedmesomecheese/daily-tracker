import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export type WorkoutType = {
  id: string;
  owner_id: string;
  name: string;
  group_ids: string[];
  sort_order: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

// GET /api/workouts/types - List workout types
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
    .from("workout_types")
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

// POST /api/workouts/types - Create a workout type
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
  const { name, group_ids = [], sort_order } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  let finalSortOrder = sort_order;
  if (finalSortOrder === undefined || finalSortOrder === null) {
    const { data: maxData } = await supabase
      .from("workout_types")
      .select("sort_order")
      .eq("owner_id", user.id)
      .order("sort_order", { ascending: false })
      .limit(1);
    finalSortOrder = (maxData?.[0]?.sort_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from("workout_types")
    .insert({
      owner_id: user.id,
      name: name.trim(),
      group_ids,
      sort_order: finalSortOrder,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
