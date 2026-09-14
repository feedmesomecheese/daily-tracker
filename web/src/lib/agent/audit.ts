import type { AgentContext } from "./types";

/** Args are truncated before storage — a bulk food import should not put a
 *  megabyte of JSON in the audit table. */
const MAX_ARGS_CHARS = 4000;

export type AuditEntry = {
  tool: string;
  transport: "rest" | "mcp";
  readOnly: boolean;
  args: Record<string, unknown>;
  status: "ok" | "error";
  error?: string;
  durationMs: number;
};

function truncateArgs(args: Record<string, unknown>): unknown {
  try {
    const json = JSON.stringify(args);
    if (json.length <= MAX_ARGS_CHARS) return args;
    return { _truncated: true, _size: json.length, _preview: json.slice(0, MAX_ARGS_CHARS) };
  } catch {
    return { _unserializable: true };
  }
}

/**
 * Record an agent call. Reads are logged too — they are what a rate limit is
 * computed from, and they matter when reconstructing what an agent saw before
 * it made a bad write.
 *
 * Never throws: a failure to audit must not fail the user's request.
 */
export async function recordAgentCall(
  ctx: AgentContext,
  entry: AuditEntry
): Promise<void> {
  try {
    await ctx.supabase.from("agent_audit_log").insert({
      owner_id: ctx.ownerId,
      tool: entry.tool,
      transport: entry.transport,
      auth_method: ctx.authMethod,
      key_id: ctx.keyId,
      read_only: entry.readOnly,
      args: truncateArgs(entry.args),
      status: entry.status,
      error: entry.error ?? null,
      duration_ms: Math.round(entry.durationMs),
    });
  } catch (e) {
    console.warn("agent audit log write failed (non-blocking):", e);
  }
}
