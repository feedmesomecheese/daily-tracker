-- User AI API keys
-- Each user can have one active API key for authenticating their AI assistant.
-- Only the SHA-256 hash is stored — the plain key is shown once on generation.

CREATE TABLE IF NOT EXISTS user_ai_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash     TEXT        NOT NULL UNIQUE,   -- SHA-256 hex of the full key
  key_prefix   TEXT        NOT NULL,          -- first 8 chars for display ("dt_abc123...")
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE (owner_id)                           -- one active key per user
);

ALTER TABLE user_ai_keys ENABLE ROW LEVEL SECURITY;

-- Users can only see and manage their own key
CREATE POLICY "user_ai_keys_owner" ON user_ai_keys
  FOR ALL USING (auth.uid() = owner_id);

-- Service role bypasses RLS (used by AI routes to look up keys)
