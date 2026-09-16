import { saveLogEntries, type LogEntryInput } from "@/lib/domain/saveLog";
import { AgentInputError, type AgentContext, type AgentTool } from "../types";
import { loadMetrics, resolveMetric } from "./_metrics";

/**
 * Body measurements are stored as ordinary daily-log metrics, not a table of
 * their own. These are the slugs the app ships with.
 */
const WEIGHT_METRIC = "weight";
const BODYFAT_METRIC = "bodyfat";

const getBodyMeasurements: AgentTool = {
  name: "getBodyMeasurements",
  path: "/api/ai/body",
  method: "GET",
  readOnly: true,
  summary: "Get weight and body fat history",
  description:
    "Returns all historical weight and body fat percentage entries. Optionally filter by date range.",
  responseDescription: "Weight and body fat percentage history",
  inputSchema: {
    type: "object",
    properties: {
      start: {
        type: "string",
        format: "date",
        description: "Start date in YYYY-MM-DD format (default: all history)",
      },
      end: { type: "string", format: "date", description: "End date in YYYY-MM-DD format (default: today)" },
    },
  },
  handler: async (ctx, input) => {
    const start = (input.start as string) || "";
    const end = (input.end as string) || new Date().toISOString().slice(0, 10);

    async function fetchMetric(metricId: string): Promise<{ date: string; value: number }[]> {
      const PAGE_SIZE = 1000;
      const results: { date: string; value: number }[] = [];
      let offset = 0;

      for (;;) {
        let query = ctx.supabase
          .from("log")
          .select("date, value")
          .eq("owner_id", ctx.ownerId)
          .eq("metric_id", metricId)
          .not("value", "is", null)
          .order("date", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (start) query = query.gte("date", start);
        if (end) query = query.lte("date", end);

        const { data, error } = await query;
        if (error || !data) break;

        results.push(
          ...data
            .filter((r) => r.value !== null)
            .map((r) => ({ date: r.date, value: r.value as number }))
        );

        if (data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      return results;
    }

    const [weight, bodyfat] = await Promise.all([
      fetchMetric(WEIGHT_METRIC),
      fetchMetric(BODYFAT_METRIC),
    ]);

    return { period: { start: start || "all", end }, weight, bodyfat };
  },
};

/** Resolve the configured metric, falling back to the shipped slug. */
async function resolveBodyMetric(
  ctx: AgentContext,
  slug: string,
  label: string
): Promise<string> {
  const metrics = await loadMetrics(ctx);
  try {
    return resolveMetric(metrics, slug).metric_id;
  } catch {
    throw new AgentInputError(
      `No "${label}" metric is configured for this account, so it cannot be recorded.`
    );
  }
}

const logBodyMeasurement: AgentTool = {
  name: "logBodyMeasurement",
  path: "/api/ai/body",
  method: "POST",
  readOnly: false,
  summary: "Record weight and body fat",
  description:
    "Records weight and/or body fat percentage for a date. Overwrites any existing value for that date. At least one of weight or body_fat_pct must be given.",
  responseDescription: "What was recorded",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["date"],
    properties: {
      date: { type: "string", format: "date", description: "Measurement date in YYYY-MM-DD format." },
      weight: { type: "number", description: "Body weight in the user's usual unit (lbs).", minimum: 0 },
      body_fat_pct: { type: "number", description: "Body fat percentage.", minimum: 0, maximum: 100 },
    },
  },
  handler: async (ctx, input) => {
    const date = input.date as string;
    const hasWeight = input.weight !== undefined && input.weight !== null;
    const hasBodyFat = input.body_fat_pct !== undefined && input.body_fat_pct !== null;

    if (!hasWeight && !hasBodyFat) {
      throw new AgentInputError("Provide weight, body_fat_pct, or both.");
    }

    const entries: LogEntryInput[] = [];
    const recorded: Record<string, number> = {};

    if (hasWeight) {
      const metricId = await resolveBodyMetric(ctx, WEIGHT_METRIC, "weight");
      entries.push({ metric_id: metricId, value: Number(input.weight), value_text: null });
      recorded.weight = Number(input.weight);
    }

    if (hasBodyFat) {
      const metricId = await resolveBodyMetric(ctx, BODYFAT_METRIC, "body fat");
      entries.push({ metric_id: metricId, value: Number(input.body_fat_pct), value_text: null });
      recorded.body_fat_pct = Number(input.body_fat_pct);
    }

    const result = await saveLogEntries(ctx.supabase, ctx.ownerId, date, entries);

    return {
      date,
      recorded,
      saved: result.upserted,
      recalculated_days: result.recalculated,
    };
  },
};

export const bodyTools: AgentTool[] = [getBodyMeasurements, logBodyMeasurement];
