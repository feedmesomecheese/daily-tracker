import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// GET /api/food/templates — list all meal templates with summary stats
export async function GET(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: templates, error: tErr } = await supabase
    .from("food_meal_templates")
    .select("id, name, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
  if (!templates || templates.length === 0) return NextResponse.json([]);

  const templateIds = (templates as { id: string }[]).map((t) => t.id);

  const { data: items, error: iErr } = await supabase
    .from("food_meal_template_items")
    .select("template_id, calories, protein, fat, carbs, fiber")
    .in("template_id", templateIds);

  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  type ItemRow = {
    template_id: string;
    calories: number | null;
    protein: number | null;
    fat: number | null;
    carbs: number | null;
    fiber: number | null;
  };

  const itemsByTemplate = new Map<string, ItemRow[]>();
  for (const item of (items ?? []) as ItemRow[]) {
    if (!itemsByTemplate.has(item.template_id)) itemsByTemplate.set(item.template_id, []);
    itemsByTemplate.get(item.template_id)!.push(item);
  }

  const result = (templates as { id: string; name: string; created_at: string }[]).map((t) => {
    const tItems = itemsByTemplate.get(t.id) ?? [];
    return {
      id: t.id,
      name: t.name,
      created_at: t.created_at,
      item_count: tItems.length,
      total_calories: tItems.reduce((sum, i) => sum + (i.calories ?? 0), 0),
      total_protein: tItems.reduce((sum, i) => sum + (i.protein ?? 0), 0),
      total_fat: tItems.reduce((sum, i) => sum + (i.fat ?? 0), 0),
      total_carbs: tItems.reduce((sum, i) => sum + (i.carbs ?? 0), 0),
      total_fiber: tItems.reduce((sum, i) => sum + (i.fiber ?? 0), 0),
    };
  });

  return NextResponse.json(result);
}

// POST /api/food/templates — create a template from a meal or explicit items
export async function POST(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = typeof json.name === "string" ? json.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const from_meal_id = typeof json.from_meal_id === "string" ? json.from_meal_id : null;

  if (from_meal_id) {
    // --- Create from an existing logged meal ---

    // Verify the meal belongs to the user: fetch meal → log → owner_id
    const { data: mealRow, error: mealErr } = await supabase
      .from("food_log_meals")
      .select("id, food_log_id")
      .eq("id", from_meal_id)
      .single();

    if (mealErr || !mealRow) return NextResponse.json({ error: "Meal not found" }, { status: 404 });

    const { data: logRow, error: logErr } = await supabase
      .from("food_logs")
      .select("id")
      .eq("id", (mealRow as { id: string; food_log_id: string }).food_log_id)
      .eq("owner_id", user.id)
      .single();

    if (logErr || !logRow) return NextResponse.json({ error: "Meal not found" }, { status: 404 });

    // Fetch the meal's log items ordered by sort_order
    const { data: logItems, error: liErr } = await supabase
      .from("food_log_items")
      .select("food_item_id, food_item_serving_id, food_name_snapshot, serving_label_snapshot, qty, calories, fat, carbs, protein, fiber, sort_order")
      .eq("food_log_meal_id", from_meal_id)
      .order("sort_order", { ascending: true });

    if (liErr) return NextResponse.json({ error: liErr.message }, { status: 500 });

    // Insert template
    const { data: template, error: tErr } = await supabase
      .from("food_meal_templates")
      .insert({ owner_id: user.id, name })
      .select("id")
      .single();

    if (tErr || !template) return NextResponse.json({ error: tErr?.message ?? "Insert failed" }, { status: 500 });

    type LogItemRow = {
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

    const sourceItems = (logItems ?? []) as LogItemRow[];

    if (sourceItems.length > 0) {
      const templateItems = sourceItems.map((li) => ({
        template_id: template.id,
        food_item_id: li.food_item_id ?? null,
        food_item_serving_id: li.food_item_serving_id ?? null,
        food_name_snapshot: li.food_name_snapshot ?? "",
        serving_label_snapshot: li.serving_label_snapshot ?? "",
        qty: li.qty ?? 1,
        calories: li.calories ?? 0,
        fat: li.fat ?? 0,
        carbs: li.carbs ?? 0,
        protein: li.protein ?? 0,
        fiber: li.fiber ?? 0,
        sort_order: li.sort_order ?? 0,
      }));

      const { error: itemsErr } = await supabase
        .from("food_meal_template_items")
        .insert(templateItems);

      if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }

    return NextResponse.json({ id: template.id, name, item_count: sourceItems.length }, { status: 201 });
  }

  // --- Create from explicit items array ---
  const rawItems = Array.isArray(json.items) ? json.items : [];

  const { data: template, error: tErr } = await supabase
    .from("food_meal_templates")
    .insert({ owner_id: user.id, name })
    .select("id")
    .single();

  if (tErr || !template) return NextResponse.json({ error: tErr?.message ?? "Insert failed" }, { status: 500 });

  if (rawItems.length > 0) {
    type RawItem = Record<string, unknown>;
    const templateItems = (rawItems as RawItem[]).map((item, i) => ({
      template_id: template.id,
      food_item_id: typeof item.food_item_id === "string" ? item.food_item_id : null,
      food_item_serving_id: typeof item.food_item_serving_id === "string" ? item.food_item_serving_id : null,
      food_name_snapshot: typeof item.food_name_snapshot === "string" ? item.food_name_snapshot : "",
      serving_label_snapshot: typeof item.serving_label_snapshot === "string" ? item.serving_label_snapshot : "",
      qty: typeof item.qty === "number" ? item.qty : 1,
      calories: typeof item.calories === "number" ? item.calories : 0,
      fat: typeof item.fat === "number" ? item.fat : 0,
      carbs: typeof item.carbs === "number" ? item.carbs : 0,
      protein: typeof item.protein === "number" ? item.protein : 0,
      fiber: typeof item.fiber === "number" ? item.fiber : 0,
      sort_order: typeof item.sort_order === "number" ? item.sort_order : i,
    }));

    const { error: itemsErr } = await supabase
      .from("food_meal_template_items")
      .insert(templateItems);

    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: template.id, name, item_count: rawItems.length }, { status: 201 });
}
