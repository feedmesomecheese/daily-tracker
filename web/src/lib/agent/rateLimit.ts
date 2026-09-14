import type { AgentContext } from "./types";

/**
 * Sliding-window rate limit over the audit log.
 *
 * Deliberately coarse: this exists to stop a looping agent from burning through
 * the database or rewriting a year of history in a minute, not to meter usage.
 * Writes get a tighter budget than reads because they are the destructive ones.
 */
const WINDOW_MS = 60_000;
const MAX_READS_PER_WINDOW = 120;
const MAX_WRITES_PER_WINDOW = 30;

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSec: number; message: string };

export async function checkRateLimit(
  ctx: AgentContext,
  readOnly: boolean
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const query = ctx.supabase
    .from("agent_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ctx.ownerId)
    .gte("created_at", since);

  // Writes are counted against the write budget only; reads against all calls.
  const { count, error } = readOnly
    ? await query
    : await query.eq("read_only", false);

  // If the check itself fails, let the call through — a broken limiter should
  // not take the whole agent surface down.
  if (error) {
    console.warn("agent rate limit check failed, allowing request:", error.message);
    return { allowed: true };
  }

  const limit = readOnly ? MAX_READS_PER_WINDOW : MAX_WRITES_PER_WINDOW;
  if ((count ?? 0) >= limit) {
    return {
      allowed: false,
      retryAfterSec: 60,
      message: readOnly
        ? `Rate limit reached (${limit} calls/minute). Wait a moment and retry.`
        : `Write rate limit reached (${limit} writes/minute). Wait a moment and retry.`,
    };
  }

  return { allowed: true };
}
