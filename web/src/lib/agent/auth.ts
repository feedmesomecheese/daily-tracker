import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AgentContext, Scope } from "./types";

/**
 * Supabase client using the service role key. It bypasses RLS, so every query
 * made through it must filter on the resolved ownerId.
 */
export function getAgentSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function bearerFrom(req: Request): string {
  const header = req.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();
}

export type AuthFailure = {
  ok: false;
  status: 401 | 403 | 503;
  error: string;
  /** Populated on 401 so MCP clients can start the OAuth flow (RFC 9728). */
  wwwAuthenticate?: string;
};

export type AuthSuccess = { ok: true; ctx: AgentContext };

function challenge(req: Request): string {
  const origin = baseUrlFrom(req);
  return `Bearer realm="daily-tracker", resource_metadata="${origin}/.well-known/oauth-protected-resource"`;
}

export function baseUrlFrom(req: Request): string {
  const host = req.headers.get("host") || "localhost:3000";
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const protocol = forwardedProto || (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

/**
 * Resolves the caller from the Authorization header.
 *
 * Three credentials are accepted, in order:
 *   1. An OAuth access token issued by /api/oauth/token — used by claude.ai and
 *      Claude Desktop, which cannot hold a static token.
 *   2. A `dt_…` API key from user_ai_keys — used by ChatGPT Actions, Claude
 *      Code, and anything speaking plain HTTP.
 *   3. The legacy AI_API_KEY env var, which is read-only and kept so existing
 *      single-user setups do not break on deploy.
 */
export async function resolveAgentAuth(
  req: Request
): Promise<AuthSuccess | AuthFailure> {
  const token = bearerFrom(req);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Missing bearer token",
      wwwAuthenticate: challenge(req),
    };
  }

  const supabase = getAgentSupabase();
  const tokenHash = await sha256Hex(token);

  // 1. OAuth access token
  let oauthRow: {
    id: string;
    owner_id: string;
    scopes: string[];
    expires_at: string;
    revoked_at: string | null;
  } | null = null;
  let keyRow: {
    id: string;
    owner_id: string;
    scopes: string[];
    revoked_at: string | null;
  } | null = null;

  try {
    const oauthResult = await supabase
      .from("oauth_tokens")
      .select("id, owner_id, scopes, expires_at, revoked_at")
      .eq("access_token_hash", tokenHash)
      .maybeSingle();
    oauthRow = oauthResult.data;

    if (!oauthRow) {
      const keyResult = await supabase
        .from("user_ai_keys")
        .select("id, owner_id, scopes, revoked_at")
        .eq("key_hash", tokenHash)
        .maybeSingle();
      keyRow = keyResult.data;
    }
  } catch (e) {
    // A lookup that could not run is not the same as a rejected credential:
    // answering 401 here would make clients discard a perfectly good token.
    console.error("agent auth lookup failed:", e);
    return {
      ok: false,
      status: 503,
      error: "Could not verify credentials right now. Retry shortly.",
    };
  }

  if (oauthRow) {
    if (oauthRow.revoked_at) {
      return { ok: false, status: 401, error: "Token revoked", wwwAuthenticate: challenge(req) };
    }
    if (new Date(oauthRow.expires_at).getTime() <= Date.now()) {
      return { ok: false, status: 401, error: "Token expired", wwwAuthenticate: challenge(req) };
    }

    void supabase
      .from("oauth_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", oauthRow.id)
      .then(() => {});

    return {
      ok: true,
      ctx: {
        supabase,
        ownerId: oauthRow.owner_id,
        scopes: (oauthRow.scopes ?? ["read"]) as Scope[],
        authMethod: "oauth",
        keyId: oauthRow.id,
      },
    };
  }

  // 2. API key
  if (keyRow?.owner_id) {
    if (keyRow.revoked_at) {
      return { ok: false, status: 401, error: "Key revoked", wwwAuthenticate: challenge(req) };
    }

    void supabase
      .from("user_ai_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRow.id)
      .then(() => {});

    return {
      ok: true,
      ctx: {
        supabase,
        ownerId: keyRow.owner_id,
        scopes: (keyRow.scopes ?? ["read"]) as Scope[],
        authMethod: "api_key",
        keyId: keyRow.id,
      },
    };
  }

  // 3. Legacy env key — deliberately read-only.
  const envKey = process.env.AI_API_KEY;
  const envOwnerId = process.env.AI_OWNER_ID;
  if (envKey && envOwnerId && token === envKey) {
    return {
      ok: true,
      ctx: {
        supabase,
        ownerId: envOwnerId,
        scopes: ["read"],
        authMethod: "api_key",
        keyId: null,
      },
    };
  }

  return {
    ok: false,
    status: 401,
    error: "Unauthorized",
    wwwAuthenticate: challenge(req),
  };
}

export function hasScope(ctx: AgentContext, scope: Scope): boolean {
  return ctx.scopes.includes(scope);
}
