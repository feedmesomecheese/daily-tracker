import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

type HistoryEntry = {
  visit_id: string;
  visit_date: string;
  value: number;
  ref_low: number | null;
  ref_high: number | null;
  ref_text: string | null;
  in_range: boolean | null;
};

type PanelTest = {
  canonical_name: string;
  display_name: string;
  category: string;
  unit: string | null;
  history: HistoryEntry[];
  latest: HistoryEntry | null;
  trend: "up" | "down" | "stable" | "insufficient_data";
  times_out_of_range: number;
  last_tested: string | null;
  visit_count: number;
};

function mostCommon<T>(arr: T[]): T {
  const freq = new Map<T, number>();
  for (const v of arr) freq.set(v, (freq.get(v) ?? 0) + 1);
  let best = arr[0];
  let bestCount = 0;
  for (const [v, count] of freq) {
    if (count > bestCount) { best = v; bestCount = count; }
  }
  return best;
}

function computeTrend(values: number[]): PanelTest["trend"] {
  if (values.length < 2) return "insufficient_data";
  const last = values[0];
  const prev = values[1];
  if (prev === 0) return "stable";
  const pct = (last - prev) / Math.abs(prev);
  if (pct > 0.02) return "up";
  if (pct < -0.02) return "down";
  return "stable";
}

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch all visits with nested results (paginate if user has >1000 visits)
  let allVisits: { id: string; visit_date: string; lab_results: { id: string; test_name: string; canonical_name: string | null; category: string | null; value: number | null; unit: string | null; ref_low: number | null; ref_high: number | null; ref_text: string | null; in_range: boolean | null }[] }[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("lab_visits")
      .select(`id, visit_date, lab_results(id, test_name, canonical_name, category, value, unit, ref_low, ref_high, ref_text, in_range)`)
      .eq("owner_id", user.id)
      .order("visit_date", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    allVisits = allVisits.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // Flatten all results with visit_date
  type FlatRow = { visit_id: string; visit_date: string; test_name: string; canonical_name: string | null; category: string | null; value: number | null; unit: string | null; ref_low: number | null; ref_high: number | null; ref_text: string | null; in_range: boolean | null };
  const flat: FlatRow[] = [];
  for (const visit of allVisits) {
    for (const r of visit.lab_results) {
      flat.push({ visit_id: visit.id, visit_date: visit.visit_date, ...r });
    }
  }

  // Group by canonical_name (lowercased), falling back to test_name
  const groups = new Map<string, FlatRow[]>();
  for (const row of flat) {
    const key = (row.canonical_name || row.test_name).toLowerCase().trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  // Build panel entries
  const panel: PanelTest[] = Array.from(groups.values()).map((rows) => {
    const names = rows.map((r) => r.test_name);
    const categories = rows.map((r) => r.category).filter((c): c is string => !!c);
    const units = rows.map((r) => r.unit).filter((u): u is string => !!u);

    const history: HistoryEntry[] = rows
      .filter((r) => r.value != null)
      .sort((a, b) => b.visit_date.localeCompare(a.visit_date))
      .map((r) => ({
        visit_id: r.visit_id,
        visit_date: r.visit_date,
        value: r.value as number,
        ref_low: r.ref_low,
        ref_high: r.ref_high,
        ref_text: r.ref_text,
        in_range: r.in_range,
      }));

    const values = history.map((h) => h.value);
    const canonicalName = rows[0].canonical_name || rows[0].test_name;

    return {
      canonical_name: canonicalName,
      display_name: mostCommon(names),
      category: categories.length > 0 ? mostCommon(categories) : "Other",
      unit: units.length > 0 ? mostCommon(units) : null,
      history,
      latest: history[0] ?? null,
      trend: computeTrend(values),
      times_out_of_range: history.filter((h) => h.in_range === false).length,
      last_tested: history[0]?.visit_date ?? null,
      visit_count: history.length,
    };
  });

  panel.sort((a, b) => a.display_name.localeCompare(b.display_name));

  return NextResponse.json(panel);
}
