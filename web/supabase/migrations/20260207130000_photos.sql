-- Photo attachments for Daily Tracker
-- Run this migration to add photo attachment functionality

-- Photos table
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  metric_id TEXT, -- NULL for day gallery photos
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  thumbnail_path TEXT,
  caption TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_photos_owner ON photos(owner_id);
CREATE INDEX IF NOT EXISTS idx_photos_date ON photos(owner_id, date);
CREATE INDEX IF NOT EXISTS idx_photos_metric ON photos(owner_id, metric_id) WHERE metric_id IS NOT NULL;

-- RLS policies
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own photos" ON photos;
CREATE POLICY "Users can view own photos" ON photos
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert own photos" ON photos;
CREATE POLICY "Users can insert own photos" ON photos
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own photos" ON photos;
CREATE POLICY "Users can update own photos" ON photos
  FOR UPDATE USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can delete own photos" ON photos;
CREATE POLICY "Users can delete own photos" ON photos
  FOR DELETE USING (auth.uid() = owner_id);

-- Note: You need to create the storage bucket manually in Supabase Dashboard:
-- 1. Go to Storage in Supabase Dashboard
-- 2. Create a new bucket named 'daily-tracker-photos'
-- 3. Set it as private (not public)
-- 4. Add RLS policies for the bucket:
--    - SELECT: auth.uid() = owner_id
--    - INSERT: auth.uid() = owner_id
--    - UPDATE: auth.uid() = owner_id
--    - DELETE: auth.uid() = owner_id

COMMENT ON TABLE photos IS 'Photo attachments for daily entries or specific metrics';
COMMENT ON COLUMN photos.metric_id IS 'NULL means general day photo, non-null links to specific metric';
COMMENT ON COLUMN photos.storage_path IS 'Path in Supabase Storage bucket';
