import { agentGET, handleAgentOptions } from "@/lib/agent/rest";

// Thin transport shim. Behaviour lives in the shared tool registry
// (src/lib/agent/registry.ts) so REST and MCP cannot drift apart.

export async function OPTIONS() { return handleAgentOptions(); }

export const GET = agentGET("/api/ai/metrics");
