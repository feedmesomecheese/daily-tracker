import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

async function verifyServingOwnership(
  supabase: ReturnType<typeof supabaseServerFromRequest>,
  userId: string,
  foodItemId: string,
  sid: string
): Promise<{ ok: boolean; error?: string; status?: number }> {
  // Check that the serving exists, belongs to the food item, and is owned by the user
  const { data: serving, error: servingErr } = await supabase
    .from("food_item_servings")
    .select("id, owner_id")
    .eq("id", sid)
    .eq("food_item_id", foodItemId)
    .single();

  if (servingErr || !serving) return { ok: false, error: "Serving not found", status: 404 };
  if (serving.owner_id !== userId) return { ok: false, error: "Not authorized — cannot modify a global serving", status: 403 };

  return { ok: true };
}

// PATCH /api/food/items/[id]/servings/[sid] — update a serving (owner only)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, sid } = await params;

  const check = await verifyServingOwnership(supabase, user.id, id, sid);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status ?? 403 });

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const updates: Record<string, unknown> = {};

  if (typeof json.label === "string") {
    const label = json.label.trim();
    if (!label) return NextResponse.json({ error: "label cannot be empty" }, { status: 400 });
    updates.label = label;
  }
  if (typeof json.calories === "number") updates.calories = json.calories;
  if (typeof json.fat === "number") updates.fat = json.fat;
  if (typeof json.carbs === "number") updates.carbs = json.carbs;
  if (typeof json.protein === "number") updates.protein = json.protein;
  if (typeof json.fiber === "number") updates.fiber = json.fiber;
  if (typeof json.is_default === "boolean") updates.is_default = json.is_default;
  if (typeof json.sort_order === "number") updates.sort_order = json.sort_order;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data: serving, error: updateErr } = await supabase
    .from("food_item_servings")
    .update(updates)
    .eq("id", sid)
    .eq("food_item_id", id)
    .select("id, food_item_id, label, calories, fat, carbs, protein, fiber, is_default, sort_order")
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  if (!serving) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  return NextResponse.json(serving);
}

// DELETE /api/food/items/[id]/servings/[sid] — delete a serving (owner only)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; sid: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, sid } = await params;

  const check = await verifyServingOwnership(supabase, user.id, id, sid);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status ?? 403 });

  const { error } = await supabase
    .from("food_item_servings")
    .delete()
    .eq("id", sid)
    .eq("food_item_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
