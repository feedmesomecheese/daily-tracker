import { NextResponse } from "next/server";
import { resolveAgentAuth } from "./auth";
import { executeTool } from "./execute";
import { findToolByRoute } from "./registry";

export const AGENT_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};

export function handleAgentOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: AGENT_CORS_HEADERS });
}

function errorResponse(
  status: number,
  error: string,
  extra?: Record<string, string>
): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: { ...AGENT_CORS_HEADERS, ...(extra ?? {}) } }
  );
}

/**
 * Build a Next.js route handler for one tool, addressed by its REST path and
 * method. All the behaviour lives in executeTool — this only translates between
 * HTTP and the tool layer.
 */
export function agentRoute(path: string, method: "GET" | "POST") {
  return async function handler(req: Request): Promise<NextResponse> {
    const tool = findToolByRoute(path, method);
    if (!tool) {
      return errorResponse(404, `No agent tool registered for ${method} ${path}`);
    }

    const auth = await resolveAgentAuth(req);
    if (!auth.ok) {
      return errorResponse(
        auth.status,
        auth.error,
        auth.wwwAuthenticate ? { "WWW-Authenticate": auth.wwwAuthenticate } : undefined
      );
    }

    let rawInput: Record<string, unknown>;
    if (method === "GET") {
      rawInput = Object.fromEntries(new URL(req.url).searchParams.entries());
    } else {
      try {
        const body = await req.json();
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          return errorResponse(400, "Request body must be a JSON object");
        }
        rawInput = body as Record<string, unknown>;
      } catch {
        return errorResponse(400, "Invalid JSON in request body");
      }
    }

    const result = await executeTool(auth.ctx, tool, rawInput, "rest");

    if (!result.ok) {
      return errorResponse(
        result.status,
        result.error,
        result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : undefined
      );
    }

    return NextResponse.json(result.data, {
      status: method === "POST" ? 201 : 200,
      headers: AGENT_CORS_HEADERS,
    });
  };
}

export const agentGET = (path: string) => agentRoute(path, "GET");
export const agentPOST = (path: string) => agentRoute(path, "POST");
