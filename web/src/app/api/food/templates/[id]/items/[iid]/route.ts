import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// PATCH /api/food/templates/[id]/items/[iid] — update qty (macros scale proportionally)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; iid: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, iid } = await params;

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const newQty = typeof json.qty === "number" ? json.qty : null;
  if (!newQty || newQty <= 0) return NextResponse.json({ error: "qty must be a positive number" }, { status: 400 });

  // Verify template belongs to user
  const { data: template, error: tErr } = await supabase
    .from("food_meal_templates")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (tErr || !template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch current item to scale macros
  const { data: item, error: iErr } = await supabase
    .from("food_meal_template_items")
    .select("id, qty, calories, protein, fat, carbs, fiber")
    .eq("id", iid)
    .eq("template_id", id)
    .single();

  if (iErr || !item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const cur = item as { qty: number; calories: number; protein: number; fat: number; carbs: number; fiber: number };
  const ratio = newQty / cur.qty;

  const { data: updated, error: uErr } = await supabase
    .from("food_meal_template_items")
    .update({
      qty: newQty,
      calories: cur.calories * ratio,
      protein: cur.protein * ratio,
      fat: cur.fat * ratio,
      carbs: cur.carbs * ratio,
      fiber: cur.fiber * ratio,
    })
    .eq("id", iid)
    .eq("template_id", id)
    .select()
    .single();

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json(updated);
}

// DELETE /api/food/templates/[id]/items/[iid] — remove an item from a template
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; iid: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, iid } = await params;

  // Verify template belongs to user
  const { data: template, error: tErr } = await supabase
    .from("food_meal_templates")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (tErr || !template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("food_meal_template_items")
    .delete()
    .eq("id", iid)
    .eq("template_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
