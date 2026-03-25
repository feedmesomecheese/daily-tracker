import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

async function getAuth(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase, userId: null };
  return { supabase, userId: user.id };
}

export async function GET(req: Request) {
  const { supabase, userId } = await getAuth(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("lab_visits")
    .select(`id, visit_date, lab_name, provider, notes, created_at,
      lab_results(id, test_name, category, value, unit, ref_low, ref_high, ref_text, in_range)`)
    .eq("owner_id", userId)
    .order("visit_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const { supabase, userId } = await getAuth(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { visit_date, lab_name, provider, notes, results } = body;
  if (!visit_date) return NextResponse.json({ error: "visit_date is required" }, { status: 400 });

  const { data: visit, error: visitError } = await supabase
    .from("lab_visits")
    .insert({ owner_id: userId, visit_date, lab_name: lab_name || null, provider: provider || null, notes: notes || null })
    .select()
    .single();

  if (visitError) return NextResponse.json({ error: visitError.message }, { status: 500 });

  if (Array.isArray(results) && results.length > 0) {
    const rows = results.map((r: {
      test_name: string; canonical_name?: string; category?: string; value?: number; unit?: string;
      ref_low?: number; ref_high?: number; ref_text?: string; in_range?: boolean; notes?: string;
    }) => ({
      visit_id: visit.id,
      test_name: r.test_name,
      canonical_name: r.canonical_name || null,
      category: r.category || null,
      value: r.value ?? null,
      unit: r.unit || null,
      ref_low: r.ref_low ?? null,
      ref_high: r.ref_high ?? null,
      ref_text: r.ref_text || null,
      in_range: r.in_range ?? null,
      notes: r.notes || null,
    }));
    const { error: resultsError } = await supabase.from("lab_results").insert(rows);
    if (resultsError) return NextResponse.json({ error: resultsError.message }, { status: 500 });
  }

  return NextResponse.json(visit, { status: 201 });
}
