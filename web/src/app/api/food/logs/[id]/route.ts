import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// GET /api/food/logs/[id] — full nested log: meals + items
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  const { data: log, error: logErr } = await supabase
    .from("food_logs")
    .select("id, date, notes, is_submitted, submitted_at, created_at, updated_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (logErr || !log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: meals, error: mealsErr } = await supabase
    .from("food_log_meals")
    .select("id, food_log_id, meal_name, meal_order, meal_time, created_at")
    .eq("food_log_id", id)
    .order("meal_order", { ascending: true });

  if (mealsErr) return NextResponse.json({ error: mealsErr.message }, { status: 500 });

  type MealRow = {
    id: string;
    food_log_id: string;
    meal_name: string;
    meal_order: number;
    meal_time: string | null;
    created_at: string;
  };

  type ItemRow = {
    id: string;
    food_log_meal_id: string;
    food_item_id: string | null;
    food_item_serving_id: string | null;
    food_name_snapshot: string;
    serving_label_snapshot: string | null;
    qty: number;
    calories: number | null;
    fat: number | null;
    carbs: number | null;
    protein: number | null;
    fiber: number | null;
    sort_order: number;
    created_at: string;
  };

  const mealList = (meals ?? []) as MealRow[];
  const mealIds = mealList.map((m) => m.id);

  let items: ItemRow[] = [];
  if (mealIds.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < mealIds.length; i += chunkSize) {
      const chunk = mealIds.slice(i, i + chunkSize);
      const { data: itemChunk, error: itemErr } = await supabase
        .from("food_log_items")
        .select("id, food_log_meal_id, food_item_id, food_item_serving_id, food_name_snapshot, serving_label_snapshot, qty, calories, fat, carbs, protein, fiber, sort_order, created_at")
        .in("food_log_meal_id", chunk)
        .order("sort_order", { ascending: true });
      if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
      items = items.concat((itemChunk ?? []) as ItemRow[]);
    }
  }

  // Group items by meal_id
  const itemsByMeal = new Map<string, ItemRow[]>();
  for (const meal of mealList) itemsByMeal.set(meal.id, []);
  for (const item of items) {
    const list = itemsByMeal.get(item.food_log_meal_id);
    if (list) list.push(item);
  }

  const result = {
    ...log,
    meals: mealList.map((meal) => ({
      ...meal,
      items: itemsByMeal.get(meal.id) ?? [],
    })),
  };

  return NextResponse.json(result);
}

// PATCH /api/food/logs/[id] — update notes
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("notes" in json) {
    updates.notes = typeof json.notes === "string" ? json.notes.trim() || null : null;
  }

  const { data: updated, error: updateErr } = await supabase
    .from("food_logs")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id, date, notes, is_submitted, submitted_at, updated_at")
    .single();

  if (updateErr || !updated) return NextResponse.json({ error: updateErr?.message ?? "Not found" }, { status: updateErr ? 500 : 404 });

  return NextResponse.json(updated);
}

// DELETE /api/food/logs/[id] — delete log (cascades to meals + items)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from("food_logs")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
