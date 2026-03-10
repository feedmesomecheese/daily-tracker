import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// GET /api/food/logs — paginated list of food logs with per-log macro totals
export async function GET(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const rawLimit = parseInt(searchParams.get("limit") ?? "30", 10);
  const rawOffset = parseInt(searchParams.get("offset") ?? "0", 10);
  const limit = isNaN(rawLimit) || rawLimit < 1 ? 30 : Math.min(rawLimit, 100);
  const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

  const { data: logs, error: logsErr } = await supabase
    .from("food_logs")
    .select("id, date, notes, is_submitted, submitted_at, created_at, updated_at")
    .eq("owner_id", user.id)
    .order("date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (logsErr) return NextResponse.json({ error: logsErr.message }, { status: 500 });
  if (!logs || logs.length === 0) return NextResponse.json([]);

  const logIds = (logs as { id: string }[]).map((l) => l.id);

  // Fetch all food_log_meals for these logs, then join food_log_items to sum macros
  const { data: meals, error: mealsErr } = await supabase
    .from("food_log_meals")
    .select("id, food_log_id")
    .in("food_log_id", logIds);

  if (mealsErr) return NextResponse.json({ error: mealsErr.message }, { status: 500 });

  type MealRow = { id: string; food_log_id: string };
  const mealIds = ((meals ?? []) as MealRow[]).map((m) => m.id);
  type ItemRow = {
    food_log_meal_id: string;
    calories: number | null;
    fat: number | null;
    carbs: number | null;
    protein: number | null;
    fiber: number | null;
  };

  let items: ItemRow[] = [];
  if (mealIds.length > 0) {
    // Chunk .in() calls to avoid URL length limits
    const chunkSize = 200;
    for (let i = 0; i < mealIds.length; i += chunkSize) {
      const chunk = mealIds.slice(i, i + chunkSize);
      const { data: itemChunk, error: itemErr } = await supabase
        .from("food_log_items")
        .select("food_log_meal_id, calories, fat, carbs, protein, fiber")
        .in("food_log_meal_id", chunk);
      if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 });
      items = items.concat((itemChunk ?? []) as ItemRow[]);
    }
  }

  // Build meal_id -> log_id map
  const mealToLog = new Map<string, string>();
  for (const m of (meals ?? []) as MealRow[]) {
    mealToLog.set(m.id, m.food_log_id);
  }

  // Accumulate totals per log_id
  type Totals = { calories: number; fat: number; carbs: number; protein: number; fiber: number };
  const totalsMap = new Map<string, Totals>();
  for (const logId of logIds) {
    totalsMap.set(logId, { calories: 0, fat: 0, carbs: 0, protein: 0, fiber: 0 });
  }
  for (const item of items) {
    const logId = mealToLog.get(item.food_log_meal_id);
    if (!logId) continue;
    const t = totalsMap.get(logId);
    if (!t) continue;
    t.calories += item.calories ?? 0;
    t.fat += item.fat ?? 0;
    t.carbs += item.carbs ?? 0;
    t.protein += item.protein ?? 0;
    t.fiber += item.fiber ?? 0;
  }

  const result = (logs as {
    id: string;
    date: string;
    notes: string | null;
    is_submitted: boolean;
    submitted_at: string | null;
  }[]).map((log) => {
    const t = totalsMap.get(log.id) ?? { calories: 0, fat: 0, carbs: 0, protein: 0, fiber: 0 };
    return {
      id: log.id,
      date: log.date,
      notes: log.notes,
      is_submitted: log.is_submitted,
      submitted_at: log.submitted_at,
      total_calories: t.calories,
      total_protein: t.protein,
      total_fat: t.fat,
      total_carbs: t.carbs,
      total_fiber: t.fiber,
    };
  });

  return NextResponse.json(result);
}

// DELETE /api/food/logs — dev: delete ALL food logs (and cascaded meals/items) for the current user
export async function DELETE(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { error } = await supabase
    .from("food_logs")
    .delete()
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// POST /api/food/logs — upsert a food log by date, auto-create "Meal 1" if new
export async function POST(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const date = typeof json.date === "string" ? json.date.trim() : "";
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
  }
  const notes = typeof json.notes === "string" ? json.notes.trim() || null : null;

  // Check if a log already exists for this date
  const { data: existing, error: existErr } = await supabase
    .from("food_logs")
    .select("id, date, is_submitted")
    .eq("owner_id", user.id)
    .eq("date", date)
    .maybeSingle();

  if (existErr) return NextResponse.json({ error: existErr.message }, { status: 500 });

  if (existing) {
    // Update notes if provided
    if (notes !== null) {
      const { error: updateErr } = await supabase
        .from("food_logs")
        .update({ notes, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("owner_id", user.id);
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    return NextResponse.json({ id: existing.id, date: existing.date, is_new: false });
  }

  // Create new food log
  const { data: newLog, error: insertErr } = await supabase
    .from("food_logs")
    .insert({
      owner_id: user.id,
      date,
      notes,
      is_submitted: false,
    })
    .select("id, date")
    .single();

  if (insertErr || !newLog) return NextResponse.json({ error: insertErr?.message ?? "Insert failed" }, { status: 500 });

  // Auto-create "Meal 1"
  const { error: mealErr } = await supabase
    .from("food_log_meals")
    .insert({
      food_log_id: newLog.id,
      meal_name: "Meal 1",
      meal_order: 1,
    });

  if (mealErr) return NextResponse.json({ error: mealErr.message }, { status: 500 });

  return NextResponse.json({ id: newLog.id, date: newLog.date, is_new: true }, { status: 201 });
}
