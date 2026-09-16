import { AgentInputError, type AgentTool } from "../types";

const MAX_RESULTS_PER_CALL = 120;

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
  let best = arr[0];
  let bestCount = 0;
  for (const [v, count] of freq) {
    if (count > bestCount) {
      best = v;
      bestCount = count;
    }
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
  optHigh: number | null
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

const getLabResults: AgentTool = {
  name: "getLabResults",
  path: "/api/ai/labs",
  method: "GET",
  readOnly: true,
  summary: "Get medical lab results panel",
  description:
    "Full lab panel, one entry per test. Includes latest value, reference/optimal ranges, trend, status, and last 10 readings. Filter with test, category, abnormal or since.",
  responseDescription: "Lab visit summaries and full panel with trends, optimal ranges, and status",
  inputSchema: {
    type: "object",
    properties: {
      test: {
        type: "string",
        description: "Filter by test name (partial match, e.g. 'cholesterol', 'TSH', 'HbA1c')",
      },
      category: {
        type: "string",
        description:
          "Filter by category: CBC, Metabolic, Lipid, Thyroid, Hormone, Vitamin, Urinalysis, Other",
      },
      since: {
        type: "string",
        format: "date",
        description: "Only include tests with a draw on or after this date (YYYY-MM-DD)",
      },
      abnormal: {
        type: "boolean",
        description: "Set to true to return only out-of-range tests",
      },
    },
  },
  handler: async (ctx, input) => {
    const testFilter = (input.test as string) || null;
    const categoryFilter = (input.category as string) || null;
    const since = (input.since as string) || null;
    const abnormal = input.abnormal === true;

    type RawVisit = {
      id: string;
      visit_date: string;
      lab_name: string | null;
      provider: string | null;
      notes: string | null;
      lab_results: {
        test_name: string;
        canonical_name: string | null;
        category: string | null;
        value: number | null;
        unit: string | null;
        ref_low: number | null;
        ref_high: number | null;
        ref_text: string | null;
        in_range: boolean | null;
      }[];
    };

    let allVisits: RawVisit[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await ctx.supabase
        .from("lab_visits")
        .select(
          `id, visit_date, lab_name, provider, notes,
          lab_results(test_name, canonical_name, category, value, unit, ref_low, ref_high, ref_text, in_range)`
        )
        .eq("owner_id", ctx.ownerId)
        .order("visit_date", { ascending: false })
        .range(from, from + 999);

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      allVisits = allVisits.concat(data as RawVisit[]);
      if (data.length < 1000) break;
      from += 1000;
    }

    const { data: profile } = await ctx.supabase
      .from("user_profile")
      .select("gender, birth_year")
      .eq("owner_id", ctx.ownerId)
      .maybeSingle();

    const userGender: string | null = profile?.gender ?? null;
    const userAge: number | null = profile?.birth_year
      ? new Date().getFullYear() - (profile.birth_year as number)
      : null;

    const genderFilter = userGender ? `gender.is.null,gender.eq.${userGender}` : `gender.is.null`;
    const { data: systemRanges } = await ctx.supabase
      .from("lab_optimal_ranges")
      .select("canonical_name, opt_low, opt_high, gender, age_min, age_max")
      .or(genderFilter);

    const { data: userOverrides } = await ctx.supabase
      .from("lab_optimal_overrides")
      .select("canonical_name, opt_low, opt_high")
      .eq("owner_id", ctx.ownerId);

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
      for (const o of userOverrides as {
        canonical_name: string;
        opt_low: number | null;
        opt_high: number | null;
      }[]) {
        optimalMap.set(o.canonical_name.toLowerCase().trim(), {
          opt_low: o.opt_low,
          opt_high: o.opt_high,
        });
      }
    }

    type FlatRow = {
      visit_id: string;
      visit_date: string;
      test_name: string;
      canonical_name: string | null;
      category: string | null;
      value: number | null;
      unit: string | null;
      ref_low: number | null;
      ref_high: number | null;
      in_range: boolean | null;
    };
    const flat: FlatRow[] = [];
    for (const v of allVisits) {
      for (const r of v.lab_results) {
        flat.push({ visit_id: v.id, visit_date: v.visit_date, ...r });
      }
    }

    const groups = new Map<string, FlatRow[]>();
    for (const row of flat) {
      const key = (row.canonical_name || row.test_name).toLowerCase().trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

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
        status: latest
          ? computeStatus(latest, optimal.opt_low, optimal.opt_high)
          : ("no_range_data" as const),
        trend: computeTrend(history.map((h) => h.value)),
        times_out_of_range: history.filter((h) => h.in_range === false).length,
        visit_count: history.length,
        history: history.slice(0, 10).map((h) => ({ date: h.date, value: h.value })),
      };
    });

    if (testFilter) {
      const q = testFilter.toLowerCase();
      panel = panel.filter(
        (p) =>
          p.canonical_name.toLowerCase().includes(q) || p.display_name.toLowerCase().includes(q)
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

    const visitSummary = allVisits.map((v) => ({
      visit_date: v.visit_date,
      lab_name: v.lab_name,
      result_count: v.lab_results.length,
      abnormal_count: v.lab_results.filter((r) => r.in_range === false).length,
    }));

    return { visits: visitSummary, panel };
  },
};

const logLabVisit: AgentTool = {
  name: "logLabVisit",
  path: "/api/ai/labs",
  method: "POST",
  readOnly: false,
  summary: "Record a lab visit and its results",
  description:
    "Creates a lab visit for a date and attaches its test results. Each result records the test name, value, unit, and reference range. Whether a value is in range is computed from the reference range when not stated.",
  responseDescription: "The created visit and the number of results recorded",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["visit_date", "results"],
    properties: {
      visit_date: { type: "string", format: "date", description: "Date of the blood draw, YYYY-MM-DD." },
      lab_name: { type: "string", description: "Lab that ran the panel, e.g. \"Quest\", \"LabCorp\"." },
      provider: { type: "string", description: "Ordering provider or clinic." },
      notes: { type: "string", description: "Notes about the visit." },
      results: {
        type: "array",
        description: `Test results from this visit. Maximum ${MAX_RESULTS_PER_CALL} per call.`,
        items: {
          type: "object",
          required: ["test_name"],
          properties: {
            test_name: { type: "string", description: "Test name as printed on the report, e.g. \"Vitamin D, 25-OH\"." },
            canonical_name: {
              type: "string",
              description:
                "Normalised test name used to group readings across labs. Defaults to test_name.",
            },
            category: {
              type: "string",
              description: "CBC, Metabolic, Lipid, Thyroid, Hormone, Vitamin, Urinalysis, or Other.",
            },
            value: { type: "number", description: "Numeric result." },
            unit: { type: "string", description: "Unit of measure, e.g. \"ng/mL\"." },
            ref_low: { type: "number", description: "Lower bound of the lab's reference range." },
            ref_high: { type: "number", description: "Upper bound of the lab's reference range." },
            ref_text: { type: "string", description: "Reference range as printed, when not numeric." },
            notes: { type: "string", description: "Notes about this result." },
          },
        },
      },
    },
  },
  handler: async (ctx, input) => {
    const results = (input.results ?? []) as Array<Record<string, unknown>>;

    if (results.length === 0) {
      throw new AgentInputError("results must contain at least one entry");
    }
    if (results.length > MAX_RESULTS_PER_CALL) {
      throw new AgentInputError(
        `Too many results in one call (${results.length}). Maximum is ${MAX_RESULTS_PER_CALL}.`
      );
    }

    const { data: visit, error: visitError } = await ctx.supabase
      .from("lab_visits")
      .insert({
        owner_id: ctx.ownerId,
        visit_date: input.visit_date as string,
        lab_name: (input.lab_name as string) || null,
        provider: (input.provider as string) || null,
        notes: (input.notes as string) || null,
      })
      .select()
      .single();

    if (visitError) throw new Error(visitError.message);

    const rows = results.map((r) => {
      const value = r.value === undefined ? null : Number(r.value);
      const refLow = r.ref_low === undefined ? null : Number(r.ref_low);
      const refHigh = r.ref_high === undefined ? null : Number(r.ref_high);

      // Derive in_range from the reference bounds when the caller didn't say.
      let inRange: boolean | null = null;
      if (value !== null && (refLow !== null || refHigh !== null)) {
        inRange = (refLow === null || value >= refLow) && (refHigh === null || value <= refHigh);
      }

      return {
        visit_id: visit.id,
        test_name: String(r.test_name),
        canonical_name: (r.canonical_name as string) || String(r.test_name),
        category: (r.category as string) || null,
        value,
        unit: (r.unit as string) || null,
        ref_low: refLow,
        ref_high: refHigh,
        ref_text: (r.ref_text as string) || null,
        in_range: inRange,
        notes: (r.notes as string) || null,
      };
    });

    const { error: resultsError } = await ctx.supabase.from("lab_results").insert(rows);
    if (resultsError) throw new Error(resultsError.message);

    return {
      visit,
      results_recorded: rows.length,
      out_of_range: rows.filter((r) => r.in_range === false).length,
    };
  },
};

export const labTools: AgentTool[] = [getLabResults, logLabVisit];
