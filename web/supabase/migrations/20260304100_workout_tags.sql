-- Workout Tags Migration
-- Adds workout-level tagging (e.g., "Raised Heel", "Peaking Cycle")
-- Tags are user-defined, can auto-apply per workout type, and filter in history

-- ============================================
-- 1. Add is_archived to exercises (if not exists)
-- ============================================
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- ============================================
-- 2. New table: workout_tags
-- ============================================
CREATE TABLE IF NOT EXISTS workout_tags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  default_type_ids UUID[] DEFAULT '{}',
  sort_order       INTEGER DEFAULT 0,
  is_archived      BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workout_tags_owner ON workout_tags(owner_id);

ALTER TABLE workout_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own workout_tags" ON workout_tags;
DROP POLICY IF EXISTS "Users can insert own workout_tags" ON workout_tags;
DROP POLICY IF EXISTS "Users can update own workout_tags" ON workout_tags;
DROP POLICY IF EXISTS "Users can delete own workout_tags" ON workout_tags;

CREATE POLICY "Users can view own workout_tags" ON workout_tags
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own workout_tags" ON workout_tags
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own workout_tags" ON workout_tags
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own workout_tags" ON workout_tags
  FOR DELETE USING (auth.uid() = owner_id);

-- ============================================
-- 3. New table: workout_applied_tags (junction)
-- ============================================
CREATE TABLE IF NOT EXISTS workout_applied_tags (
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  tag_id     UUID NOT NULL REFERENCES workout_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (workout_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_workout_applied_tags_workout ON workout_applied_tags(workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_applied_tags_tag     ON workout_applied_tags(tag_id);

ALTER TABLE workout_applied_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own workout_applied_tags" ON workout_applied_tags;
DROP POLICY IF EXISTS "Users can insert own workout_applied_tags" ON workout_applied_tags;
DROP POLICY IF EXISTS "Users can delete own workout_applied_tags" ON workout_applied_tags;

CREATE POLICY "Users can view own workout_applied_tags" ON workout_applied_tags
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = workout_applied_tags.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can insert own workout_applied_tags" ON workout_applied_tags
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = workout_applied_tags.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can delete own workout_applied_tags" ON workout_applied_tags
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = workout_applied_tags.workout_id AND workouts.owner_id = auth.uid())
  );
