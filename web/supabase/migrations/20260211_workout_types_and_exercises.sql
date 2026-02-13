-- Workout Types & Exercises Redesign Migration
-- Adds workout_types, workout_exercises tables
-- Renames exercise_categories → exercise_groups
-- Alters workouts & workout_sets

-- ============================================
-- 1. Rename exercise_categories → exercise_groups
-- ============================================
ALTER TABLE exercise_categories RENAME TO exercise_groups;

-- Rename indexes
ALTER INDEX idx_exercise_categories_owner RENAME TO idx_exercise_groups_owner;
ALTER INDEX idx_exercise_categories_sort RENAME TO idx_exercise_groups_sort;

-- Drop old RLS policies and recreate with new names
DROP POLICY IF EXISTS "Users can view own exercise_categories" ON exercise_groups;
DROP POLICY IF EXISTS "Users can insert own exercise_categories" ON exercise_groups;
DROP POLICY IF EXISTS "Users can update own exercise_categories" ON exercise_groups;
DROP POLICY IF EXISTS "Users can delete own exercise_categories" ON exercise_groups;

CREATE POLICY "Users can view own exercise_groups" ON exercise_groups
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own exercise_groups" ON exercise_groups
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own exercise_groups" ON exercise_groups
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own exercise_groups" ON exercise_groups
  FOR DELETE USING (auth.uid() = owner_id);

-- Rename exercises.category_ids → exercises.group_ids
ALTER TABLE exercises RENAME COLUMN category_ids TO group_ids;

-- ============================================
-- 2. New table: workout_types
-- ============================================
CREATE TABLE IF NOT EXISTS workout_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  group_ids UUID[] DEFAULT '{}',
  sort_order INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workout_types_owner ON workout_types(owner_id);
CREATE INDEX idx_workout_types_sort ON workout_types(owner_id, sort_order);

ALTER TABLE workout_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workout_types" ON workout_types
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own workout_types" ON workout_types
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own workout_types" ON workout_types
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own workout_types" ON workout_types
  FOR DELETE USING (auth.uid() = owner_id);

-- ============================================
-- 3. Alter workouts table
-- ============================================
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS rating INTEGER CHECK (rating >= 1 AND rating <= 5);
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS workout_type_id UUID REFERENCES workout_types(id) ON DELETE SET NULL;

CREATE INDEX idx_workouts_type_id ON workouts(workout_type_id);

-- ============================================
-- 4. New table: workout_exercises
-- ============================================
CREATE TABLE IF NOT EXISTS workout_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,
  exercise_name_display TEXT NOT NULL,
  modifier_ids UUID[] DEFAULT '{}',
  exercise_order INTEGER NOT NULL,
  superset_group INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workout_exercises_workout ON workout_exercises(workout_id);
CREATE INDEX idx_workout_exercises_exercise ON workout_exercises(exercise_id);
CREATE INDEX idx_workout_exercises_order ON workout_exercises(workout_id, exercise_order);

ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workout_exercises" ON workout_exercises
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can insert own workout_exercises" ON workout_exercises
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can update own workout_exercises" ON workout_exercises
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can delete own workout_exercises" ON workout_exercises
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = workout_exercises.workout_id AND workouts.owner_id = auth.uid())
  );

-- ============================================
-- 5. Alter workout_sets table
-- ============================================
ALTER TABLE workout_sets ADD COLUMN IF NOT EXISTS workout_exercise_id UUID REFERENCES workout_exercises(id) ON DELETE CASCADE;

CREATE INDEX idx_workout_sets_exercise_entry ON workout_sets(workout_exercise_id);
