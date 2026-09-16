import { sha256Hex } from "./auth";
import type { Scope } from "./types";

/**
 * OAuth 2.1 authorization server, implemented here because claude.ai and
 * Claude Desktop always attempt OAuth with dynamic client registration and have
 * no static-token fallback. Supabase Auth stays the identity provider — this
 * only issues tokens to clients on behalf of an already-signed-in user.
 */

export const AUTH_CODE_TTL_MS = 10 * 60 * 1000;          // 10 minutes
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;        // 1 hour
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const SUPPORTED_SCOPES: Scope[] = ["read", "write"];

export function randomToken(bytes = 32): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export { sha256Hex };

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * PKCE verification. OAuth 2.1 requires it, and only S256 is accepted —
 * "plain" offers no protection against a stolen authorization code.
 */
export async function verifyPkce(
  verifier: string,
  challenge: string,
  method: string
): Promise<boolean> {
  if (method !== "S256") return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest)) === challenge;
}

/** Parse a space-delimited scope string, keeping only scopes we implement. */
export function parseScopes(raw: string | null | undefined): Scope[] {
  if (!raw) return [];
  const requested = raw.split(/[\s+]+/).filter(Boolean);
  return SUPPORTED_SCOPES.filter((s) => requested.includes(s));
}

/**
 * Redirect URIs must match exactly what the client registered. Anything else
 * lets an attacker who knows a client_id redirect a code to themselves.
 */
export function isRegisteredRedirect(registered: string[], candidate: string): boolean {
  return registered.includes(candidate);
}

/**
 * A redirect target must be a URI we are willing to send a code to. Native and
 * desktop clients use custom schemes and loopback; web clients use https.
 */
export function isAcceptableRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }

  if (parsed.protocol === "https:") return true;

  // Loopback http is permitted for native apps (RFC 8252).
  if (
    parsed.protocol === "http:" &&
    (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "[::1]")
  ) {
    return true;
  }

  // Private-use URI schemes, e.g. "claude://oauth/callback".
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:" && parsed.protocol.includes(":")) {
    return true;
  }

  return false;
}

export function buildRedirect(
  redirectUri: string,
  params: Record<string, string>
): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export const OAUTH_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};
