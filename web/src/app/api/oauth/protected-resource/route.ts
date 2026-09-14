import { NextResponse } from "next/server";
import { baseUrlFrom } from "@/lib/agent/auth";
import { OAUTH_CORS_HEADERS, SUPPORTED_SCOPES } from "@/lib/agent/oauth";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

/**
 * OAuth Protected Resource Metadata (RFC 9728).
 *
 * Served at /.well-known/oauth-protected-resource via a rewrite in
 * next.config.ts. An MCP client that gets a 401 from /api/mcp reads the
 * resource_metadata URL out of the WWW-Authenticate header, fetches this, and
 * learns which authorization server to talk to.
 */
export async function GET(req: Request) {
  const baseUrl = baseUrlFrom(req);

  return NextResponse.json(
    {
      resource: `${baseUrl}/api/mcp`,
      authorization_servers: [baseUrl],
      scopes_supported: SUPPORTED_SCOPES,
      bearer_methods_supported: ["header"],
      resource_name: "Daily Tracker",
      resource_documentation: `${baseUrl}/settings/ai-assistant`,
    },
    { headers: OAUTH_CORS_HEADERS }
  );
}
