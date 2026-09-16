import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { getAgentSupabase } from "@/lib/agent/auth";
import {
  AUTH_CODE_TTL_MS,
  buildRedirect,
  isRegisteredRedirect,
  parseScopes,
  randomToken,
  sha256Hex,
} from "@/lib/agent/oauth";

/**
 * POST /api/oauth/authorize/approve
 *
 * Called by the consent screen once a signed-in user approves a client. It
 * mints the authorization code and hands back the URL to redirect to.
 *
 * Authenticated with the user's own Supabase session, never with an agent
 * token: an agent must not be able to widen its own grant.
 */
export async function POST(req: Request) {
  const userClient = supabaseServerFromRequest(req);
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const clientId = String(body.client_id ?? "");
  const redirectUri = String(body.redirect_uri ?? "");
  const codeChallenge = String(body.code_challenge ?? "");
  const codeChallengeMethod = String(body.code_challenge_method ?? "S256");
  const state = typeof body.state === "string" ? body.state : null;
  const resource = typeof body.resource === "string" ? body.resource : null;
  const scopes = parseScopes(typeof body.scope === "string" ? body.scope : "read");

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "client_id and redirect_uri are required" }, { status: 400 });
  }
  if (scopes.length === 0) {
    return NextResponse.json({ error: "At least one scope must be granted" }, { status: 400 });
  }
  if (codeChallengeMethod !== "S256" || !codeChallenge) {
    return NextResponse.json(
      { error: "PKCE with code_challenge_method=S256 is required" },
      { status: 400 }
    );
  }

  const admin = getAgentSupabase();

  const { data: client, error: clientError } = await admin
    .from("oauth_clients")
    .select("client_id, redirect_uris")
    .eq("client_id", clientId)
    .maybeSingle();

  if (clientError) {
    return NextResponse.json({ error: clientError.message }, { status: 500 });
  }
  if (!client) {
    return NextResponse.json({ error: "Unknown client" }, { status: 400 });
  }
  if (!isRegisteredRedirect(client.redirect_uris ?? [], redirectUri)) {
    return NextResponse.json(
      { error: "redirect_uri does not match the client's registration" },
      { status: 400 }
    );
  }

  const code = randomToken(32);
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_MS).toISOString();

  const { error: insertError } = await admin.from("oauth_auth_codes").insert({
    code_hash: codeHash,
    client_id: clientId,
    owner_id: user.id,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    scopes,
    resource,
    expires_at: expiresAt,
  });

  if (insertError) {
    console.error("failed to store authorization code:", insertError);
    return NextResponse.json({ error: "Could not issue authorization code" }, { status: 500 });
  }

  const redirectTo = buildRedirect(redirectUri, {
    code,
    ...(state ? { state } : {}),
  });

  return NextResponse.json({ redirect_to: redirectTo });
}
