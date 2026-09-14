import { recordAgentCall } from "./audit";
import { checkRateLimit } from "./rateLimit";
import { coerceInput } from "./validate";
import { AgentInputError, type AgentContext, type AgentTool } from "./types";

export type ExecuteResult =
  | { ok: true; data: unknown }
  | { ok: false; status: number; error: string; retryAfterSec?: number };

/**
 * The one path every tool call takes, whichever transport delivered it.
 *
 * Scope check, then rate limit, then input validation, then the handler, then
 * the audit record. Keeping this in one function is what makes the REST and MCP
 * surfaces behave identically — including what they refuse.
 */
export async function executeTool(
  ctx: AgentContext,
  tool: AgentTool,
  rawInput: Record<string, unknown>,
  transport: "rest" | "mcp"
): Promise<ExecuteResult> {
  const startedAt = Date.now();

  const requiredScope = tool.readOnly ? "read" : "write";
  if (!ctx.scopes.includes(requiredScope)) {
    return {
      ok: false,
      status: 403,
      error: tool.readOnly
        ? "This key does not have read access."
        : `This key is read-only. Generate a key with write access to use ${tool.name}.`,
    };
  }

  const limit = await checkRateLimit(ctx, tool.readOnly);
  if (!limit.allowed) {
    return { ok: false, status: 429, error: limit.message, retryAfterSec: limit.retryAfterSec };
  }

  let input: Record<string, unknown>;
  try {
    input = coerceInput(tool.inputSchema, rawInput);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await recordAgentCall(ctx, {
      tool: tool.name,
      transport,
      readOnly: tool.readOnly,
      args: rawInput,
      status: "error",
      error: message,
      durationMs: Date.now() - startedAt,
    });
    return { ok: false, status: 400, error: message };
  }

  try {
    const data = await tool.handler(ctx, input);

    await recordAgentCall(ctx, {
      tool: tool.name,
      transport,
      readOnly: tool.readOnly,
      args: input,
      status: "ok",
      durationMs: Date.now() - startedAt,
    });

    return { ok: true, data };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = e instanceof AgentInputError ? 400 : 500;

    await recordAgentCall(ctx, {
      tool: tool.name,
      transport,
      readOnly: tool.readOnly,
      args: input,
      status: "error",
      error: message,
      durationMs: Date.now() - startedAt,
    });

    if (status === 500) {
      console.error(`agent tool ${tool.name} failed:`, e);
    }

    return { ok: false, status, error: message };
  }
}
