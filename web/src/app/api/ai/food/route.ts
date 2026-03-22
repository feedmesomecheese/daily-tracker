import { NextResponse } from "next/server";
import { validateAiKey, getAiSupabase, getAiOwnerId, AI_CORS_HEADERS, handleAiOptions } from "@/lib/aiAuth";

export async function OPTIONS() { return handleAiOptions(); }

export async function GET(req: Request) {
  const authError = validateAiKey(req);
  if (authError) return authError;

  const supabase = getAiSupabase();
  const ownerId = getAiOwnerId();

  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const end = url.searchParams.get("end") || today;
  let start = url.searchParams.get("start") || "";
  if (!start) {
    const days = Math.min(parseInt(url.searchParams.get("days") || "30"), 3650);
    const startDate = new Date(end);
    startDate.setDate(startDate.getDate() - days + 1);
    start = startDate.toISOString().slice(0, 10);
  }

  // Fetch food logs for the date range
  const { data: logs, error: logsErr } = await supabase
    .from("food_logs")
    .select("id, date, is_fasted, notes")
    .eq("owner_id", ownerId)
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: false });

  if (logsErr) return NextResponse.json({ error: logsErr.message }, { status: 500 });
  if (!logs || logs.length === 0) {
    return NextResponse.json({ period: { start, end }, note: "No food logs found for this period.", days: [] }, { headers: AI_CORS_HEADERS });
  }

  const logIds = logs.map((l) => l.id);

  // Fetch meals for all logs
  const { data: meals, error: mealsErr } = await supabase
    .from("food_log_meals")
    .select("id, food_log_id, meal_name, meal_order")
    .in("food_log_id", logIds)
    .order("meal_order", { ascending: true });

  if (mealsErr) return NextResponse.json({ error: mealsErr.message }, { status: 500 });

  const mealIds = (meals || []).map((m) => m.id);

  // Fetch items for all meals (chunked)
  type ItemRow = { food_log_meal_id: string; calories: number | null; protein: number | null; fat: number | null; carbs: number | null; fiber: number | null };
  const allItems: ItemRow[] = [];
  const CHUNK = 200;
  for (let i = 0; i < mealIds.length; i += CHUNK) {
    const chunk = mealIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("food_log_items")
      .select("food_log_meal_id, calories, protein, fat, carbs, fiber")
      .in("food_log_meal_id", chunk);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data) allItems.push(...(data as ItemRow[]));
  }

  // Aggregate items -> meal totals
  type MacroTotals = { calories: number; protein: number; fat: number; carbs: number; fiber: number };
  const mealTotals = new Map<string, MacroTotals>();
  for (const item of allItems) {
    if (!mealTotals.has(item.food_log_meal_id)) {
      mealTotals.set(item.food_log_meal_id, { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 });
    }
    const t = mealTotals.get(item.food_log_meal_id)!;
    t.calories += item.calories ?? 0;
    t.protein += item.protein ?? 0;
    t.fat += item.fat ?? 0;
    t.carbs += item.carbs ?? 0;
    t.fiber += item.fiber ?? 0;
  }

  // Group meals by log_id
  type MealRow = { id: string; food_log_id: string; meal_name: string; meal_order: number };
  const mealsByLog = new Map<string, MealRow[]>();
  for (const meal of (meals || []) as MealRow[]) {
    if (!mealsByLog.has(meal.food_log_id)) mealsByLog.set(meal.food_log_id, []);
    mealsByLog.get(meal.food_log_id)!.push(meal);
  }

  const round = (n: number) => Math.round(n * 10) / 10;

  // Build output
  const days = logs.map((log) => {
    const logMeals = mealsByLog.get(log.id) || [];
    const mealSummaries = logMeals.map((meal) => {
      const t = mealTotals.get(meal.id) ?? { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
      return {
        meal: meal.meal_name,
        calories: round(t.calories),
        protein_g: round(t.protein),
        fat_g: round(t.fat),
        carbs_g: round(t.carbs),
        fiber_g: round(t.fiber),
      };
    });

    const totals = mealSummaries.reduce(
      (acc, m) => ({
        calories: acc.calories + m.calories,
        protein_g: acc.protein_g + m.protein_g,
        fat_g: acc.fat_g + m.fat_g,
        carbs_g: acc.carbs_g + m.carbs_g,
        fiber_g: acc.fiber_g + m.fiber_g,
      }),
      { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0, fiber_g: 0 }
    );

    return {
      date: log.date,
      is_fasted: log.is_fasted,
      notes: log.notes,
      totals,
      meals: mealSummaries,
    };
  });

  return NextResponse.json({
    period: { start, end },
    note: "Only days with logged food are included. Gaps do not mean the user didn't eat — they may have continued eating similarly to their last logged day.",
    days,
  }, { headers: AI_CORS_HEADERS });
}
