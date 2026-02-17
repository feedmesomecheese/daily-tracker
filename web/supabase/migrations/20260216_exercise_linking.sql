-- Add parent_exercise_id for exercise linking
-- Allows grouping variants (e.g., Squats, Squats 80%, Raised Heel Squats)
-- under a parent exercise for combined stats

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS parent_exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL;

CREATE INDEX idx_exercises_parent ON exercises(parent_exercise_id);
