-- Full agent access: read + write API keys with scopes, OAuth 2.1 for MCP
-- connectors, and an audit trail for everything an agent does.
--
-- Background: /api/ai/* was read-only and authenticated by a single per-user
-- key. Agents can now write, so a key needs a scope, every call needs a record,
-- and clients that can't hold a static token (claude.ai, Claude Desktop) need
-- an OAuth flow.

-- ---------------------------------------------------------------------------
-- 1. API keys: scopes + multiple named keys per user
-- ---------------------------------------------------------------------------

-- A single key per user made sense when everything was read-only. With writes
-- in play a user wants a read-only key for one assistant and a read-write key
-- for another, so the one-key-per-user constraint goes.
ALTER TABLE user_ai_keys DROP CONSTRAINT IF EXISTS user_ai_keys_owner_id_key;

ALTER TABLE user_ai_keys
  ADD COLUMN IF NOT EXISTS name   TEXT   NOT NULL DEFAULT 'Default',
  ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT ARRAY['read'],
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- Keys may only ever carry scopes we recognise.
ALTER TABLE user_ai_keys DROP CONSTRAINT IF EXISTS user_ai_keys_scopes_valid;
ALTER TABLE user_ai_keys
  ADD CONSTRAINT user_ai_keys_scopes_valid
  CHECK (scopes <@ ARRAY['read', 'write']::TEXT[] AND array_length(scopes, 1) >= 1);

CREATE INDEX IF NOT EXISTS user_ai_keys_owner_idx ON user_ai_keys (owner_id);

-- ---------------------------------------------------------------------------
-- 2. OAuth 2.1 authorization server
--    claude.ai and Claude Desktop always attempt OAuth with dynamic client
--    registration (RFC 7591) and have no static-token fallback, so we act as
--    the authorization server and Supabase Auth remains the identity provider.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id            TEXT        PRIMARY KEY,
  client_secret_hash   TEXT,                      -- NULL for public (PKCE-only) clients
  client_name          TEXT        NOT NULL,
  redirect_uris        TEXT[]      NOT NULL,
  grant_types          TEXT[]      NOT NULL DEFAULT ARRAY['authorization_code', 'refresh_token'],
  token_endpoint_auth_method TEXT  NOT NULL DEFAULT 'none',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_auth_codes (
  code_hash            TEXT        PRIMARY KEY,   -- SHA-256 of the authorization code
  client_id            TEXT        NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  owner_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri         TEXT        NOT NULL,
  code_challenge       TEXT        NOT NULL,      -- PKCE is mandatory in OAuth 2.1
  code_challenge_method TEXT       NOT NULL DEFAULT 'S256',
  scopes               TEXT[]      NOT NULL,
  resource             TEXT,                      -- RFC 8707 resource indicator
  expires_at           TIMESTAMPTZ NOT NULL,
  consumed_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS oauth_auth_codes_expiry_idx ON oauth_auth_codes (expires_at);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token_hash    TEXT        NOT NULL UNIQUE,
  refresh_token_hash   TEXT        UNIQUE,
  client_id            TEXT        NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  owner_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scopes               TEXT[]      NOT NULL,
  expires_at           TIMESTAMPTZ NOT NULL,
  revoked_at           TIMESTAMPTZ,
  last_used_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS oauth_tokens_owner_idx ON oauth_tokens (owner_id);
CREATE INDEX IF NOT EXISTS oauth_tokens_expiry_idx ON oauth_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- 3. Audit log
--    With write access a leaked or confused agent can damage data. This is the
--    record of who changed what, and the only way to reconstruct it after.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_audit_log (
  id           BIGSERIAL   PRIMARY KEY,
  owner_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool         TEXT        NOT NULL,           -- e.g. "logMetrics"
  transport    TEXT        NOT NULL,           -- "rest" | "mcp"
  auth_method  TEXT        NOT NULL,           -- "api_key" | "oauth"
  key_id       UUID,                           -- user_ai_keys.id or oauth_tokens.id
  read_only    BOOLEAN     NOT NULL DEFAULT TRUE,
  args         JSONB,                          -- tool input, truncated server-side
  status       TEXT        NOT NULL,           -- "ok" | "error"
  error        TEXT,
  duration_ms  INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_audit_log_owner_time_idx
  ON agent_audit_log (owner_id, created_at DESC);

-- Rate limiting reads this index: count of recent rows per owner.
CREATE INDEX IF NOT EXISTS agent_audit_log_recent_idx
  ON agent_audit_log (owner_id, created_at);

-- ---------------------------------------------------------------------------
-- 4. Row level security
--    All agent traffic goes through the service role, which bypasses RLS and
--    scopes every query by owner_id in application code. These policies exist
--    so a user's own session can read its keys and history and nothing else.
-- ---------------------------------------------------------------------------

ALTER TABLE oauth_clients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_auth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_audit_log  ENABLE ROW LEVEL SECURITY;

-- oauth_clients and oauth_auth_codes carry no user-facing reads: no policy at
-- all means no access except the service role.

DROP POLICY IF EXISTS "oauth_tokens_owner" ON oauth_tokens;
CREATE POLICY "oauth_tokens_owner" ON oauth_tokens
  FOR ALL USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "agent_audit_log_owner_read" ON agent_audit_log;
CREATE POLICY "agent_audit_log_owner_read" ON agent_audit_log
  FOR SELECT USING (auth.uid() = owner_id);
