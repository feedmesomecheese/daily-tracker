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
  opt_low: number | null;
  opt_high: number | null;
};

type OptimalRow = {
  canonical_name: string;
  opt_low: number | null;
  opt_high: number | null;
  gender: string | null;
  age_min: number | null;
  age_max: number | null;
};

function mostCommon<T>(arr: T[]): T {
  const freq = new Map<T, number>();
  for (const v of arr) freq.set(v, (freq.get(v) ?? 0) + 1);
  let best = arr[0], bestCount = 0;
  for (const [v, count] of freq) {
    if (count > bestCount) { best = v; bestCount = count; }
  }
  return best;
}

function computeTrend(values: number[]): PanelTest["trend"] {
  if (values.length < 2) return "insufficient_data";
  const last = values[0], prev = values[1];
  if (prev === 0) return "stable";
  const pct = (last - prev) / Math.abs(prev);
  if (pct > 0.02) return "up";
  if (pct < -0.02) return "down";
  return "stable";
}

/** Higher = more specific match for the same canonical_name. */
function specificity(r: OptimalRow): number {
  return (r.gender != null ? 2 : 0) + (r.age_min != null || r.age_max != null ? 1 : 0);
}

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Visits + results (paginated) ──────────────────────────────────────────
  let allVisits: {
    id: string; visit_date: string;
    lab_results: { id: string; test_name: string; canonical_name: string | null; category: string | null; value: number | null; unit: string | null; ref_low: number | null; ref_high: number | null; ref_text: string | null; in_range: boolean | null }[]
  }[] = [];
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

  // ── Flatten ───────────────────────────────────────────────────────────────
  type FlatRow = { visit_id: string; visit_date: string; test_name: string; canonical_name: string | null; category: string | null; value: number | null; unit: string | null; ref_low: number | null; ref_high: number | null; ref_text: string | null; in_range: boolean | null };
  const flat: FlatRow[] = [];
  for (const visit of allVisits)
    for (const r of visit.lab_results)
      flat.push({ visit_id: visit.id, visit_date: visit.visit_date, ...r });

  // ── User profile ──────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("user_profile")
    .select("gender, birth_year")
    .eq("owner_id", user.id)
    .maybeSingle();

  const userGender: string | null = profile?.gender ?? null;
  const userAge: number | null = profile?.birth_year
    ? new Date().getFullYear() - (profile.birth_year as number)
    : null;

  // ── Optimal ranges ────────────────────────────────────────────────────────
  // Fetch system ranges where gender matches (or is universal)
  const genderFilter = userGender
    ? `gender.is.null,gender.eq.${userGender}`
    : `gender.is.null`;

  const { data: systemRanges } = await supabase
    .from("lab_optimal_ranges")
    .select("canonical_name, opt_low, opt_high, gender, age_min, age_max")
    .or(genderFilter);

  const { data: userOverrides } = await supabase
    .from("lab_optimal_overrides")
    .select("canonical_name, opt_low, opt_high")
    .eq("owner_id", user.id);

  // Build map: lowercase_canonical → best {opt_low, opt_high}
  // Track specificity scores alongside so we can compare
  const optimalMap = new Map<string, { opt_low: number | null; opt_high: number | null }>();
  const specMap = new Map<string, number>();

  if (systemRanges) {
    for (const r of systemRanges as OptimalRow[]) {
      // Skip if age bounds don't match user age
      if (r.age_min != null && (userAge == null || userAge < r.age_min)) continue;
      if (r.age_max != null && (userAge == null || userAge > r.age_max)) continue;

      const key = r.canonical_name.toLowerCase().trim();
      const spec = specificity(r);
      if (!optimalMap.has(key) || spec > (specMap.get(key) ?? -1)) {
        optimalMap.set(key, { opt_low: r.opt_low, opt_high: r.opt_high });
        specMap.set(key, spec);
      }
    }
  }

  // User overrides always win
  if (userOverrides) {
    for (const o of userOverrides as { canonical_name: string; opt_low: number | null; opt_high: number | null }[]) {
      optimalMap.set(o.canonical_name.toLowerCase().trim(), { opt_low: o.opt_low, opt_high: o.opt_high });
    }
  }

  // ── Group by canonical_name ───────────────────────────────────────────────
  const groups = new Map<string, FlatRow[]>();
  for (const row of flat) {
    const key = (row.canonical_name || row.test_name).toLowerCase().trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  // ── Build panel entries ───────────────────────────────────────────────────
  const panel: PanelTest[] = Array.from(groups.entries()).map(([key, rows]) => {
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
    const optimal = optimalMap.get(key) ?? { opt_low: null, opt_high: null };

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
      opt_low: optimal.opt_low,
      opt_high: optimal.opt_high,
    };
  });

  panel.sort((a, b) => a.display_name.localeCompare(b.display_name));
  return NextResponse.json(panel);
}
