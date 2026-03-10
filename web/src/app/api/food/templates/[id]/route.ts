import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// GET /api/food/templates/[id] — fetch a single template with its items
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  const { data: template, error: tErr } = await supabase
    .from("food_meal_templates")
    .select("id, name, created_at, updated_at")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (tErr || !template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: items, error: iErr } = await supabase
    .from("food_meal_template_items")
    .select("id, food_item_id, food_item_serving_id, food_name_snapshot, serving_label_snapshot, qty, calories, fat, carbs, protein, fiber, sort_order, created_at")
    .eq("template_id", id)
    .order("sort_order", { ascending: true });

  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  return NextResponse.json({ ...template, items: items ?? [] });
}

// PATCH /api/food/templates/[id] — rename a template
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = typeof json.name === "string" ? json.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data: updated, error } = await supabase
    .from("food_meal_templates")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id, name, created_at, updated_at")
    .single();

  if (error || !updated) return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });

  return NextResponse.json(updated);
}

// DELETE /api/food/templates/[id] — delete a template (CASCADE removes items)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from("food_meal_templates")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
