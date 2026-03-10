import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// POST /api/food/logs/[id]/meals — add a new meal to a log
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  // Verify the log belongs to this user
  const { data: log, error: logErr } = await supabase
    .from("food_logs")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (logErr || !log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let json: Record<string, unknown> = {};
  try { json = await req.json(); } catch { /* body is optional */ }

  // Determine current max meal_order for auto-numbering
  const { data: existingMeals, error: mealsErr } = await supabase
    .from("food_log_meals")
    .select("meal_order, meal_name")
    .eq("food_log_id", id)
    .order("meal_order", { ascending: false })
    .limit(1);

  if (mealsErr) return NextResponse.json({ error: mealsErr.message }, { status: 500 });

  type MealRow = { meal_order: number; meal_name: string };
  const lastMeal = (existingMeals ?? []) as MealRow[];
  const nextOrder = lastMeal.length > 0 ? lastMeal[0].meal_order + 1 : 1;
  const mealName = typeof json.meal_name === "string" && json.meal_name.trim()
    ? json.meal_name.trim()
    : `Meal ${nextOrder}`;

  const { data: newMeal, error: insertErr } = await supabase
    .from("food_log_meals")
    .insert({
      food_log_id: id,
      meal_name: mealName,
      meal_order: nextOrder,
    })
    .select("id, food_log_id, meal_name, meal_order, meal_time, created_at")
    .single();

  if (insertErr || !newMeal) return NextResponse.json({ error: insertErr?.message ?? "Insert failed" }, { status: 500 });

  return NextResponse.json(newMeal, { status: 201 });
}
