import { NextResponse } from "next/server";
import { getAgentSupabase } from "@/lib/agent/auth";
import {
  ACCESS_TOKEN_TTL_MS,
  OAUTH_CORS_HEADERS,
  REFRESH_TOKEN_TTL_MS,
  randomToken,
  sha256Hex,
  verifyPkce,
} from "@/lib/agent/oauth";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: { ...OAUTH_CORS_HEADERS, "Cache-Control": "no-store" } }
  );
}

/**
 * Token endpoint. Handles the authorization_code and refresh_token grants.
 *
 * Accepts form-encoded bodies (what the spec mandates) and JSON, because some
 * MCP clients send JSON.
 */
export async function POST(req: Request) {
  const params = await readParams(req);
  if (!params) return oauthError("invalid_request", "Could not parse request body");

  const grantType = params.get("grant_type");

  if (grantType === "authorization_code") return handleAuthorizationCode(params);
  if (grantType === "refresh_token") return handleRefreshToken(params);

  return oauthError(
    "unsupported_grant_type",
    `Unsupported grant_type: ${grantType ?? "(none)"}. Supported: authorization_code, refresh_token.`
  );
}

async function readParams(req: Request): Promise<URLSearchParams | null> {
  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const json = await req.json();
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
        if (v !== undefined && v !== null) params.set(k, String(v));
      }
      return params;
    }
    return new URLSearchParams(await req.text());
  } catch {
    return null;
  }
}

/** Confirms the client is who it says it is, for clients that hold a secret. */
async function authenticateClient(
  params: URLSearchParams,
  clientId: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const admin = getAgentSupabase();

  const { data: client } = await admin
    .from("oauth_clients")
    .select("client_id, client_secret_hash, token_endpoint_auth_method")
    .eq("client_id", clientId)
    .maybeSingle();

  if (!client) {
    return { ok: false, response: oauthError("invalid_client", "Unknown client", 401) };
  }

  if (client.token_endpoint_auth_method === "client_secret_post") {
    const secret = params.get("client_secret");
    if (!secret) {
      return { ok: false, response: oauthError("invalid_client", "client_secret is required", 401) };
    }
    const hash = await sha256Hex(secret);
    if (hash !== client.client_secret_hash) {
      return { ok: false, response: oauthError("invalid_client", "Invalid client_secret", 401) };
    }
  }

  return { ok: true };
}

async function issueTokens(
  clientId: string,
  ownerId: string,
  scopes: string[]
): Promise<NextResponse> {
  const admin = getAgentSupabase();

  const accessToken = `dta_${randomToken(32)}`;
  const refreshToken = `dtr_${randomToken(32)}`;
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);

  const { error } = await admin.from("oauth_tokens").insert({
    access_token_hash: await sha256Hex(accessToken),
    refresh_token_hash: await sha256Hex(refreshToken),
    client_id: clientId,
    owner_id: ownerId,
    scopes,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error("failed to issue tokens:", error);
    return oauthError("server_error", "Could not issue token", 500);
  }

  return NextResponse.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: refreshToken,
      scope: scopes.join(" "),
    },
    { headers: { ...OAUTH_CORS_HEADERS, "Cache-Control": "no-store" } }
  );
}

async function handleAuthorizationCode(params: URLSearchParams): Promise<NextResponse> {
  const code = params.get("code");
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const codeVerifier = params.get("code_verifier");

  if (!code || !clientId || !redirectUri || !codeVerifier) {
    return oauthError(
      "invalid_request",
      "code, client_id, redirect_uri and code_verifier are all required"
    );
  }

  const clientAuth = await authenticateClient(params, clientId);
  if (!clientAuth.ok) return clientAuth.response;

  const admin = getAgentSupabase();
  const codeHash = await sha256Hex(code);

  const { data: authCode } = await admin
    .from("oauth_auth_codes")
    .select("code_hash, client_id, owner_id, redirect_uri, code_challenge, code_challenge_method, scopes, consumed_at, expires_at")
    .eq("code_hash", codeHash)
    .maybeSingle();

  if (!authCode) return oauthError("invalid_grant", "Authorization code not found");

  // A code presented twice means it may have been intercepted. Revoke anything
  // already issued from it rather than quietly refusing the replay.
  if (authCode.consumed_at) {
    await admin
      .from("oauth_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("client_id", authCode.client_id)
      .eq("owner_id", authCode.owner_id)
      .is("revoked_at", null);

    return oauthError("invalid_grant", "Authorization code has already been used");
  }

  if (new Date(authCode.expires_at).getTime() <= Date.now()) {
    return oauthError("invalid_grant", "Authorization code has expired");
  }
  if (authCode.client_id !== clientId) {
    return oauthError("invalid_grant", "Authorization code was issued to a different client");
  }
  if (authCode.redirect_uri !== redirectUri) {
    return oauthError("invalid_grant", "redirect_uri does not match the authorization request");
  }

  const pkceOk = await verifyPkce(
    codeVerifier,
    authCode.code_challenge,
    authCode.code_challenge_method
  );
  if (!pkceOk) return oauthError("invalid_grant", "PKCE verification failed");

  // Consume the code before issuing, so a race cannot redeem it twice.
  const { data: consumed } = await admin
    .from("oauth_auth_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("code_hash", codeHash)
    .is("consumed_at", null)
    .select("code_hash");

  if (!consumed || consumed.length === 0) {
    return oauthError("invalid_grant", "Authorization code has already been used");
  }

  return issueTokens(clientId, authCode.owner_id, authCode.scopes);
}

async function handleRefreshToken(params: URLSearchParams): Promise<NextResponse> {
  const refreshToken = params.get("refresh_token");
  const clientId = params.get("client_id");

  if (!refreshToken || !clientId) {
    return oauthError("invalid_request", "refresh_token and client_id are required");
  }

  const clientAuth = await authenticateClient(params, clientId);
  if (!clientAuth.ok) return clientAuth.response;

  const admin = getAgentSupabase();
  const refreshHash = await sha256Hex(refreshToken);

  const { data: existing } = await admin
    .from("oauth_tokens")
    .select("id, client_id, owner_id, scopes, revoked_at, created_at")
    .eq("refresh_token_hash", refreshHash)
    .maybeSingle();

  if (!existing) return oauthError("invalid_grant", "Refresh token not found");
  if (existing.revoked_at) return oauthError("invalid_grant", "Refresh token has been revoked");
  if (existing.client_id !== clientId) {
    return oauthError("invalid_grant", "Refresh token was issued to a different client");
  }

  const refreshAge = Date.now() - new Date(existing.created_at).getTime();
  if (refreshAge > REFRESH_TOKEN_TTL_MS) {
    return oauthError("invalid_grant", "Refresh token has expired — reconnect the integration");
  }

  // Rotate: the old pair is revoked as the new one is issued.
  await admin
    .from("oauth_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", existing.id);

  return issueTokens(clientId, existing.owner_id, existing.scopes);
}
