import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/workouts/groups/[id] - Update a group
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
  const { name, short_code, color, input_type, sort_order, is_archived } = body;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name.trim();
  if (short_code !== undefined) updates.short_code = short_code?.trim() || null;
  if (color !== undefined) updates.color = color || null;
  if (input_type !== undefined) updates.input_type = input_type;
  if (sort_order !== undefined) updates.sort_order = sort_order;
  if (is_archived !== undefined) updates.is_archived = is_archived;

  const { data, error } = await supabase
    .from("exercise_groups")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

// DELETE /api/workouts/groups/[id] - Delete a group
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
    .from("exercise_groups")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
