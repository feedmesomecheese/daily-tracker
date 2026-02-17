-- Add parent_modifier_filter for selective exercise linking
-- When set, only include child exercise sessions that have these specific modifiers
-- When null, include all sessions of the child exercise
-- Example: X Squats linked to Squats with parent_modifier_filter = [Raised Heel modifier ID]
--   → only Raised Heel X Squats sessions are included in Squats stats

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS parent_modifier_filter UUID[] DEFAULT NULL;
