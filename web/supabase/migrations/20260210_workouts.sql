-- Workout Module Schema
-- Phase 1: Foundation

-- ============================================
-- Exercise Categories (user-definable)
-- ============================================
CREATE TABLE IF NOT EXISTS exercise_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  short_code TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exercise_categories_owner ON exercise_categories(owner_id);
CREATE INDEX idx_exercise_categories_sort ON exercise_categories(owner_id, sort_order);

-- ============================================
-- Exercise Modifiers (banded, pause, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS exercise_modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  adjective_order INTEGER DEFAULT 0,  -- For consistent naming order
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exercise_modifiers_owner ON exercise_modifiers(owner_id);
CREATE INDEX idx_exercise_modifiers_order ON exercise_modifiers(owner_id, adjective_order);

-- ============================================
-- Exercises
-- ============================================
CREATE TABLE IF NOT EXISTS exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  exercise_type TEXT NOT NULL DEFAULT 'weighted',  -- weighted, bodyweight, cardio_hiit, cardio_zone2, sport
  counts_toward_volume BOOLEAN DEFAULT true,
  category_ids UUID[] DEFAULT '{}',
  available_modifier_ids UUID[] DEFAULT '{}',
  muscle_groups TEXT[] DEFAULT '{}',
  aliases TEXT[] DEFAULT '{}',
  is_archived BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exercises_owner ON exercises(owner_id);
CREATE INDEX idx_exercises_type ON exercises(owner_id, exercise_type);
CREATE INDEX idx_exercises_archived ON exercises(owner_id, is_archived);

-- ============================================
-- Workouts (one per session)
-- ============================================
CREATE TABLE IF NOT EXISTS workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  workout_type TEXT,  -- squat_day, bench_day, deadlift_day, cardio, etc.
  location TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  body_weight DECIMAL(5,2),
  body_fat_pct DECIMAL(4,1),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workouts_owner ON workouts(owner_id);
CREATE INDEX idx_workouts_date ON workouts(owner_id, date DESC);
CREATE INDEX idx_workouts_type ON workouts(owner_id, workout_type);

-- ============================================
-- Workout Sets
-- ============================================
CREATE TABLE IF NOT EXISTS workout_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,
  exercise_name_display TEXT NOT NULL,  -- Full name with modifiers
  modifier_ids UUID[] DEFAULT '{}',
  set_order INTEGER DEFAULT 0,  -- Order within the workout
  set_number INTEGER DEFAULT 1,  -- Set number for this exercise
  set_type TEXT DEFAULT 'working',  -- warmup, working, backoff, amrap
  reps INTEGER,
  weight DECIMAL(7,2),
  rpe DECIMAL(3,1),
  is_pr BOOLEAN DEFAULT false,
  is_cycle_max BOOLEAN DEFAULT false,
  is_missed BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workout_sets_workout ON workout_sets(workout_id);
CREATE INDEX idx_workout_sets_exercise ON workout_sets(exercise_id);
CREATE INDEX idx_workout_sets_order ON workout_sets(workout_id, set_order);

-- ============================================
-- HIIT Sessions
-- ============================================
CREATE TABLE IF NOT EXISTS hiit_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,
  exercise_name TEXT,
  rounds INTEGER,
  time_on_seconds INTEGER,
  time_off_seconds INTEGER,
  cycles_per_round INTEGER[] DEFAULT '{}',
  total_cycles INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_hiit_sessions_workout ON hiit_sessions(workout_id);

-- ============================================
-- Cardio Sessions (Zone 2, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS cardio_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id UUID REFERENCES exercises(id) ON DELETE SET NULL,
  exercise_name TEXT,
  duration_minutes INTEGER,
  distance DECIMAL(6,2),
  distance_unit TEXT,  -- miles, km
  avg_heart_rate INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cardio_sessions_workout ON cardio_sessions(workout_id);

-- ============================================
-- Activity Sessions (tennis, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS activity_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  duration_minutes INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_sessions_workout ON activity_sessions(workout_id);

-- ============================================
-- Personal Records
-- ============================================
CREATE TABLE IF NOT EXISTS personal_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE,
  pr_type TEXT DEFAULT '1rm',  -- 1rm, 3rm, 5rm, volume
  weight DECIMAL(7,2),
  reps INTEGER,
  estimated_1rm DECIMAL(7,2),
  achieved_at DATE,
  workout_id UUID REFERENCES workouts(id) ON DELETE SET NULL,
  set_id UUID REFERENCES workout_sets(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_personal_records_owner ON personal_records(owner_id);
CREATE INDEX idx_personal_records_exercise ON personal_records(exercise_id);
CREATE INDEX idx_personal_records_date ON personal_records(owner_id, achieved_at DESC);

-- ============================================
-- Timer Presets
-- ============================================
CREATE TABLE IF NOT EXISTS timer_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  timer_type TEXT,  -- hiit, rest, emom, tabata
  rounds INTEGER,
  work_seconds INTEGER,
  rest_seconds INTEGER,
  warmup_seconds INTEGER,
  cooldown_seconds INTEGER,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_timer_presets_owner ON timer_presets(owner_id);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE exercise_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE hiit_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cardio_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE timer_presets ENABLE ROW LEVEL SECURITY;

-- Exercise Categories policies
CREATE POLICY "Users can view own exercise_categories" ON exercise_categories
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own exercise_categories" ON exercise_categories
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own exercise_categories" ON exercise_categories
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own exercise_categories" ON exercise_categories
  FOR DELETE USING (auth.uid() = owner_id);

-- Exercise Modifiers policies
CREATE POLICY "Users can view own exercise_modifiers" ON exercise_modifiers
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own exercise_modifiers" ON exercise_modifiers
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own exercise_modifiers" ON exercise_modifiers
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own exercise_modifiers" ON exercise_modifiers
  FOR DELETE USING (auth.uid() = owner_id);

-- Exercises policies
CREATE POLICY "Users can view own exercises" ON exercises
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own exercises" ON exercises
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own exercises" ON exercises
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own exercises" ON exercises
  FOR DELETE USING (auth.uid() = owner_id);

-- Workouts policies
CREATE POLICY "Users can view own workouts" ON workouts
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own workouts" ON workouts
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own workouts" ON workouts
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own workouts" ON workouts
  FOR DELETE USING (auth.uid() = owner_id);

-- Workout Sets policies (via workout ownership)
CREATE POLICY "Users can view own workout_sets" ON workout_sets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = workout_sets.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can insert own workout_sets" ON workout_sets
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = workout_sets.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can update own workout_sets" ON workout_sets
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = workout_sets.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can delete own workout_sets" ON workout_sets
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = workout_sets.workout_id AND workouts.owner_id = auth.uid())
  );

-- HIIT Sessions policies
CREATE POLICY "Users can view own hiit_sessions" ON hiit_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = hiit_sessions.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can insert own hiit_sessions" ON hiit_sessions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = hiit_sessions.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can update own hiit_sessions" ON hiit_sessions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = hiit_sessions.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can delete own hiit_sessions" ON hiit_sessions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = hiit_sessions.workout_id AND workouts.owner_id = auth.uid())
  );

-- Cardio Sessions policies
CREATE POLICY "Users can view own cardio_sessions" ON cardio_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = cardio_sessions.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can insert own cardio_sessions" ON cardio_sessions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = cardio_sessions.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can update own cardio_sessions" ON cardio_sessions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = cardio_sessions.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can delete own cardio_sessions" ON cardio_sessions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = cardio_sessions.workout_id AND workouts.owner_id = auth.uid())
  );

-- Activity Sessions policies
CREATE POLICY "Users can view own activity_sessions" ON activity_sessions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = activity_sessions.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can insert own activity_sessions" ON activity_sessions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = activity_sessions.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can update own activity_sessions" ON activity_sessions
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = activity_sessions.workout_id AND workouts.owner_id = auth.uid())
  );
CREATE POLICY "Users can delete own activity_sessions" ON activity_sessions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM workouts WHERE workouts.id = activity_sessions.workout_id AND workouts.owner_id = auth.uid())
  );

-- Personal Records policies
CREATE POLICY "Users can view own personal_records" ON personal_records
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own personal_records" ON personal_records
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own personal_records" ON personal_records
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own personal_records" ON personal_records
  FOR DELETE USING (auth.uid() = owner_id);

-- Timer Presets policies
CREATE POLICY "Users can view own timer_presets" ON timer_presets
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own timer_presets" ON timer_presets
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own timer_presets" ON timer_presets
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own timer_presets" ON timer_presets
  FOR DELETE USING (auth.uid() = owner_id);
