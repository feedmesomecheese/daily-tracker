import { NextResponse } from "next/server";
import { baseUrlFrom } from "@/lib/agent/auth";
import { OAUTH_CORS_HEADERS, SUPPORTED_SCOPES } from "@/lib/agent/oauth";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

/**
 * OAuth Authorization Server Metadata (RFC 8414).
 *
 * Served at /.well-known/oauth-authorization-server via a rewrite in
 * next.config.ts. Advertising registration_endpoint is what lets Claude
 * register itself without the user copying a client id anywhere.
 */
export async function GET(req: Request) {
  const baseUrl = baseUrlFrom(req);

  return NextResponse.json(
    {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/api/oauth/token`,
      registration_endpoint: `${baseUrl}/api/oauth/register`,
      scopes_supported: SUPPORTED_SCOPES,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      // OAuth 2.1: PKCE is mandatory and only S256 is accepted.
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      service_documentation: `${baseUrl}/settings/ai-assistant`,
    },
    { headers: OAUTH_CORS_HEADERS }
  );
}
