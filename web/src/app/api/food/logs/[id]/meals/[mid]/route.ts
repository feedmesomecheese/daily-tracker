import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
}

// Verify the meal belongs to the authed user by joining through food_logs
async function verifyMealAccess(
  supabase: ReturnType<typeof supabaseServerFromRequest>,
  mealId: string,
  logId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("food_log_meals")
    .select("id, food_logs!inner(owner_id)")
    .eq("id", mealId)
    .eq("food_log_id", logId)
    .single();

  if (error || !data) return false;
  const ownerRow = data as { id: string; food_logs: { owner_id: string } | { owner_id: string }[] };
  const owner = Array.isArray(ownerRow.food_logs) ? ownerRow.food_logs[0] : ownerRow.food_logs;
  return owner?.owner_id === userId;
}

// PATCH /api/food/logs/[id]/meals/[mid] — rename, reorder, or set meal_time
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, mid } = await params;

  const hasAccess = await verifyMealAccess(supabase, mid, id, user.id);
  if (!hasAccess) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let json: Record<string, unknown>;
  try { json = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const updates: Record<string, unknown> = {};
  if (typeof json.meal_name === "string") {
    const name = json.meal_name.trim();
    if (!name) return NextResponse.json({ error: "meal_name cannot be empty" }, { status: 400 });
    updates.meal_name = name;
  }
  if ("meal_time" in json) {
    updates.meal_time = typeof json.meal_time === "string" ? json.meal_time.trim() || null : null;
  }
  if (typeof json.meal_order === "number") {
    updates.meal_order = json.meal_order;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: updated, error: updateErr } = await supabase
    .from("food_log_meals")
    .update(updates)
    .eq("id", mid)
    .select("id, food_log_id, meal_name, meal_order, meal_time, created_at")
    .single();

  if (updateErr || !updated) return NextResponse.json({ error: updateErr?.message ?? "Update failed" }, { status: 500 });

  return NextResponse.json(updated);
}

// DELETE /api/food/logs/[id]/meals/[mid] — delete meal (cascades to items)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const { supabase, user } = await getAuthedClient(req);
  if (!supabase || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id, mid } = await params;

  const hasAccess = await verifyMealAccess(supabase, mid, id, user.id);
  if (!hasAccess) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("food_log_meals")
    .delete()
    .eq("id", mid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
