import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// GET /api/food/plans — list all plans with meal count + totals
export async function GET(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: plans, error: pErr } = await supabase
    .from("food_logs")
    .select("id, plan_name, created_at")
    .eq("owner_id", user.id)
    .eq("is_plan", true)
    .order("created_at", { ascending: false });

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!plans || plans.length === 0) return NextResponse.json([]);

  const planIds = (plans as { id: string }[]).map((p) => p.id);

  const { data: meals } = await supabase
    .from("food_log_meals")
    .select("id, food_log_id")
    .in("food_log_id", planIds);

  const mealIds = (meals ?? []).map((m: { id: string }) => m.id);

  let items: { food_log_meal_id: string; calories: number | null; protein: number | null; fat: number | null; carbs: number | null }[] = [];
  if (mealIds.length > 0) {
    const { data: itemData } = await supabase
      .from("food_log_items")
      .select("food_log_meal_id, calories, protein, fat, carbs")
      .in("food_log_meal_id", mealIds);
    items = itemData ?? [];
  }

  const mealsByPlan = new Map<string, string[]>();
  for (const m of (meals ?? []) as { id: string; food_log_id: string }[]) {
    if (!mealsByPlan.has(m.food_log_id)) mealsByPlan.set(m.food_log_id, []);
    mealsByPlan.get(m.food_log_id)!.push(m.id);
  }

  const itemsByMeal = new Map<string, typeof items>();
  for (const i of items) {
    if (!itemsByMeal.has(i.food_log_meal_id)) itemsByMeal.set(i.food_log_meal_id, []);
    itemsByMeal.get(i.food_log_meal_id)!.push(i);
  }

  const result = (plans as { id: string; plan_name: string | null; created_at: string }[]).map((p) => {
    const planMealIds = mealsByPlan.get(p.id) ?? [];
    const allItems = planMealIds.flatMap((mid) => itemsByMeal.get(mid) ?? []);
    return {
      id: p.id,
      name: p.plan_name ?? "Untitled Plan",
      created_at: p.created_at,
      meal_count: planMealIds.length,
      total_calories: allItems.reduce((s, i) => s + (i.calories ?? 0), 0),
      total_protein: allItems.reduce((s, i) => s + (i.protein ?? 0), 0),
      total_fat: allItems.reduce((s, i) => s + (i.fat ?? 0), 0),
      total_carbs: allItems.reduce((s, i) => s + (i.carbs ?? 0), 0),
    };
  });

  return NextResponse.json(result);
}

// POST /api/food/plans — create a new plan
export async function POST(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = typeof json.name === "string" ? json.name.trim() : "New Plan";

  const { data: plan, error } = await supabase
    .from("food_logs")
    .insert({ owner_id: user.id, is_plan: true, plan_name: name, date: null })
    .select("id, plan_name")
    .single();

  if (error || !plan) return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });

  return NextResponse.json({ id: plan.id, name: plan.plan_name }, { status: 201 });
}
