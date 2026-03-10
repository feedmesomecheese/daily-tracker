import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// Verify the meal belongs to the authed user by joining through food_logs
async function verifyMealAccess(
  supabase: ReturnType<typeof supabaseServerFromRequest>,
  mealId: string,
  logId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("food_log_meals")
    .select("id, food_logs!inner(owner_id)")
    .eq("id", mealId)
    .eq("food_log_id", logId)
    .single();

  if (error || !data) return false;
  const ownerRow = data as { id: string; food_logs: { owner_id: string } | { owner_id: string }[] };
  const owner = Array.isArray(ownerRow.food_logs) ? ownerRow.food_logs[0] : ownerRow.food_logs;
  return owner?.owner_id === userId;
}

// POST /api/food/logs/[id]/meals/[mid]/items — add a food item to a meal
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, mid } = await params;

  const hasAccess = await verifyMealAccess(supabase, mid, id, user.id);
  if (!hasAccess) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const food_name_snapshot = typeof json.food_name_snapshot === "string" ? json.food_name_snapshot.trim() : "";
  if (!food_name_snapshot) return NextResponse.json({ error: "food_name_snapshot is required" }, { status: 400 });

  const qty = typeof json.qty === "number" ? json.qty : 1;
  if (qty <= 0) return NextResponse.json({ error: "qty must be positive" }, { status: 400 });

  // Get current max sort_order for this meal
  const { data: existingItems, error: sortErr } = await supabase
    .from("food_log_items")
    .select("sort_order")
    .eq("food_log_meal_id", mid)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (sortErr) return NextResponse.json({ error: sortErr.message }, { status: 500 });

  type SortRow = { sort_order: number };
  const lastItem = (existingItems ?? []) as SortRow[];
  const nextSort = lastItem.length > 0 ? lastItem[0].sort_order + 1 : 0;

  const newItem = {
    food_log_meal_id: mid,
    food_item_id: typeof json.food_item_id === "string" ? json.food_item_id : null,
    food_item_serving_id: typeof json.food_item_serving_id === "string" ? json.food_item_serving_id : null,
    food_name_snapshot,
    serving_label_snapshot: typeof json.serving_label_snapshot === "string" ? json.serving_label_snapshot.trim() || null : null,
    qty,
    calories: typeof json.calories === "number" ? json.calories : 0,
    fat: typeof json.fat === "number" ? json.fat : 0,
    carbs: typeof json.carbs === "number" ? json.carbs : 0,
    protein: typeof json.protein === "number" ? json.protein : 0,
    fiber: typeof json.fiber === "number" ? json.fiber : 0,
    sort_order: nextSort,
  };

  const { data: created, error: insertErr } = await supabase
    .from("food_log_items")
    .insert(newItem)
    .select("id, food_log_meal_id, food_item_id, food_item_serving_id, food_name_snapshot, serving_label_snapshot, qty, calories, fat, carbs, protein, fiber, sort_order, created_at")
    .single();

  if (insertErr || !created) return NextResponse.json({ error: insertErr?.message ?? "Insert failed" }, { status: 500 });

  return NextResponse.json(created, { status: 201 });
}
