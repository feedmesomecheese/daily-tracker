import { saveLogEntries, type LogEntryInput } from "@/lib/domain/saveLog";
import { AgentInputError, type AgentTool } from "../types";
import { loadMetrics, resolveMetric, assertWritable } from "./_metrics";

/** A single call should not be able to rewrite an unbounded slice of history. */
const MAX_ENTRIES_PER_CALL = 100;

const getDailyLog: AgentTool = {
  name: "getDailyLog",
  path: "/api/ai/log",
  method: "GET",
  readOnly: true,
  summary: "Get daily log entries",
  description:
    "Returns daily tracked metrics (health, habits, mood, etc.) for a given period. Each entry is a date with a map of metric names to values.",
  responseDescription: "Daily log entries with metric values per date",
  inputSchema: {
    type: "object",
    properties: {
      start: {
        type: "string",
        format: "date",
        description: "Start date in YYYY-MM-DD format. Use with end to query a specific range.",
      },
      end: {
        type: "string",
        format: "date",
        description: "End date in YYYY-MM-DD format (default: today)",
      },
      days: {
        type: "integer",
        description:
          "Number of days to return counting back from end (default 30, max 3650). Ignored if start is provided.",
        default: 30,
        minimum: 1,
        maximum: 3650,
      },
    },
  },
  handler: async (ctx, input) => {
    const today = new Date().toISOString().slice(0, 10);
    const end = (input.end as string) || today;

    let start = (input.start as string) || "";
    if (!start) {
      const days = Math.min((input.days as number) ?? 30, 3650);
      const startDate = new Date(end);
      startDate.setDate(startDate.getDate() - days + 1);
      start = startDate.toISOString().slice(0, 10);
    }

    const [configResult, logResult] = await Promise.all([
      ctx.supabase
        .from("config")
        .select("metric_id, metric_name, type, group")
        .eq("owner_id", ctx.ownerId)
        .eq("active", true),
      ctx.supabase
        .from("log")
        .select("date, metric_id, value, value_text")
        .eq("owner_id", ctx.ownerId)
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: false }),
    ]);

    if (configResult.error) throw new Error(configResult.error.message);
    if (logResult.error) throw new Error(logResult.error.message);

    const metricMap = new Map(
      (configResult.data || []).map((m) => [
        m.metric_id,
        { name: m.metric_name, type: m.type, group: m.group },
      ])
    );

    const byDate = new Map<string, Record<string, number | string | null>>();
    for (const row of logResult.data || []) {
      const meta = metricMap.get(row.metric_id);
      if (!meta) continue;
      if (!byDate.has(row.date)) byDate.set(row.date, {});
      const entry = byDate.get(row.date)!;
      entry[meta.name] = row.value ?? row.value_text ?? null;
    }

    const entries = Array.from(byDate.entries())
      .map(([date, metrics]) => ({ date, metrics }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return {
      period: { start, end },
      entries,
      metrics: (configResult.data || []).map((m) => ({
        id: m.metric_id,
        name: m.metric_name,
        type: m.type,
        group: m.group,
      })),
    };
  },
};

const listMetrics: AgentTool = {
  name: "listMetrics",
  path: "/api/ai/metrics",
  method: "GET",
  readOnly: true,
  summary: "List trackable metrics",
  description:
    "Returns every metric the user tracks, with its id, display name, type and whether it is calculated. Call this before logMetrics to use exact metric names and the right value format.",
  responseDescription: "Metric definitions available for reading and writing",
  inputSchema: { type: "object", properties: {} },
  handler: async (ctx) => {
    const metrics = await loadMetrics(ctx);
    return {
      metrics: metrics.map((m) => ({
        id: m.metric_id,
        name: m.metric_name,
        type: m.type,
        group: m.group,
        writable: !m.is_calculated,
      })),
    };
  },
};

const logMetrics: AgentTool = {
  name: "logMetrics",
  path: "/api/ai/log",
  method: "POST",
  readOnly: false,
  summary: "Record daily metric values",
  description:
    "Writes metric values for one date. Existing values for the same date and metric are overwritten. Metrics can be referenced by display name or id. Calculated metrics update automatically and cannot be written directly.",
  responseDescription: "Counts of written and cleared entries",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["date", "metrics"],
    properties: {
      date: {
        type: "string",
        format: "date",
        description: "The date these values belong to, in YYYY-MM-DD format.",
      },
      metrics: {
        type: "array",
        description: `The values to record. Maximum ${MAX_ENTRIES_PER_CALL} per call.`,
        items: {
          type: "object",
          required: ["metric"],
          properties: {
            metric: {
              type: "string",
              description: "Metric display name (e.g. \"Weight\") or id (e.g. \"weight\").",
            },
            value: {
              type: "number",
              description:
                "Numeric value. For checkbox metrics use 1 for done and 0 for not done. For time metrics use minutes.",
            },
            text: {
              type: "string",
              description: "Text value, for metrics of type text. Use instead of value, not alongside it.",
            },
            clear: {
              type: "boolean",
              description: "Set true to delete any existing value for this metric on this date.",
            },
          },
        },
      },
    },
  },
  handler: async (ctx, input) => {
    const date = input.date as string;
    const rows = (input.metrics ?? []) as Array<Record<string, unknown>>;

    if (rows.length === 0) {
      throw new AgentInputError("metrics must contain at least one entry");
    }
    if (rows.length > MAX_ENTRIES_PER_CALL) {
      throw new AgentInputError(
        `Too many entries in one call (${rows.length}). Maximum is ${MAX_ENTRIES_PER_CALL}; split the write across several calls.`
      );
    }

    const metrics = await loadMetrics(ctx);
    const entries: LogEntryInput[] = [];
    const applied: Array<{ metric: string; metric_id: string; action: string }> = [];

    for (const row of rows) {
      const meta = resolveMetric(metrics, String(row.metric));
      assertWritable(meta);

      if (row.clear === true) {
        entries.push({ metric_id: meta.metric_id, value: null, value_text: null });
        applied.push({ metric: meta.metric_name, metric_id: meta.metric_id, action: "cleared" });
        continue;
      }

      const hasValue = row.value !== undefined && row.value !== null;
      const hasText = typeof row.text === "string" && row.text.trim() !== "";

      if (!hasValue && !hasText) {
        throw new AgentInputError(
          `"${meta.metric_name}" needs a value, a text, or clear: true.`
        );
      }

      if (meta.type === "text") {
        if (!hasText) {
          throw new AgentInputError(
            `"${meta.metric_name}" is a text metric — send its content in "text", not "value".`
          );
        }
        entries.push({ metric_id: meta.metric_id, value: null, value_text: String(row.text) });
      } else {
        if (!hasValue) {
          throw new AgentInputError(
            `"${meta.metric_name}" is a ${meta.type} metric — send a number in "value".`
          );
        }
        entries.push({
          metric_id: meta.metric_id,
          value: Number(row.value),
          value_text: hasText ? String(row.text) : null,
        });
      }

      applied.push({ metric: meta.metric_name, metric_id: meta.metric_id, action: "saved" });
    }

    const result = await saveLogEntries(ctx.supabase, ctx.ownerId, date, entries);

    return {
      date,
      saved: result.upserted,
      cleared: result.deleted,
      recalculated_days: result.recalculated,
      new_achievements: result.new_achievements,
      applied,
    };
  },
};

export const logTools: AgentTool[] = [getDailyLog, listMetrics, logMetrics];
