import { NextResponse } from "next/server";
import { validateAiRequest, getAiSupabase, AI_CORS_HEADERS, handleAiOptions } from "@/lib/aiAuth";

export async function OPTIONS() { return handleAiOptions(); }

type HistoryEntry = {
  date: string;
  value: number;
  ref_low: number | null;
  ref_high: number | null;
  in_range: boolean | null;
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

function computeTrend(values: number[]): string {
  if (values.length < 2) return "insufficient_data";
  const pct = (values[0] - values[1]) / Math.abs(values[1] || 1);
  if (pct > 0.02) return "up";
  if (pct < -0.02) return "down";
  return "stable";
}

function specificity(r: OptimalRow): number {
  return (r.gender != null ? 2 : 0) + (r.age_min != null || r.age_max != null ? 1 : 0);
}

function computeStatus(
  latest: HistoryEntry,
  optLow: number | null,
  optHigh: number | null,
): "optimal" | "good" | "suboptimal" | "out_of_range" | "no_range_data" {
  const { value, in_range, ref_low, ref_high } = latest;

  if (in_range === false) return "out_of_range";

  const effectiveInRange =
    in_range === true ||
    ((ref_low == null || value >= ref_low) && (ref_high == null || value <= ref_high));
  if (!effectiveInRange) return "out_of_range";

  if (in_range === null && ref_low == null && ref_high == null) return "no_range_data";

  if (optLow != null || optHigh != null) {
    const inOptimal = (optLow == null || value >= optLow) && (optHigh == null || value <= optHigh);
    return inOptimal ? "optimal" : "suboptimal";
  }

  return "good";
}

export async function GET(req: Request) {
  const auth = await validateAiRequest(req);
  if (auth instanceof NextResponse) return auth;
  const { ownerId } = auth;

  try {
    const supabase = getAiSupabase();
    const url = new URL(req.url);
    const testFilter = url.searchParams.get("test");
    const categoryFilter = url.searchParams.get("category");
    const since = url.searchParams.get("since");
    const abnormal = url.searchParams.get("abnormal") === "true";

    // ── Fetch all visits + results (paginated) ─────────────────────────────
    type RawVisit = {
      id: string; visit_date: string; lab_name: string | null; provider: string | null; notes: string | null;
      lab_results: {
        test_name: string; canonical_name: string | null; category: string | null;
        value: number | null; unit: string | null; ref_low: number | null;
        ref_high: number | null; ref_text: string | null; in_range: boolean | null;
      }[];
    };
    let allVisits: RawVisit[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("lab_visits")
        .select(`id, visit_date, lab_name, provider, notes,
          lab_results(test_name, canonical_name, category, value, unit, ref_low, ref_high, ref_text, in_range)`)
        .eq("owner_id", ownerId)
        .order("visit_date", { ascending: false })
        .range(from, from + 999);
      if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: AI_CORS_HEADERS });
      if (!data || data.length === 0) break;
      allVisits = allVisits.concat(data as RawVisit[]);
      if (data.length < 1000) break;
      from += 1000;
    }

    // ── User profile for optimal range matching ─────────────────────────────
    const { data: profile } = await supabase
      .from("user_profile")
      .select("gender, birth_year")
      .eq("owner_id", ownerId)
      .maybeSingle();

    const userGender: string | null = profile?.gender ?? null;
    const userAge: number | null = profile?.birth_year
      ? new Date().getFullYear() - (profile.birth_year as number)
      : null;

    // ── Optimal ranges ──────────────────────────────────────────────────────
    const genderFilter = userGender ? `gender.is.null,gender.eq.${userGender}` : `gender.is.null`;
    const { data: systemRanges } = await supabase
      .from("lab_optimal_ranges")
      .select("canonical_name, opt_low, opt_high, gender, age_min, age_max")
      .or(genderFilter);

    const { data: userOverrides } = await supabase
      .from("lab_optimal_overrides")
      .select("canonical_name, opt_low, opt_high")
      .eq("owner_id", ownerId);

    const optimalMap = new Map<string, { opt_low: number | null; opt_high: number | null }>();
    const specMap = new Map<string, number>();

    if (systemRanges) {
      for (const r of systemRanges as OptimalRow[]) {
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
    if (userOverrides) {
      for (const o of userOverrides as { canonical_name: string; opt_low: number | null; opt_high: number | null }[]) {
        optimalMap.set(o.canonical_name.toLowerCase().trim(), { opt_low: o.opt_low, opt_high: o.opt_high });
      }
    }

    // ── Flatten ─────────────────────────────────────────────────────────────
    type FlatRow = {
      visit_id: string; visit_date: string; test_name: string; canonical_name: string | null;
      category: string | null; value: number | null; unit: string | null;
      ref_low: number | null; ref_high: number | null; in_range: boolean | null;
    };
    const flat: FlatRow[] = [];
    for (const v of allVisits)
      for (const r of v.lab_results)
        flat.push({ visit_id: v.id, visit_date: v.visit_date, ...r });

    // ── Group by canonical_name ─────────────────────────────────────────────
    const groups = new Map<string, FlatRow[]>();
    for (const row of flat) {
      const key = (row.canonical_name || row.test_name).toLowerCase().trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    // ── Build panel ─────────────────────────────────────────────────────────
    let panel = Array.from(groups.entries()).map(([key, rows]) => {
      const names = rows.map((r) => r.test_name);
      const categories = rows.map((r) => r.category).filter((c): c is string => !!c);
      const units = rows.map((r) => r.unit).filter((u): u is string => !!u);

      const history: HistoryEntry[] = rows
        .filter((r) => r.value != null)
        .sort((a, b) => b.visit_date.localeCompare(a.visit_date))
        .map((r) => ({
          date: r.visit_date,
          value: r.value as number,
          ref_low: r.ref_low,
          ref_high: r.ref_high,
          in_range: r.in_range,
        }));

      const latest = history[0] ?? null;
      const optimal = optimalMap.get(key) ?? { opt_low: null, opt_high: null };
      const canonicalName = rows[0].canonical_name || rows[0].test_name;

      return {
        canonical_name: canonicalName,
        display_name: mostCommon(names),
        category: categories.length > 0 ? mostCommon(categories) : "Other",
        unit: units.length > 0 ? mostCommon(units) : null,
        latest_value: latest?.value ?? null,
        latest_date: latest?.date ?? null,
        ref_low: latest?.ref_low ?? null,
        ref_high: latest?.ref_high ?? null,
        opt_low: optimal.opt_low,
        opt_high: optimal.opt_high,
        status: latest ? computeStatus(latest, optimal.opt_low, optimal.opt_high) : "no_range_data" as const,
        trend: computeTrend(history.map((h) => h.value)),
        times_out_of_range: history.filter((h) => h.in_range === false).length,
        visit_count: history.length,
        history: history.slice(0, 10).map((h) => ({ date: h.date, value: h.value })),
      };
    });

    // ── Apply filters ────────────────────────────────────────────────────────
    if (testFilter) {
      const q = testFilter.toLowerCase();
      panel = panel.filter(
        (p) => p.canonical_name.toLowerCase().includes(q) || p.display_name.toLowerCase().includes(q)
      );
    }
    if (categoryFilter) {
      panel = panel.filter((p) => p.category.toLowerCase() === categoryFilter.toLowerCase());
    }
    if (since) {
      panel = panel.filter((p) => p.latest_date != null && p.latest_date >= since);
    }
    if (abnormal) {
      panel = panel.filter((p) => p.status === "out_of_range");
    }

    panel.sort((a, b) => a.display_name.localeCompare(b.display_name));

    // ── Visit summary ────────────────────────────────────────────────────────
    const visitSummary = allVisits.map((v) => ({
      visit_date: v.visit_date,
      lab_name: v.lab_name,
      result_count: v.lab_results.length,
      abnormal_count: v.lab_results.filter((r) => r.in_range === false).length,
    }));

    return NextResponse.json({ visits: visitSummary, panel }, { headers: AI_CORS_HEADERS });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500, headers: AI_CORS_HEADERS });
  }
}
