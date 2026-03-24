import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// GET /api/food/day-templates — list all day templates with meal count + totals
export async function GET(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: templates, error: tErr } = await supabase
    .from("food_day_templates")
    .select("id, name, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!templates || templates.length === 0) return NextResponse.json([]);

  const templateIds = templates.map((t: { id: string }) => t.id);

  // Get all meals for these templates
  const { data: meals, error: mErr } = await supabase
    .from("food_day_template_meals")
    .select("id, day_template_id, name")
    .in("day_template_id", templateIds);

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  const mealIds = (meals ?? []).map((m: { id: string }) => m.id);

  // Get all items for aggregate totals
  let items: { day_template_meal_id: string; calories: number | null }[] = [];
  if (mealIds.length > 0) {
    const { data: itemData } = await supabase
      .from("food_day_template_items")
      .select("day_template_meal_id, calories, protein, fat, carbs, fiber")
      .in("day_template_meal_id", mealIds);
    items = itemData ?? [];
  }

  type MealRow = { id: string; day_template_id: string; name: string };
  type ItemRow = { day_template_meal_id: string; calories: number | null; protein?: number | null; fat?: number | null; carbs?: number | null; fiber?: number | null };

  const mealsByTemplate = new Map<string, MealRow[]>();
  for (const m of (meals ?? []) as MealRow[]) {
    if (!mealsByTemplate.has(m.day_template_id)) mealsByTemplate.set(m.day_template_id, []);
    mealsByTemplate.get(m.day_template_id)!.push(m);
  }

  const itemsByMeal = new Map<string, ItemRow[]>();
  for (const i of items as ItemRow[]) {
    if (!itemsByMeal.has(i.day_template_meal_id)) itemsByMeal.set(i.day_template_meal_id, []);
    itemsByMeal.get(i.day_template_meal_id)!.push(i);
  }

  const result = (templates as { id: string; name: string; created_at: string }[]).map((t) => {
    const tMeals = mealsByTemplate.get(t.id) ?? [];
    const allItems = tMeals.flatMap((m) => itemsByMeal.get(m.id) ?? []);
    return {
      id: t.id,
      name: t.name,
      created_at: t.created_at,
      meal_count: tMeals.length,
      item_count: allItems.length,
      total_calories: allItems.reduce((s, i) => s + (i.calories ?? 0), 0),
      total_protein: allItems.reduce((s, i) => s + (i.protein ?? 0), 0),
      total_fat: allItems.reduce((s, i) => s + (i.fat ?? 0), 0),
      total_carbs: allItems.reduce((s, i) => s + (i.carbs ?? 0), 0),
    };
  });

  return NextResponse.json(result);
}

// POST /api/food/day-templates — create from a food log
export async function POST(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = typeof json.name === "string" ? json.name.trim() : "";
  const log_id = typeof json.log_id === "string" ? json.log_id : null;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!log_id) return NextResponse.json({ error: "log_id is required" }, { status: 400 });

  // Verify the log belongs to the user
  const { data: logRow, error: logErr } = await supabase
    .from("food_logs")
    .select("id")
    .eq("id", log_id)
    .eq("owner_id", user.id)
    .single();

  if (logErr || !logRow) return NextResponse.json({ error: "Log not found" }, { status: 404 });

  // Fetch all meals for this log
  const { data: logMeals, error: mealsErr } = await supabase
    .from("food_log_meals")
    .select("id, meal_name, meal_order")
    .eq("food_log_id", log_id)
    .order("meal_order", { ascending: true });

  if (mealsErr) return NextResponse.json({ error: mealsErr.message }, { status: 500 });
  if (!logMeals || logMeals.length === 0) {
    return NextResponse.json({ error: "No meals to save — log is empty" }, { status: 400 });
  }

  // Fetch all items for these meals
  const mealIds = logMeals.map((m: { id: string }) => m.id);
  const { data: logItems, error: itemsErr } = await supabase
    .from("food_log_items")
    .select("food_log_meal_id, food_item_id, food_item_serving_id, food_name_snapshot, serving_label_snapshot, qty, calories, fat, carbs, protein, fiber, sort_order")
    .in("food_log_meal_id", mealIds);

  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  // Create the day template
  const { data: template, error: tErr } = await supabase
    .from("food_day_templates")
    .insert({ owner_id: user.id, name })
    .select("id")
    .single();

  if (tErr || !template) return NextResponse.json({ error: tErr?.message ?? "Insert failed" }, { status: 500 });

  type LogMeal = { id: string; meal_name: string; meal_order: number };
  type LogItem = {
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

  const itemsByMeal = new Map<string, LogItem[]>();
  for (const item of (logItems ?? []) as LogItem[]) {
    if (!itemsByMeal.has(item.food_log_meal_id)) itemsByMeal.set(item.food_log_meal_id, []);
    itemsByMeal.get(item.food_log_meal_id)!.push(item);
  }

  // Insert meals + items
  for (const lm of logMeals as LogMeal[]) {
    const { data: dtMeal, error: dtMealErr } = await supabase
      .from("food_day_template_meals")
      .insert({ day_template_id: template.id, name: lm.meal_name, sort_order: lm.meal_order })
      .select("id")
      .single();

    if (dtMealErr || !dtMeal) continue;

    const mItems = itemsByMeal.get(lm.id) ?? [];
    if (mItems.length > 0) {
      await supabase.from("food_day_template_items").insert(
        mItems.map((i) => ({
          day_template_meal_id: dtMeal.id,
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

  return NextResponse.json({ id: template.id, name }, { status: 201 });
}
