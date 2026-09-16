import { AgentInputError, type AgentContext } from "../types";

export type MetricMeta = {
  metric_id: string;
  metric_name: string;
  type: string;
  group: string | null;
  is_calculated: boolean;
};

/**
 * Agents refer to metrics the way a person does — "Weight", "Resting HR" — not
 * by the slug stored in config.metric_id. This loads the user's metric
 * definitions once per call so names can be matched either way.
 */
export async function loadMetrics(ctx: AgentContext): Promise<MetricMeta[]> {
  const { data, error } = await ctx.supabase
    .from("config")
    .select("metric_id, metric_name, type, group, is_calculated")
    .eq("owner_id", ctx.ownerId)
    .eq("active", true);

  if (error) throw new Error(error.message);
  return (data ?? []) as MetricMeta[];
}

/**
 * Match a caller-supplied metric reference against metric_id (exact) or
 * metric_name (case-insensitive). Unknown names are an error rather than a
 * silent no-op: an agent that invents a metric should be told so, not led to
 * believe it logged something.
 */
export function resolveMetric(metrics: MetricMeta[], reference: string): MetricMeta {
  const ref = reference.trim();
  const lower = ref.toLowerCase();

  const match =
    metrics.find((m) => m.metric_id === ref) ??
    metrics.find((m) => m.metric_name.trim().toLowerCase() === lower) ??
    metrics.find((m) => m.metric_id.toLowerCase() === lower);

  if (!match) {
    const known = metrics.map((m) => m.metric_name).sort().join(", ");
    throw new AgentInputError(
      `Unknown metric "${reference}". Known metrics: ${known || "(none configured)"}`
    );
  }

  return match;
}

/**
 * Calculated metrics are derived from formulas over other metrics. Writing one
 * directly would be silently overwritten by the next recalculation, so refuse.
 */
export function assertWritable(metric: MetricMeta): void {
  if (metric.is_calculated) {
    throw new AgentInputError(
      `"${metric.metric_name}" is a calculated metric — it is derived from a formula and cannot be written directly. Log the metrics it depends on instead.`
    );
  }
}
