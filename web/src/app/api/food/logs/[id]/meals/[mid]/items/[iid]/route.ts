import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

type FoodLogItem = {
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

// Verify item access: item -> meal -> log -> owner
async function verifyItemAccess(
  supabase: ReturnType<typeof supabaseServerFromRequest>,
  itemId: string,
  mealId: string,
  logId: string,
  userId: string
): Promise<{ item: FoodLogItem | null; authorized: boolean }> {
  const { data, error } = await supabase
    .from("food_log_items")
    .select("id, food_log_meal_id, food_item_id, food_item_serving_id, food_name_snapshot, serving_label_snapshot, qty, calories, fat, carbs, protein, fiber, sort_order, created_at, food_log_meals!inner(food_log_id, food_logs!inner(owner_id))")
    .eq("id", itemId)
    .eq("food_log_meal_id", mealId)
    .single();

  if (error || !data) return { item: null, authorized: false };

  type JoinedItem = FoodLogItem & {
    food_log_meals: {
      food_log_id: string;
      food_logs: { owner_id: string } | { owner_id: string }[];
    } | {
      food_log_id: string;
      food_logs: { owner_id: string } | { owner_id: string }[];
    }[];
  };

  const joined = data as JoinedItem;
  const mealJoin = Array.isArray(joined.food_log_meals) ? joined.food_log_meals[0] : joined.food_log_meals;
  if (!mealJoin) return { item: null, authorized: false };
  if (mealJoin.food_log_id !== logId) return { item: null, authorized: false };

  const logJoin = Array.isArray(mealJoin.food_logs) ? mealJoin.food_logs[0] : mealJoin.food_logs;
  if (!logJoin || logJoin.owner_id !== userId) return { item: null, authorized: false };

  // Strip join fields from returned item
  const item: FoodLogItem = {
    id: joined.id,
    food_log_meal_id: joined.food_log_meal_id,
    food_item_id: joined.food_item_id,
    food_item_serving_id: joined.food_item_serving_id,
    food_name_snapshot: joined.food_name_snapshot,
    serving_label_snapshot: joined.serving_label_snapshot,
    qty: joined.qty,
    calories: joined.calories,
    fat: joined.fat,
    carbs: joined.carbs,
    protein: joined.protein,
    fiber: joined.fiber,
    sort_order: joined.sort_order,
    created_at: joined.created_at,
  };

  return { item, authorized: true };
}

// PATCH /api/food/logs/[id]/meals/[mid]/items/[iid] — update qty, recompute macros
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string; iid: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, mid, iid } = await params;

  const { item, authorized } = await verifyItemAccess(supabase, iid, mid, id, user.id);
  if (!authorized || !item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (typeof json.qty !== "number" || json.qty <= 0) {
    return NextResponse.json({ error: "qty must be a positive number" }, { status: 400 });
  }

  const newQty: number = json.qty;
  const updates: Record<string, unknown> = { qty: newQty };

  if (item.food_item_serving_id) {
    // Fetch serving to recompute macros from per-serving values
    const { data: serving, error: servErr } = await supabase
      .from("food_item_servings")
      .select("calories, fat, carbs, protein, fiber")
      .eq("id", item.food_item_serving_id)
      .single();

    if (servErr || !serving) {
      // Serving not found — fall back to proportional scaling
      const oldQty = item.qty;
      if (oldQty > 0) {
        updates.calories = ((item.calories ?? 0) / oldQty) * newQty;
        updates.fat      = ((item.fat      ?? 0) / oldQty) * newQty;
        updates.carbs    = ((item.carbs    ?? 0) / oldQty) * newQty;
        updates.protein  = ((item.protein  ?? 0) / oldQty) * newQty;
        updates.fiber    = ((item.fiber    ?? 0) / oldQty) * newQty;
      }
    } else {
      type ServingRow = { calories: number; fat: number; carbs: number; protein: number; fiber: number };
      const s = serving as ServingRow;
      updates.calories = s.calories * newQty;
      updates.fat      = s.fat      * newQty;
      updates.carbs    = s.carbs    * newQty;
      updates.protein  = s.protein  * newQty;
      updates.fiber    = s.fiber    * newQty;
    }
  } else {
    // Freeform entry — scale proportionally from current values
    const oldQty = item.qty;
    if (oldQty > 0) {
      updates.calories = ((item.calories ?? 0) / oldQty) * newQty;
      updates.fat      = ((item.fat      ?? 0) / oldQty) * newQty;
      updates.carbs    = ((item.carbs    ?? 0) / oldQty) * newQty;
      updates.protein  = ((item.protein  ?? 0) / oldQty) * newQty;
      updates.fiber    = ((item.fiber    ?? 0) / oldQty) * newQty;
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from("food_log_items")
    .update(updates)
    .eq("id", iid)
    .select("id, food_log_meal_id, food_item_id, food_item_serving_id, food_name_snapshot, serving_label_snapshot, qty, calories, fat, carbs, protein, fiber, sort_order, created_at")
    .single();

  if (updateErr || !updated) return NextResponse.json({ error: updateErr?.message ?? "Update failed" }, { status: 500 });

  return NextResponse.json(updated);
}

// DELETE /api/food/logs/[id]/meals/[mid]/items/[iid] — remove a food log item
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string; iid: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, mid, iid } = await params;

  const { authorized } = await verifyItemAccess(supabase, iid, mid, id, user.id);
  if (!authorized) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("food_log_items")
    .delete()
    .eq("id", iid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
