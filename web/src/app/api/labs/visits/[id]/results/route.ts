import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuth(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId } = await getAuth(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: visitId } = await params;

  // Verify the visit belongs to this user
  const { data: visit } = await supabase
    .from("lab_visits")
    .select("id")
    .eq("id", visitId)
    .eq("owner_id", userId)
    .single();

  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });

  const body = await req.json();

  const { data, error } = await supabase
    .from("lab_results")
    .insert({
      visit_id: visitId,
      test_name: body.test_name,
      canonical_name: body.canonical_name ?? null,
      category: body.category ?? null,
      value: body.value ?? null,
      unit: body.unit ?? null,
      ref_low: body.ref_low ?? null,
      ref_high: body.ref_high ?? null,
      ref_text: body.ref_text ?? null,
      in_range: body.in_range ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
