-- Migration: Convert "Exercise, XX%" entries to base exercise + workout tag
--
-- Uses exercise_name_display as source of truth (still contains "Squats, 75%" etc.)
-- For each unique (base_name, pct) found in workout_exercises:
--   1. Create a workout_tag for "75%" if it doesn't exist
--   2. Apply that tag to every workout containing that exercise_name_display
--   3. Remap workout_sets to the base exercise (via old exercise_id)
--   4. Remap workout_exercises to the base exercise + clean up display name
--   5. Remap personal_records to the base exercise

DO $$
DECLARE
  v_owner_id         UUID;
  v_base_exercise_id UUID;
  v_old_exercise_id  UUID;
  v_tag_id           UUID;
  r                  RECORD;
BEGIN
  -- Identify owner from workout_exercises that still have the ", XX%" display name
  SELECT DISTINCT w.owner_id INTO v_owner_id
  FROM workouts w
  JOIN workout_exercises we ON we.workout_id = w.id
  WHERE we.exercise_name_display ~ ', \d+%$'
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    RAISE NOTICE 'No workout_exercises with ", XX%%" pattern found. Nothing to do.';
    RETURN;
  END IF;

  -- Process each unique (base_name, pct) combination
  FOR r IN
    SELECT DISTINCT
      TRIM(REGEXP_REPLACE(we.exercise_name_display, ', \d+%$', '')) AS base_name,
      SUBSTRING(we.exercise_name_display FROM ', (\d+%)$')           AS pct
    FROM workout_exercises we
    JOIN workouts w ON w.id = we.workout_id
    WHERE w.owner_id = v_owner_id
      AND we.exercise_name_display ~ ', \d+%$'
    ORDER BY 1, 2
  LOOP
    RAISE NOTICE 'Processing: "%, %"', r.base_name, r.pct;

    -- Find the active base exercise (e.g. "Squats")
    SELECT id INTO v_base_exercise_id
    FROM exercises
    WHERE owner_id = v_owner_id
      AND name = r.base_name
      AND NOT is_archived
    LIMIT 1;

    IF v_base_exercise_id IS NULL THEN
      RAISE NOTICE '  !! No active base exercise found for "%" — skipping', r.base_name;
      CONTINUE;
    END IF;

    -- Find the archived old exercise (e.g. "Squats, 75%") for remapping sets/PRs
    SELECT id INTO v_old_exercise_id
    FROM exercises
    WHERE owner_id = v_owner_id
      AND name = r.base_name || ', ' || r.pct
    LIMIT 1;

    -- Create tag if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM workout_tags WHERE owner_id = v_owner_id AND name = r.pct
    ) THEN
      INSERT INTO workout_tags (owner_id, name, sort_order)
      VALUES (v_owner_id, r.pct, 0);
      RAISE NOTICE '  Created tag "%"', r.pct;
    END IF;

    SELECT id INTO v_tag_id
    FROM workout_tags
    WHERE owner_id = v_owner_id AND name = r.pct
    LIMIT 1;

    -- Apply tag to every workout that has this exercise_name_display
    INSERT INTO workout_applied_tags (workout_id, tag_id)
    SELECT DISTINCT we.workout_id, v_tag_id
    FROM workout_exercises we
    JOIN workouts w ON w.id = we.workout_id
    WHERE w.owner_id = v_owner_id
      AND we.exercise_name_display = r.base_name || ', ' || r.pct
    ON CONFLICT DO NOTHING;

    -- Remap workout_sets via old exercise_id (do this BEFORE updating workout_exercises)
    IF v_old_exercise_id IS NOT NULL THEN
      UPDATE workout_sets
      SET exercise_id           = v_base_exercise_id,
          exercise_name_display = r.base_name
      WHERE exercise_id = v_old_exercise_id;

      -- Remap personal_records
      UPDATE personal_records
      SET exercise_id = v_base_exercise_id
      WHERE exercise_id = v_old_exercise_id;
    END IF;

    -- Remap workout_exercises using display name as key
    UPDATE workout_exercises we
    SET exercise_id           = v_base_exercise_id,
        exercise_name_display = r.base_name
    FROM workouts w
    WHERE we.workout_id = w.id
      AND w.owner_id    = v_owner_id
      AND we.exercise_name_display = r.base_name || ', ' || r.pct;

    RAISE NOTICE '  Done: "%, %" → "%" with tag "%"', r.base_name, r.pct, r.base_name, r.pct;
  END LOOP;

  RAISE NOTICE 'Migration complete.';
END $$;
