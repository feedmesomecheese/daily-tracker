-- Integrations for Daily Tracker (Oura, etc.)
-- Run this migration to add integration support

-- Integrations table (stores OAuth tokens)
CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('oura', 'apple_health', 'fitbit', 'garmin')),
  access_token TEXT NOT NULL, -- Encrypted
  refresh_token TEXT, -- Encrypted
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  last_sync_at TIMESTAMPTZ,
  sync_config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id, provider)
);

-- Sync log for tracking integration syncs
CREATE TABLE IF NOT EXISTS integration_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('running', 'success', 'error', 'partial')),
  records_synced INTEGER DEFAULT 0,
  date_range_start DATE,
  date_range_end DATE,
  error_message TEXT,
  details JSONB
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integrations_owner ON integrations(owner_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(owner_id, provider);
CREATE INDEX IF NOT EXISTS idx_sync_log_integration ON integration_sync_log(integration_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_recent ON integration_sync_log(integration_id, started_at DESC);

-- RLS policies
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own integrations" ON integrations;
CREATE POLICY "Users can view own integrations" ON integrations
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert own integrations" ON integrations;
CREATE POLICY "Users can insert own integrations" ON integrations
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own integrations" ON integrations;
CREATE POLICY "Users can update own integrations" ON integrations
  FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own integrations" ON integrations;
CREATE POLICY "Users can delete own integrations" ON integrations
  FOR DELETE USING (auth.uid() = owner_id);

-- Sync log policies (through integration ownership)
DROP POLICY IF EXISTS "Users can view own sync logs" ON integration_sync_log;
CREATE POLICY "Users can view own sync logs" ON integration_sync_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM integrations i
      WHERE i.id = integration_sync_log.integration_id
      AND i.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own sync logs" ON integration_sync_log;
CREATE POLICY "Users can insert own sync logs" ON integration_sync_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM integrations i
      WHERE i.id = integration_sync_log.integration_id
      AND i.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own sync logs" ON integration_sync_log;
CREATE POLICY "Users can update own sync logs" ON integration_sync_log
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM integrations i
      WHERE i.id = integration_sync_log.integration_id
      AND i.owner_id = auth.uid()
    )
  );

COMMENT ON TABLE integrations IS 'OAuth integrations with external services';
COMMENT ON COLUMN integrations.access_token IS 'Encrypted OAuth access token';
COMMENT ON COLUMN integrations.sync_config IS 'JSON config for metric mapping and sync preferences';
COMMENT ON TABLE integration_sync_log IS 'History of integration sync operations';
