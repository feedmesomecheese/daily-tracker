import { NextResponse } from "next/server";
import { validateAiKey, getAiSupabase, getAiOwnerId, AI_CORS_HEADERS, handleAiOptions } from "@/lib/aiAuth";

export async function OPTIONS() { return handleAiOptions(); }

export async function GET(req: Request) {
  const authError = validateAiKey(req);
  if (authError) return authError;

  try {
    const supabase = getAiSupabase();
    const ownerId = getAiOwnerId();
    const url = new URL(req.url);
    const test = url.searchParams.get("test");     // filter by test name (partial match)
    const category = url.searchParams.get("category");
    const since = url.searchParams.get("since");   // YYYY-MM-DD
    const abnormal = url.searchParams.get("abnormal") === "true";

    const { data: visits, error } = await supabase
      .from("lab_visits")
      .select(`id, visit_date, lab_name, provider, notes,
        lab_results(id, test_name, category, value, unit, ref_low, ref_high, ref_text, in_range)`)
      .eq("owner_id", ownerId)
      .order("visit_date", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: AI_CORS_HEADERS });

    const all = visits ?? [];

    // Build flat results list for filtering / trend queries
    type Result = {
      visit_date: string;
      lab_name: string | null;
      test_name: string;
      category: string | null;
      value: number | null;
      unit: string | null;
      ref_low: number | null;
      ref_high: number | null;
      ref_text: string | null;
      in_range: boolean | null;
    };

    let flat: Result[] = [];
    for (const v of all) {
      for (const r of (v.lab_results ?? [])) {
        flat.push({
          visit_date: v.visit_date,
          lab_name: v.lab_name,
          test_name: r.test_name,
          category: r.category,
          value: r.value,
          unit: r.unit,
          ref_low: r.ref_low,
          ref_high: r.ref_high,
          ref_text: r.ref_text,
          in_range: r.in_range,
        });
      }
    }

    if (test) flat = flat.filter((r) => r.test_name.toLowerCase().includes(test.toLowerCase()));
    if (category) flat = flat.filter((r) => r.category?.toLowerCase() === category.toLowerCase());
    if (since) flat = flat.filter((r) => r.visit_date >= since);
    if (abnormal) flat = flat.filter((r) => r.in_range === false);

    // Summary: unique tests and most recent values
    const latestByTest: Record<string, Result> = {};
    for (const r of [...flat].reverse()) {
      latestByTest[r.test_name] = r;
    }
    const latest = Object.values(latestByTest).sort((a, b) => a.test_name.localeCompare(b.test_name));

    // Visit summary (no raw results — too large)
    const visitSummary = all.map((v) => ({
      visit_date: v.visit_date,
      lab_name: v.lab_name,
      result_count: (v.lab_results ?? []).length,
      abnormal_count: (v.lab_results ?? []).filter((r) => r.in_range === false).length,
    }));

    return NextResponse.json(
      { visits: visitSummary, latest_values: latest, results: flat },
      { headers: AI_CORS_HEADERS }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500, headers: AI_CORS_HEADERS });
  }
}
