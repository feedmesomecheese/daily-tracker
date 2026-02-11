import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export type ExerciseModifier = {
  id: string;
  owner_id: string;
  name: string;
  adjective_order: number;
  created_at: string;
  updated_at: string;
};

// GET /api/workouts/modifiers - List all modifiers
export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("exercise_modifiers")
    .select("*")
    .eq("owner_id", user.id)
    .order("adjective_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/workouts/modifiers - Create a new modifier
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
  const { name, adjective_order } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Get max adjective_order if not provided
  let finalOrder = adjective_order;
  if (finalOrder === undefined || finalOrder === null) {
    const { data: maxData } = await supabase
      .from("exercise_modifiers")
      .select("adjective_order")
      .eq("owner_id", user.id)
      .order("adjective_order", { ascending: false })
      .limit(1);
    finalOrder = (maxData?.[0]?.adjective_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from("exercise_modifiers")
    .insert({
      owner_id: user.id,
      name: name.trim(),
      adjective_order: finalOrder,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/workouts/modifiers - Bulk update (for reordering)
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
        .from("exercise_modifiers")
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
