import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// POST /api/food/templates/[id]/items — add an item to a template
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  // Verify template belongs to user
  const { data: template, error: tErr } = await supabase
    .from("food_meal_templates")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (tErr || !template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Get current max sort_order
  const { data: existing } = await supabase
    .from("food_meal_template_items")
    .select("sort_order")
    .eq("template_id", id)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = existing && existing.length > 0 ? (existing[0].sort_order ?? 0) + 1 : 0;

  const { data: item, error: iErr } = await supabase
    .from("food_meal_template_items")
    .insert({
      template_id: id,
      food_item_id: typeof json.food_item_id === "string" ? json.food_item_id : null,
      food_item_serving_id: typeof json.food_item_serving_id === "string" ? json.food_item_serving_id : null,
      food_name_snapshot: typeof json.food_name_snapshot === "string" ? json.food_name_snapshot : "",
      serving_label_snapshot: typeof json.serving_label_snapshot === "string" ? json.serving_label_snapshot : "",
      qty: typeof json.qty === "number" ? json.qty : 1,
      calories: typeof json.calories === "number" ? json.calories : 0,
      fat: typeof json.fat === "number" ? json.fat : 0,
      carbs: typeof json.carbs === "number" ? json.carbs : 0,
      protein: typeof json.protein === "number" ? json.protein : 0,
      fiber: typeof json.fiber === "number" ? json.fiber : 0,
      sort_order: nextOrder,
    })
    .select("id")
    .single();

  if (iErr || !item) return NextResponse.json({ error: iErr?.message ?? "Insert failed" }, { status: 500 });

  return NextResponse.json({ id: item.id }, { status: 201 });
}
