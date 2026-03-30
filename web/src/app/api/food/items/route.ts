import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// GET /api/food/items — search food items with servings and favorites
export async function GET(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? "";
  const favoritesOnly = searchParams.get("favorites") === "true";
  const rawLimit = parseInt(searchParams.get("limit") ?? "40", 10);
  const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 40 : rawLimit, 100);

  // When filtering by favorites, first resolve the user's favorited IDs
  let favoritedIdFilter: string[] | null = null;
  if (favoritesOnly) {
    const { data: favData } = await supabase
      .from("food_favorites")
      .select("food_item_id")
      .eq("owner_id", user.id);
    favoritedIdFilter = (favData ?? []).map((f: { food_item_id: string }) => f.food_item_id);
    if (favoritedIdFilter.length === 0) return NextResponse.json([]);
  }

  let query = supabase
    .from("food_items")
    .select("id, name, category, sub_category, note, owner_id, created_at, glycemic_index")
    .eq("is_archived", false)
    .or(`owner_id.is.null,owner_id.eq.${user.id}`)
    .order("name", { ascending: true })
    .limit(limit);

  if (q) {
    query = query.ilike("name", `%${q}%`);
  }
  if (category) {
    query = query.eq("category", category);
  }
  if (favoritedIdFilter !== null) {
    query = query.in("id", favoritedIdFilter);
  }

  const { data: items, error: itemsErr } = await query;
  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  if (!items || items.length === 0) return NextResponse.json([]);

  const ids = (items as { id: string }[]).map((it) => it.id);

  // Fetch servings and favorites in parallel
  const [servingsResult, favoritesResult] = await Promise.all([
    supabase
      .from("food_item_servings")
      .select("id, food_item_id, label, calories, fat, carbs, protein, fiber, is_default, sort_order, owner_id")
      .in("food_item_id", ids)
      .order("sort_order", { ascending: true }),
    supabase
      .from("food_favorites")
      .select("food_item_id")
      .eq("owner_id", user.id)
      .in("food_item_id", ids),
  ]);

  if (servingsResult.error) return NextResponse.json({ error: servingsResult.error.message }, { status: 500 });
  if (favoritesResult.error) return NextResponse.json({ error: favoritesResult.error.message }, { status: 500 });

  const servingsByItem = new Map<string, typeof servingsResult.data>();
  for (const s of servingsResult.data ?? []) {
    if (!servingsByItem.has(s.food_item_id)) servingsByItem.set(s.food_item_id, []);
    servingsByItem.get(s.food_item_id)!.push(s);
  }

  const favoritedIds = new Set(((favoritesResult.data ?? []) as { food_item_id: string }[]).map((f) => f.food_item_id));

  const merged = (items as {
    id: string;
    name: string;
    category: string;
    sub_category: string | null;
    note: string | null;
    owner_id: string | null;
    created_at: string;
    glycemic_index: number | null;
  }[]).map((item) => ({
    ...item,
    is_custom: item.owner_id !== null,
    servings: servingsByItem.get(item.id) ?? [],
    is_favorited: favoritedIds.has(item.id),
  }));

  return NextResponse.json(merged);
}

// POST /api/food/items — create a custom food item with servings
export async function POST(req: Request) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = typeof json.name === "string" ? json.name.trim() : "";
  const category = typeof json.category === "string" ? json.category.trim() : "";
  const sub_category = typeof json.sub_category === "string" ? json.sub_category.trim() || null : null;
  const note = typeof json.note === "string" ? json.note.trim() || null : null;
  const servings = Array.isArray(json.servings) ? json.servings : [];

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!category) return NextResponse.json({ error: "category is required" }, { status: 400 });
  if (servings.length === 0) return NextResponse.json({ error: "at least one serving is required" }, { status: 400 });

  const { data: item, error: itemErr } = await supabase
    .from("food_items")
    .insert({ owner_id: user.id, name, category, sub_category, note, is_archived: false })
    .select("id, name, category, sub_category, note, owner_id, created_at")
    .single();

  if (itemErr || !item) return NextResponse.json({ error: itemErr?.message ?? "Insert failed" }, { status: 500 });

  const servingRows = (servings as Record<string, unknown>[]).map((s, i) => ({
    food_item_id: item.id,
    owner_id: user.id,
    label: typeof s.label === "string" ? s.label.trim() : "Serving",
    calories: typeof s.calories === "number" ? s.calories : 0,
    fat: typeof s.fat === "number" ? s.fat : 0,
    carbs: typeof s.carbs === "number" ? s.carbs : 0,
    protein: typeof s.protein === "number" ? s.protein : 0,
    fiber: typeof s.fiber === "number" ? s.fiber : 0,
    is_default: typeof s.is_default === "boolean" ? s.is_default : i === 0,
    sort_order: typeof s.sort_order === "number" ? s.sort_order : i,
  }));

  const { data: createdServings, error: servingsErr } = await supabase
    .from("food_item_servings")
    .insert(servingRows)
    .select("id, food_item_id, label, calories, fat, carbs, protein, fiber, is_default, sort_order");

  if (servingsErr) return NextResponse.json({ error: servingsErr.message }, { status: 500 });

  return NextResponse.json({ ...item, servings: createdServings ?? [], is_favorited: false }, { status: 201 });
}
