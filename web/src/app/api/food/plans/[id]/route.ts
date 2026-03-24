import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// GET /api/food/plans/[id] — fetch a plan with its meals + items
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  const { data: plan, error: pErr } = await supabase
    .from("food_logs")
    .select("id, plan_name, notes, created_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .eq("is_plan", true)
    .single();

  if (pErr || !plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Reuse the same food_log_meals + food_log_items structure
  const { data: meals } = await supabase
    .from("food_log_meals")
    .select("id, meal_name, meal_order")
    .eq("food_log_id", id)
    .order("meal_order", { ascending: true });

  const mealIds = (meals ?? []).map((m: { id: string }) => m.id);
  let items: unknown[] = [];
  if (mealIds.length > 0) {
    const { data: itemData } = await supabase
      .from("food_log_items")
      .select("id, food_log_meal_id, food_name_snapshot, serving_label_snapshot, qty, calories, protein, fat, carbs, fiber, sort_order")
      .in("food_log_meal_id", mealIds)
      .order("sort_order", { ascending: true });
    items = itemData ?? [];
  }

  type ItemRow = { food_log_meal_id: string; [k: string]: unknown };
  const itemsByMeal = new Map<string, ItemRow[]>();
  for (const item of items as ItemRow[]) {
    if (!itemsByMeal.has(item.food_log_meal_id)) itemsByMeal.set(item.food_log_meal_id, []);
    itemsByMeal.get(item.food_log_meal_id)!.push(item);
  }

  type MealRow = { id: string; meal_name: string; meal_order: number };
  const mealsWithItems = (meals ?? []).map((m: MealRow) => ({
    id: m.id,
    meal_name: m.meal_name,
    meal_order: m.meal_order,
    items: itemsByMeal.get(m.id) ?? [],
  }));

  return NextResponse.json({
    id: plan.id,
    name: (plan as { plan_name: string | null }).plan_name ?? "Untitled Plan",
    notes: (plan as { notes: string | null }).notes ?? "",
    meals: mealsWithItems,
  });
}

// PATCH /api/food/plans/[id] — rename plan
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
    .from("food_logs")
    .update({ plan_name: name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id)
    .eq("is_plan", true)
    .select("id, plan_name")
    .single();

  if (error || !updated) return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });

  return NextResponse.json({ id: updated.id, name: (updated as { plan_name: string }).plan_name });
}

// DELETE /api/food/plans/[id] — delete plan (CASCADE removes meals + items)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from("food_logs")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id)
    .eq("is_plan", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
