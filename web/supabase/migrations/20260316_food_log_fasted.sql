-- Add fasted day flag to food_logs
ALTER TABLE food_logs
  ADD COLUMN IF NOT EXISTS is_fasted BOOLEAN NOT NULL DEFAULT false;
