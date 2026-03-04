import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export type WorkoutTag = {
  id: string;
  owner_id: string;
  name: string;
  default_type_ids: string[];
  sort_order: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

// GET /api/workouts/tags - List tags (non-archived by default)
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
    .from("workout_tags")
    .select("*")
    .eq("owner_id", user.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!includeArchived) {
    query = query.eq("is_archived", false);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/workouts/tags - Create a tag
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
  const { name, default_type_ids } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Assign next sort_order
  const { data: maxData } = await supabase
    .from("workout_tags")
    .select("sort_order")
    .eq("owner_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder = (maxData?.[0]?.sort_order ?? -1) + 1;

  const { data, error } = await supabase
    .from("workout_tags")
    .insert({
      owner_id: user.id,
      name: name.trim(),
      default_type_ids: default_type_ids || [],
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
