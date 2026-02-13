-- Add input_type to exercise_groups
-- Values: 'strength' (default, sets/reps/weight), 'hiit' (cycles/on/off),
--         'cardio' (minutes/miles/incline/weight), 'sport' (notes only)
ALTER TABLE exercise_groups ADD COLUMN IF NOT EXISTS input_type TEXT DEFAULT 'strength';

-- Add cardio/hiit data columns to workout_exercises
-- These are used for non-strength exercises (instead of workout_sets)
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS duration_minutes DECIMAL(7,2);
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS distance_miles DECIMAL(6,2);
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS incline_pct DECIMAL(4,1);
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS weight DECIMAL(7,2);
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS time_on_seconds INTEGER;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS time_off_seconds INTEGER;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS cycles INTEGER;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS notes TEXT;
