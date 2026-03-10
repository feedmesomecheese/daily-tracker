import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// GET /api/food/items/[id]/servings — list all servings for a food item
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  // Verify the food item is accessible to this user (global or owned)
  const { data: foodItem, error: itemErr } = await supabase
    .from("food_items")
    .select("id")
    .eq("id", id)
    .eq("is_archived", false)
    .or(`owner_id.is.null,owner_id.eq.${user.id}`)
    .single();

  if (itemErr || !foodItem) return NextResponse.json({ error: "Not found or not authorized" }, { status: 404 });

  const { data: servings, error: servingsErr } = await supabase
    .from("food_item_servings")
    .select("id, food_item_id, label, calories, fat, carbs, protein, fiber, is_default, sort_order")
    .eq("food_item_id", id)
    .order("sort_order", { ascending: true });

  if (servingsErr) return NextResponse.json({ error: servingsErr.message }, { status: 500 });
  return NextResponse.json(servings ?? []);
}

// POST /api/food/items/[id]/servings — add a serving (any accessible food)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  // Verify the food is accessible (global or user-owned)
  const { data: foodItem, error: itemErr } = await supabase
    .from("food_items")
    .select("id")
    .eq("id", id)
    .eq("is_archived", false)
    .or(`owner_id.is.null,owner_id.eq.${user.id}`)
    .single();

  if (itemErr || !foodItem) return NextResponse.json({ error: "Not found or not authorized" }, { status: 404 });

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const label = typeof json.label === "string" ? json.label.trim() : "";
  if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });

  const calories = typeof json.calories === "number" ? json.calories : 0;
  const fat = typeof json.fat === "number" ? json.fat : 0;
  const carbs = typeof json.carbs === "number" ? json.carbs : 0;
  const protein = typeof json.protein === "number" ? json.protein : 0;
  const fiber = typeof json.fiber === "number" ? json.fiber : 0;
  const is_default = typeof json.is_default === "boolean" ? json.is_default : false;
  const sort_order = typeof json.sort_order === "number" ? json.sort_order : 0;

  const { data: serving, error: insertErr } = await supabase
    .from("food_item_servings")
    .insert({ food_item_id: id, owner_id: user.id, label, calories, fat, carbs, protein, fiber, is_default, sort_order })
    .select("id, food_item_id, label, calories, fat, carbs, protein, fiber, is_default, sort_order, owner_id")
    .single();

  if (insertErr || !serving) return NextResponse.json({ error: insertErr?.message ?? "Insert failed" }, { status: 500 });
  return NextResponse.json(serving, { status: 201 });
}
