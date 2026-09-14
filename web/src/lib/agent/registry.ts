import type { AgentTool } from "./types";
import { logTools } from "./tools/log";
import { workoutTools } from "./tools/workouts";
import { foodTools } from "./tools/food";
import { bodyTools } from "./tools/body";
import { bookTools } from "./tools/books";
import { labTools } from "./tools/labs";

/**
 * Every capability the agent surface exposes, in one place.
 *
 * Both transports read from this list: the OpenAPI document at /api/ai/openapi
 * (for ChatGPT Actions and anything speaking plain HTTP) and the MCP tool
 * listing at /api/mcp (for Claude and ChatGPT developer mode). Adding a tool
 * here is the only step needed to expose it to both.
 */
export const AGENT_TOOLS: AgentTool[] = [
  ...logTools,
  ...workoutTools,
  ...foodTools,
  ...bodyTools,
  ...bookTools,
  ...labTools,
];

export function findToolByName(name: string): AgentTool | undefined {
  return AGENT_TOOLS.find((t) => t.name === name);
}

export function findToolByRoute(path: string, method: "GET" | "POST"): AgentTool | undefined {
  return AGENT_TOOLS.find((t) => t.path === path && t.method === method);
}

export const READ_TOOLS = AGENT_TOOLS.filter((t) => t.readOnly);
export const WRITE_TOOLS = AGENT_TOOLS.filter((t) => !t.readOnly);
