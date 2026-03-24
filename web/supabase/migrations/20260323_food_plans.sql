-- Meal planning mode: plans are food_logs with is_plan = true
-- date becomes nullable (plans don't have a calendar date)
-- The existing unique(owner_id, date) constraint is replaced with a partial index
-- that only applies to real logs (is_plan = false)

ALTER TABLE food_logs ALTER COLUMN date DROP NOT NULL;
ALTER TABLE food_logs DROP CONSTRAINT food_logs_owner_id_date_key;

ALTER TABLE food_logs ADD COLUMN is_plan BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE food_logs ADD COLUMN plan_name TEXT;

-- Partial unique index: only enforce one log per (owner, date) for real logs
CREATE UNIQUE INDEX food_logs_owner_date_unique
  ON food_logs(owner_id, date)
  WHERE is_plan = false AND date IS NOT NULL;
