import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// GET /api/food/day-templates/[id] — full template with meals and items
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  const { data: template, error: tErr } = await supabase
    .from("food_day_templates")
    .select("id, name, created_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (tErr || !template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: meals, error: mErr } = await supabase
    .from("food_day_template_meals")
    .select("id, name, sort_order")
    .eq("day_template_id", id)
    .order("sort_order", { ascending: true });

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  const mealIds = (meals ?? []).map((m: { id: string }) => m.id);

  let items: unknown[] = [];
  if (mealIds.length > 0) {
    const { data: itemData } = await supabase
      .from("food_day_template_items")
      .select("id, day_template_meal_id, food_name_snapshot, serving_label_snapshot, qty, calories, protein, fat, carbs, fiber, sort_order")
      .in("day_template_meal_id", mealIds)
      .order("sort_order", { ascending: true });
    items = itemData ?? [];
  }

  type ItemRow = { day_template_meal_id: string; [key: string]: unknown };
  const itemsByMeal = new Map<string, ItemRow[]>();
  for (const item of items as ItemRow[]) {
    if (!itemsByMeal.has(item.day_template_meal_id)) itemsByMeal.set(item.day_template_meal_id, []);
    itemsByMeal.get(item.day_template_meal_id)!.push(item);
  }

  const mealsWithItems = (meals ?? []).map((m: { id: string; name: string; sort_order: number }) => ({
    ...m,
    items: itemsByMeal.get(m.id) ?? [],
  }));

  return NextResponse.json({ ...template, meals: mealsWithItems });
}

// PATCH /api/food/day-templates/[id] — rename
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = typeof json.name === "string" ? json.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data: updated, error } = await supabase
    .from("food_day_templates")
    .update({ name })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id, name")
    .single();

  if (error || !updated) return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });

  return NextResponse.json(updated);
}

// DELETE /api/food/day-templates/[id] — delete (CASCADE removes meals + items)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from("food_day_templates")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
