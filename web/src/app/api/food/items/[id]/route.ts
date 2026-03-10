import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// PATCH /api/food/items/[id] — update a custom food item (owner only)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof json.name === "string") {
    const name = json.name.trim();
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    updates.name = name;
  }
  if (typeof json.category === "string") {
    const category = json.category.trim();
    if (!category) return NextResponse.json({ error: "category cannot be empty" }, { status: 400 });
    updates.category = category;
  }
  if ("sub_category" in json) {
    updates.sub_category = typeof json.sub_category === "string" ? json.sub_category.trim() || null : null;
  }
  if ("note" in json) {
    updates.note = typeof json.note === "string" ? json.note.trim() || null : null;
  }
  if (typeof json.is_archived === "boolean") {
    updates.is_archived = json.is_archived;
  }

  const { data: item, error: updateErr } = await supabase
    .from("food_items")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id, name, category, sub_category, note, is_default, owner_id, is_archived, created_at, updated_at")
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Not found or not authorized" }, { status: 404 });

  return NextResponse.json(item);
}

// DELETE /api/food/items/[id] — delete a custom food item (owner only)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from("food_items")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
