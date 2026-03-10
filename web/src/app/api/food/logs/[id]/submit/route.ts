import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// POST /api/food/logs/[id]/submit — compute macro totals and write to DT metric log
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  // 1. Fetch the food_log (verify ownership)
  const { data: log, error: logErr } = await supabase
    .from("food_logs")
    .select("id, date, is_submitted")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (logErr || !log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // 2. Fetch all meals for this log, then all items for those meals
  const { data: meals, error: mealsErr } = await supabase
    .from("food_log_meals")
    .select("id")
    .eq("food_log_id", id);

  if (mealsErr) return NextResponse.json({ error: mealsErr.message }, { status: 500 });

  type ItemRow = {
    calories: number | null;
    fat: number | null;
    carbs: number | null;
    protein: number | null;
    fiber: number | null;
  };

  const mealIds = ((meals ?? []) as { id: string }[]).map((m) => m.id);
  let items: ItemRow[] = [];

  if (mealIds.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < mealIds.length; i += chunkSize) {
      const chunk = mealIds.slice(i, i + chunkSize);
      const { data: itemChunk, error: itemErr } = await supabase
        .from("food_log_items")
        .select("calories, fat, carbs, protein, fiber")
        .in("food_log_meal_id", chunk);
      if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
      items = items.concat((itemChunk ?? []) as ItemRow[]);
    }
  }

  type TotalsAcc = { calories: number; fat: number; carbs: number; protein: number; fiber: number };
  // 3. Sum totals
  const totals = items.reduce<TotalsAcc>(
    (acc, item) => ({
      calories: acc.calories + (item.calories ?? 0),
      fat: acc.fat + (item.fat ?? 0),
      carbs: acc.carbs + (item.carbs ?? 0),
      protein: acc.protein + (item.protein ?? 0),
      fiber: acc.fiber + (item.fiber ?? 0),
    }),
    { calories: 0, fat: 0, carbs: 0, protein: 0, fiber: 0 }
  );

  const { date } = log as { date: string; id: string; is_submitted: boolean };

  // 4. Upsert 5 DT metric config rows
  const metricDefs = [
    { metric_id: "food_calories", metric_name: "Food Calories" },
    { metric_id: "food_protein",  metric_name: "Food Protein" },
    { metric_id: "food_fat",      metric_name: "Food Fat" },
    { metric_id: "food_carbs",    metric_name: "Food Carbs" },
    { metric_id: "food_fiber",    metric_name: "Food Fiber" },
  ];

  const configRows = metricDefs.map((m) => ({
    metric_id: m.metric_id,
    owner_id: user.id,
    metric_name: m.metric_name,
    type: "number",
    group: "Food",
    active: true,
  }));

  const { error: configErr } = await supabase
    .from("config")
    .upsert(configRows, { onConflict: "metric_id,owner_id", ignoreDuplicates: false });

  if (configErr) return NextResponse.json({ error: configErr.message }, { status: 500 });

  // 5. Upsert 5 log rows
  const logRows = [
    { owner_id: user.id, date, metric_id: "food_calories", value: totals.calories },
    { owner_id: user.id, date, metric_id: "food_protein",  value: totals.protein },
    { owner_id: user.id, date, metric_id: "food_fat",      value: totals.fat },
    { owner_id: user.id, date, metric_id: "food_carbs",    value: totals.carbs },
    { owner_id: user.id, date, metric_id: "food_fiber",    value: totals.fiber },
  ];

  const { error: logUpsertErr } = await supabase
    .from("log")
    .upsert(logRows, { onConflict: "owner_id,date,metric_id" });

  if (logUpsertErr) return NextResponse.json({ error: logUpsertErr.message }, { status: 500 });

  // 6. Mark food_log as submitted
  const { error: submitErr } = await supabase
    .from("food_logs")
    .update({
      is_submitted: true,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (submitErr) return NextResponse.json({ error: submitErr.message }, { status: 500 });

  return NextResponse.json({ success: true, totals });
}
