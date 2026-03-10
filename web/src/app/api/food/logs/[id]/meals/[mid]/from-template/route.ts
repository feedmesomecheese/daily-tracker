import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// POST /api/food/logs/[id]/meals/[mid]/from-template
// Appends all items from a meal template into an existing log meal
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, mid } = await params;

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const template_id = typeof json.template_id === "string" ? json.template_id : "";
  if (!template_id) return NextResponse.json({ error: "template_id is required" }, { status: 400 });

  // Step 1: Verify the meal belongs to the user via food_logs
  const { data: mealRow, error: mealErr } = await supabase
    .from("food_log_meals")
    .select("id, food_log_id")
    .eq("id", mid)
    .eq("food_log_id", id)
    .single();

  if (mealErr || !mealRow) return NextResponse.json({ error: "Meal not found" }, { status: 404 });

  const { data: logRow, error: logErr } = await supabase
    .from("food_logs")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (logErr || !logRow) return NextResponse.json({ error: "Meal not found" }, { status: 404 });

  // Step 2: Verify the template belongs to the user
  const { data: template, error: tErr } = await supabase
    .from("food_meal_templates")
    .select("id")
    .eq("id", template_id)
    .eq("owner_id", user.id)
    .single();

  if (tErr || !template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  // Step 3: Fetch the template items ordered by sort_order
  const { data: templateItems, error: tiErr } = await supabase
    .from("food_meal_template_items")
    .select("food_item_id, food_item_serving_id, food_name_snapshot, serving_label_snapshot, qty, calories, fat, carbs, protein, fiber, sort_order")
    .eq("template_id", template_id)
    .order("sort_order", { ascending: true });

  if (tiErr) return NextResponse.json({ error: tiErr.message }, { status: 500 });

  const items = templateItems ?? [];
  if (items.length === 0) return NextResponse.json({ success: true, items_added: 0 });

  // Step 4a: Get current max sort_order for existing items in this meal
  const { data: existingItems, error: sortErr } = await supabase
    .from("food_log_items")
    .select("sort_order")
    .eq("food_log_meal_id", mid)
    .order("sort_order", { ascending: false })
    .limit(1);

  if (sortErr) return NextResponse.json({ error: sortErr.message }, { status: 500 });

  type SortRow = { sort_order: number };
  const lastItem = (existingItems ?? []) as SortRow[];
  const baseSort = lastItem.length > 0 ? lastItem[0].sort_order + 1 : 0;

  // Step 4b: Insert each template item as a food_log_item
  type TemplateItemRow = {
    food_item_id: string | null;
    food_item_serving_id: string | null;
    food_name_snapshot: string | null;
    serving_label_snapshot: string | null;
    qty: number | null;
    calories: number | null;
    fat: number | null;
    carbs: number | null;
    protein: number | null;
    fiber: number | null;
    sort_order: number | null;
  };

  const newLogItems = (items as TemplateItemRow[]).map((item, i) => ({
    food_log_meal_id: mid,
    food_item_id: item.food_item_id ?? null,
    food_item_serving_id: item.food_item_serving_id ?? null,
    food_name_snapshot: item.food_name_snapshot ?? "",
    serving_label_snapshot: item.serving_label_snapshot ?? "",
    qty: item.qty ?? 1,
    calories: item.calories ?? 0,
    fat: item.fat ?? 0,
    carbs: item.carbs ?? 0,
    protein: item.protein ?? 0,
    fiber: item.fiber ?? 0,
    sort_order: baseSort + i,
  }));

  const { error: insertErr } = await supabase
    .from("food_log_items")
    .insert(newLogItems);

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({ success: true, items_added: newLogItems.length });
}
