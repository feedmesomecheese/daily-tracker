import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// POST /api/food/items/[id]/favorite — toggle favorite for current user
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  // Check if the food item is accessible to this user
  const { data: foodItem, error: itemErr } = await supabase
    .from("food_items")
    .select("id")
    .eq("id", id)
    .eq("is_archived", false)
    .or(`owner_id.is.null,owner_id.eq.${user.id}`)
    .single();

  if (itemErr || !foodItem) return NextResponse.json({ error: "Not found or not authorized" }, { status: 404 });

  // Check if favorite already exists
  const { data: existing, error: checkErr } = await supabase
    .from("food_favorites")
    .select("food_item_id")
    .eq("owner_id", user.id)
    .eq("food_item_id", id)
    .maybeSingle();

  if (checkErr) return NextResponse.json({ error: checkErr.message }, { status: 500 });

  if (existing) {
    // Remove favorite
    const { error: deleteErr } = await supabase
      .from("food_favorites")
      .delete()
      .eq("owner_id", user.id)
      .eq("food_item_id", id);

    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    return NextResponse.json({ is_favorited: false });
  } else {
    // Add favorite
    const { error: insertErr } = await supabase
      .from("food_favorites")
      .insert({ owner_id: user.id, food_item_id: id });

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    return NextResponse.json({ is_favorited: true });
  }
}
