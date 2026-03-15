-- Add "ready to progress" flag to workout_sets
ALTER TABLE workout_sets
  ADD COLUMN IF NOT EXISTS is_move_up BOOLEAN NOT NULL DEFAULT false;
