-- Enforce one active goal per nutrient per user.
-- 1. Keep only the most recently created goal per (owner_id, nutrient) pair.
-- 2. Add a partial unique index to prevent future duplicates.

-- Step 1: Deactivate older duplicate goals (keep the newest per owner+nutrient)
UPDATE food_goals
SET is_active = false
WHERE id NOT IN (
  SELECT DISTINCT ON (owner_id, nutrient) id
  FROM food_goals
  WHERE is_active = true
  ORDER BY owner_id, nutrient, created_at DESC
);

-- Step 2: Unique index — only one active goal per user per nutrient
CREATE UNIQUE INDEX food_goals_owner_nutrient_unique
  ON food_goals (owner_id, nutrient)
  WHERE is_active = true;
