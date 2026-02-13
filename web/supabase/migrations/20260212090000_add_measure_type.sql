-- Add measure_type to exercises
-- Values: srw (sets/reps/weight), coo (cycles/on/off), mmiw (min/miles/incline/weight),
--         mmw (min/miles/weight), mw (min/weight), minutes
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS measure_type TEXT DEFAULT 'srw';
