import { NextResponse } from "next/server";
import { resolveAgentAuth, baseUrlFrom } from "@/lib/agent/auth";
import { executeTool } from "@/lib/agent/execute";
import { AGENT_TOOLS, findToolByName } from "@/lib/agent/registry";
import type { AgentContext } from "@/lib/agent/types";

/**
 * Model Context Protocol endpoint (Streamable HTTP transport).
 *
 * Serves the same tools as the REST surface, from the same registry, for
 * clients that speak MCP: Claude (connectors, Desktop, Claude Code) and ChatGPT
 * developer mode.
 *
 * The server is stateless — it never initiates messages, so it answers POSTs
 * with a plain JSON body and does not issue session ids or open an SSE stream.
 * That is a valid Streamable HTTP implementation and it is what lets this run
 * on serverless hosting.
 */

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
};

type JsonRpcId = string | number | null;

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

const JSON_RPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

function rpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function rpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * A GET here would open an SSE stream for server-initiated messages. This
 * server has none, so it declines rather than holding a connection open.
 */
export async function GET() {
  return NextResponse.json(
    { error: "This MCP server does not provide a server-initiated event stream. POST JSON-RPC requests instead." },
    { status: 405, headers: { ...CORS_HEADERS, Allow: "POST, DELETE, OPTIONS" } }
  );
}

/** Session termination. Stateless server, so there is nothing to tear down. */
export async function DELETE() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(rpcError(null, JSON_RPC_ERRORS.parseError, "Invalid JSON"), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  const messages = Array.isArray(payload) ? payload : [payload];
  if (messages.length === 0) {
    return NextResponse.json(rpcError(null, JSON_RPC_ERRORS.invalidRequest, "Empty batch"), {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  // `initialize` is answered before authenticating so an unauthenticated client
  // can discover the server and then be told, on its first real call, where to
  // get a token.
  const needsAuth = messages.some(
    (m) => isRequest(m) && m.method !== "initialize" && !m.method.startsWith("notifications/")
  );

  let ctx: AgentContext | null = null;
  if (needsAuth) {
    const auth = await resolveAgentAuth(req);
    if (!auth.ok) {
      return NextResponse.json(
        rpcError(firstId(messages), JSON_RPC_ERRORS.invalidRequest, auth.error),
        {
          status: auth.status,
          headers: {
            ...CORS_HEADERS,
            ...(auth.wwwAuthenticate ? { "WWW-Authenticate": auth.wwwAuthenticate } : {}),
          },
        }
      );
    }
    ctx = auth.ctx;
  }

  const responses = [];
  for (const message of messages) {
    if (!isRequest(message)) {
      responses.push(rpcError(null, JSON_RPC_ERRORS.invalidRequest, "Not a JSON-RPC 2.0 request"));
      continue;
    }

    // Notifications carry no id and get no response.
    if (message.id === undefined || message.id === null) {
      continue;
    }

    responses.push(await handleMessage(message, ctx, req));
  }

  // A body of only notifications gets an acknowledgement with no content.
  if (responses.length === 0) {
    return new NextResponse(null, { status: 202, headers: CORS_HEADERS });
  }

  const body = Array.isArray(payload) ? responses : responses[0];
  return NextResponse.json(body, { status: 200, headers: CORS_HEADERS });
}

function isRequest(m: unknown): m is JsonRpcRequest {
  return (
    typeof m === "object" &&
    m !== null &&
    (m as JsonRpcRequest).jsonrpc === "2.0" &&
    typeof (m as JsonRpcRequest).method === "string"
  );
}

function firstId(messages: unknown[]): JsonRpcId {
  for (const m of messages) {
    if (isRequest(m) && m.id !== undefined && m.id !== null) return m.id;
  }
  return null;
}

async function handleMessage(
  message: JsonRpcRequest,
  ctx: AgentContext | null,
  req: Request
) {
  const id = message.id ?? null;

  switch (message.method) {
    case "initialize": {
      // Echo the client's protocol version back when it states one: this server
      // only implements tools, which every revision of the protocol shares.
      const requested = (message.params?.protocolVersion as string) || DEFAULT_PROTOCOL_VERSION;
      return rpcResult(id, {
        protocolVersion: requested,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "daily-tracker",
          title: "Daily Tracker",
          version: "2.0.0",
        },
        instructions:
          "Personal health tracking data: daily metrics, workouts, food, body measurements, lab results and reading list. " +
          "Read tools return the user's real records — never answer from memory when a tool can tell you. " +
          "Before writing metrics, call listMetrics to get exact names and value formats. " +
          "Food gaps mean unlogged days, not days without eating.",
      });
    }

    case "ping":
      return rpcResult(id, {});

    case "tools/list": {
      return rpcResult(id, {
        tools: AGENT_TOOLS.map((tool) => ({
          name: tool.name,
          title: tool.summary,
          description: tool.description,
          inputSchema: {
            type: "object",
            properties: tool.inputSchema.properties,
            ...(tool.inputSchema.required ? { required: tool.inputSchema.required } : {}),
          },
          annotations: {
            title: tool.summary,
            // ChatGPT uses readOnlyHint to decide what counts as a write.
            readOnlyHint: tool.readOnly,
            destructiveHint: false,
            // Writes create new records rather than replacing prior ones,
            // except logMetrics and logBodyMeasurement which overwrite the
            // value for a given date.
            idempotentHint: tool.readOnly,
            openWorldHint: false,
          },
        })),
      });
    }

    case "tools/call": {
      if (!ctx) {
        return rpcError(id, JSON_RPC_ERRORS.invalidRequest, "Not authenticated");
      }

      const name = message.params?.name;
      if (typeof name !== "string") {
        return rpcError(id, JSON_RPC_ERRORS.invalidParams, "Missing tool name");
      }

      const tool = findToolByName(name);
      if (!tool) {
        return rpcError(id, JSON_RPC_ERRORS.methodNotFound, `Unknown tool: ${name}`);
      }

      const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
      const result = await executeTool(ctx, tool, args, "mcp");

      // Tool failures come back as a successful JSON-RPC result flagged
      // isError, so the model reads the message and can correct itself rather
      // than the client treating it as a transport fault.
      if (!result.ok) {
        return rpcResult(id, {
          content: [{ type: "text", text: result.error }],
          isError: true,
        });
      }

      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        structuredContent: result.data,
        isError: false,
      });
    }

    // Declared unsupported in capabilities, but answer politely if asked.
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });

    default:
      return rpcError(
        id,
        JSON_RPC_ERRORS.methodNotFound,
        `Method not supported: ${message.method}. This server implements tools only. (${baseUrlFrom(req)}/api/mcp)`
      );
  }
}
