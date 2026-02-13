-- Achievement system for Daily Tracker
-- Run this migration to add achievements/badges functionality

-- Achievement definitions (predefined achievement types)
CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT, -- Emoji or icon name
  category TEXT NOT NULL CHECK (category IN ('streak', 'record', 'consistency', 'milestone')),
  tier INTEGER DEFAULT 1 CHECK (tier >= 1 AND tier <= 5),
  threshold INTEGER, -- e.g., 7 for 7-day streak
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Earned achievements per user
CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  metric_id TEXT, -- NULL for global achievements
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  value JSONB, -- Additional context (e.g., streak count, record value)
  notified BOOLEAN DEFAULT false,
  UNIQUE (owner_id, achievement_id, metric_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_achievements_owner ON user_achievements(owner_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_unnotified ON user_achievements(owner_id, notified) WHERE notified = false;

-- RLS policies for user_achievements
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own achievements" ON user_achievements;
CREATE POLICY "Users can view own achievements" ON user_achievements
  FOR SELECT USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can insert own achievements" ON user_achievements;
CREATE POLICY "Users can insert own achievements" ON user_achievements
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can update own achievements" ON user_achievements;
CREATE POLICY "Users can update own achievements" ON user_achievements
  FOR UPDATE USING (auth.uid() = owner_id);

-- Insert default achievement definitions
-- Only meaningful milestones: 7, 30, 100, 365 day streaks and global consistency
INSERT INTO achievements (id, name, description, icon, category, tier, threshold) VALUES
  -- Streak achievements (per-metric, only for non-neutral direction)
  ('streak_7', 'Week Warrior', 'Logged 7 days in a row', '🔥', 'streak', 1, 7),
  ('streak_30', 'Monthly Master', 'Logged 30 days in a row', '🔥', 'streak', 2, 30),
  ('streak_100', 'Century Champion', 'Logged 100 days in a row', '🔥', 'streak', 3, 100),
  ('streak_365', 'Year Legend', 'Logged 365 days in a row', '🔥', 'streak', 4, 365),

  -- Global consistency achievements (total days with any data logged)
  ('consistency_100_days', 'Hundred Days Club', 'Logged data for 100 total days', '💯', 'consistency', 3, 100),
  ('consistency_365_days', 'Year-Long Logger', 'Logged data for 365 total days', '📆', 'consistency', 4, 365),

  -- Milestone achievements (one-time)
  ('milestone_first_log', 'First Steps', 'Logged your first metric', '👶', 'milestone', 1, 1)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  tier = EXCLUDED.tier,
  threshold = EXCLUDED.threshold;

-- Add achievement_config column to config table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'config' AND column_name = 'achievement_config'
  ) THEN
    ALTER TABLE config ADD COLUMN achievement_config JSONB DEFAULT '{
      "enabled": true,
      "streak_milestones": {"enabled": true, "thresholds": [7, 30, 100, 365]},
      "personal_records": {"enabled": true, "types": ["high", "streak"]},
      "consistency": {"enabled": true, "perfect_week": true}
    }'::jsonb;
  END IF;
END $$;

-- Add achievements section to user_settings if using a settings table
-- This assumes settings are stored in a user_settings table or similar
-- If settings are stored differently, adjust accordingly

COMMENT ON TABLE achievements IS 'Predefined achievement definitions';
COMMENT ON TABLE user_achievements IS 'Achievements earned by users';
COMMENT ON COLUMN user_achievements.value IS 'JSON context like {streak: 100, metric_name: "Sleep"}';
