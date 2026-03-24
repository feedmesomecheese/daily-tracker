import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuthedClient(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase: null, user: null };
  return { supabase, user };
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
