import { NextResponse } from "next/server";
import { getAgentSupabase } from "@/lib/agent/auth";
import {
  OAUTH_CORS_HEADERS,
  isAcceptableRedirectUri,
  randomToken,
  sha256Hex,
} from "@/lib/agent/oauth";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

/**
 * Dynamic Client Registration (RFC 7591).
 *
 * Claude registers itself here on first connect. The endpoint is open by
 * design — that is what the spec requires — so registration grants nothing on
 * its own: a client still cannot read or write anything until a signed-in user
 * approves it on the consent screen.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Body must be JSON" },
      { status: 400, headers: OAUTH_CORS_HEADERS }
    );
  }

  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris is required" },
      { status: 400, headers: OAUTH_CORS_HEADERS }
    );
  }

  const uris = redirectUris.map(String);
  const bad = uris.find((u) => !isAcceptableRedirectUri(u));
  if (bad) {
    return NextResponse.json(
      {
        error: "invalid_redirect_uri",
        error_description: `Redirect URI not acceptable: ${bad}. Use https, a loopback address, or a private-use scheme.`,
      },
      { status: 400, headers: OAUTH_CORS_HEADERS }
    );
  }

  const clientName =
    typeof body.client_name === "string" && body.client_name.trim()
      ? body.client_name.trim().slice(0, 200)
      : "Unnamed MCP client";

  const authMethod =
    body.token_endpoint_auth_method === "client_secret_post" ? "client_secret_post" : "none";

  const clientId = `dtc_${randomToken(16)}`;

  // Public clients authenticate with PKCE alone and get no secret.
  let clientSecret: string | null = null;
  let clientSecretHash: string | null = null;
  if (authMethod === "client_secret_post") {
    clientSecret = randomToken(32);
    clientSecretHash = await sha256Hex(clientSecret);
  }

  const supabase = getAgentSupabase();
  const { error } = await supabase.from("oauth_clients").insert({
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    client_name: clientName,
    redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: authMethod,
  });

  if (error) {
    console.error("oauth client registration failed:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "Could not register client" },
      { status: 500, headers: OAUTH_CORS_HEADERS }
    );
  }

  return NextResponse.json(
    {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      client_name: clientName,
      redirect_uris: uris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: authMethod,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
    { status: 201, headers: OAUTH_CORS_HEADERS }
  );
}
