import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// POST /api/food/logs/[id]/from-day-template
// body: { day_template_id: string, mode: "replace" | "add" }
// "replace" — deletes all existing meals then loads template meals
// "add"     — appends template meals after existing ones
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id: logId } = await params;

  // Verify log belongs to user
  const { data: logRow, error: logErr } = await supabase
    .from("food_logs")
    .select("id")
    .eq("id", logId)
    .eq("owner_id", user.id)
    .single();

  if (logErr || !logRow) return NextResponse.json({ error: "Log not found" }, { status: 404 });

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const day_template_id = typeof json.day_template_id === "string" ? json.day_template_id : null;
  const mode = json.mode === "replace" ? "replace" : "add";

  if (!day_template_id) return NextResponse.json({ error: "day_template_id is required" }, { status: 400 });

  // Verify template belongs to user
  const { data: template, error: tErr } = await supabase
    .from("food_day_templates")
    .select("id")
    .eq("id", day_template_id)
    .eq("owner_id", user.id)
    .single();

  if (tErr || !template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Fetch template meals + items
  const { data: tmMeals, error: tmErr } = await supabase
    .from("food_day_template_meals")
    .select("id, name, sort_order")
    .eq("day_template_id", day_template_id)
    .order("sort_order", { ascending: true });

  if (tmErr) return NextResponse.json({ error: tmErr.message }, { status: 500 });
  if (!tmMeals || tmMeals.length === 0) return NextResponse.json({ error: "Template has no meals" }, { status: 400 });

  const tmMealIds = tmMeals.map((m: { id: string }) => m.id);
  const { data: tmItems } = await supabase
    .from("food_day_template_items")
    .select("day_template_meal_id, food_item_id, food_item_serving_id, food_name_snapshot, serving_label_snapshot, qty, calories, fat, carbs, protein, fiber, sort_order")
    .in("day_template_meal_id", tmMealIds);

  type TmMeal = { id: string; name: string; sort_order: number };
  type TmItem = {
    day_template_meal_id: string;
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

  const itemsByTmMeal = new Map<string, TmItem[]>();
  for (const item of (tmItems ?? []) as TmItem[]) {
    if (!itemsByTmMeal.has(item.day_template_meal_id)) itemsByTmMeal.set(item.day_template_meal_id, []);
    itemsByTmMeal.get(item.day_template_meal_id)!.push(item);
  }

  if (mode === "replace") {
    // Delete all existing meals (CASCADE removes their items)
    await supabase.from("food_log_meals").delete().eq("food_log_id", logId);
  }

  // Figure out the current max meal_order so we don't collide in "add" mode
  let orderOffset = 0;
  if (mode === "add") {
    const { data: existing } = await supabase
      .from("food_log_meals")
      .select("meal_order")
      .eq("food_log_id", logId)
      .order("meal_order", { ascending: false })
      .limit(1);
    orderOffset = existing && existing.length > 0 ? (existing[0].meal_order ?? 0) + 1 : 0;
  }

  // Insert new meals + items from template
  for (const tm of tmMeals as TmMeal[]) {
    const { data: newMeal, error: newMealErr } = await supabase
      .from("food_log_meals")
      .insert({
        food_log_id: logId,
        meal_name: tm.name,
        meal_order: tm.sort_order + orderOffset,
      })
      .select("id")
      .single();

    if (newMealErr || !newMeal) continue;

    const mItems = itemsByTmMeal.get(tm.id) ?? [];
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

  return NextResponse.json({ success: true });
}
