import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuth(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await getAuth(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data, error } = await supabase
    .from("lab_visits")
    .select(`id, visit_date, lab_name, provider, notes, created_at,
      lab_results(id, test_name, canonical_name, category, value, unit, ref_low, ref_high, ref_text, in_range, notes)`)
    .eq("id", id).eq("owner_id", userId).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await getAuth(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { visit_date, lab_name, provider, notes } = await req.json();

  const { data, error } = await supabase
    .from("lab_visits")
    .update({ visit_date, lab_name: lab_name ?? null, provider: provider ?? null, notes: notes ?? null, updated_at: new Date().toISOString() })
    .eq("id", id).eq("owner_id", userId).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await getAuth(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { error } = await supabase.from("lab_visits").delete().eq("id", id).eq("owner_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
