-- Add include_in_tonnage flag to exercises
-- When false, sets from this exercise are excluded from total workout tonnage
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS include_in_tonnage boolean NOT NULL DEFAULT true;
