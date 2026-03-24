import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// POST /api/food/plans/[id]/log-as-today
// body: { mode: "replace" | "add" }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id: planId } = await params;

  // Verify plan belongs to user
  const { data: plan, error: planErr } = await supabase
    .from("food_logs")
    .select("id")
    .eq("id", planId)
    .eq("owner_id", user.id)
    .eq("is_plan", true)
    .single();

  if (planErr || !plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const mode = json.mode === "replace" ? "replace" : "add";
  const today = typeof json.date === "string" && json.date ? json.date : new Date().toISOString().slice(0, 10);

  // Get or create today's food log
  const { data: existing } = await supabase
    .from("food_logs")
    .select("id")
    .eq("owner_id", user.id)
    .eq("date", today)
    .eq("is_plan", false)
    .single();

  let todayLogId: string;

  if (existing) {
    todayLogId = existing.id;
  } else {
    const { data: created, error: createErr } = await supabase
      .from("food_logs")
      .insert({ owner_id: user.id, date: today, is_plan: false })
      .select("id")
      .single();
    if (createErr || !created) return NextResponse.json({ error: "Failed to create today's log" }, { status: 500 });
    todayLogId = created.id;
  }

  if (mode === "replace") {
    await supabase.from("food_log_meals").delete().eq("food_log_id", todayLogId);
  }

  // Fetch plan meals + items
  const { data: planMeals, error: mealsErr } = await supabase
    .from("food_log_meals")
    .select("id, meal_name, meal_order")
    .eq("food_log_id", planId)
    .order("meal_order", { ascending: true });

  if (mealsErr || !planMeals || planMeals.length === 0) {
    return NextResponse.json({ error: "Plan has no meals" }, { status: 400 });
  }

  const planMealIds = planMeals.map((m: { id: string }) => m.id);
  const { data: planItems } = await supabase
    .from("food_log_items")
    .select("food_log_meal_id, food_item_id, food_item_serving_id, food_name_snapshot, serving_label_snapshot, qty, calories, fat, carbs, protein, fiber, sort_order")
    .in("food_log_meal_id", planMealIds);

  type PlanItem = {
    food_log_meal_id: string;
    food_item_id: string | null;
    food_item_serving_id: string | null;
    food_name_snapshot: string;
    serving_label_snapshot: string;
    qty: number;
    calories: number;
    fat: number;
    carbs: number;
    protein: number;
    fiber: number;
    sort_order: number;
  };

  const itemsByMeal = new Map<string, PlanItem[]>();
  for (const i of (planItems ?? []) as PlanItem[]) {
    if (!itemsByMeal.has(i.food_log_meal_id)) itemsByMeal.set(i.food_log_meal_id, []);
    itemsByMeal.get(i.food_log_meal_id)!.push(i);
  }

  // Get current max meal_order if adding
  let orderOffset = 0;
  if (mode === "add") {
    const { data: existingMeals } = await supabase
      .from("food_log_meals")
      .select("meal_order")
      .eq("food_log_id", todayLogId)
      .order("meal_order", { ascending: false })
      .limit(1);
    orderOffset = existingMeals && existingMeals.length > 0 ? (existingMeals[0].meal_order ?? 0) + 1 : 0;
  }

  type PlanMeal = { id: string; meal_name: string; meal_order: number };
  for (const pm of planMeals as PlanMeal[]) {
    const { data: newMeal, error: nmErr } = await supabase
      .from("food_log_meals")
      .insert({
        food_log_id: todayLogId,
        meal_name: pm.meal_name,
        meal_order: pm.meal_order + orderOffset,
      })
      .select("id")
      .single();

    if (nmErr || !newMeal) continue;

    const mItems = itemsByMeal.get(pm.id) ?? [];
    if (mItems.length > 0) {
      await supabase.from("food_log_items").insert(
        mItems.map((i) => ({
          food_log_meal_id: newMeal.id,
          food_item_id: i.food_item_id ?? null,
          food_item_serving_id: i.food_item_serving_id ?? null,
          food_name_snapshot: i.food_name_snapshot ?? "",
          serving_label_snapshot: i.serving_label_snapshot ?? "",
          qty: i.qty ?? 1,
          calories: i.calories ?? 0,
          fat: i.fat ?? 0,
          carbs: i.carbs ?? 0,
          protein: i.protein ?? 0,
          fiber: i.fiber ?? 0,
          sort_order: i.sort_order ?? 0,
        }))
      );
    }
  }

  return NextResponse.json({ success: true, log_id: todayLogId });
}
