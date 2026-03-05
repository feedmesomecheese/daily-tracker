-- Workout Templates
-- Named reusable exercise lists for quick workout setup

-- ============================================
-- workout_templates
-- ============================================
CREATE TABLE IF NOT EXISTS workout_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  workout_type_id  UUID REFERENCES workout_types(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workout_templates_owner ON workout_templates(owner_id);

ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workout_templates" ON workout_templates
  FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can insert own workout_templates" ON workout_templates
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Users can update own workout_templates" ON workout_templates
  FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Users can delete own workout_templates" ON workout_templates
  FOR DELETE USING (auth.uid() = owner_id);

-- ============================================
-- workout_template_exercises
-- ============================================
CREATE TABLE IF NOT EXISTS workout_template_exercises (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id           UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  exercise_id           UUID REFERENCES exercises(id) ON DELETE SET NULL,
  exercise_name_display TEXT NOT NULL,
  modifier_ids          UUID[] DEFAULT '{}',
  exercise_order        INTEGER NOT NULL DEFAULT 0,
  target_sets           INTEGER,
  target_reps           INTEGER,
  target_weight         NUMERIC,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workout_template_exercises_template ON workout_template_exercises(template_id);

ALTER TABLE workout_template_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workout_template_exercises" ON workout_template_exercises
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM workout_templates
      WHERE workout_templates.id = workout_template_exercises.template_id
        AND workout_templates.owner_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert own workout_template_exercises" ON workout_template_exercises
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM workout_templates
      WHERE workout_templates.id = workout_template_exercises.template_id
        AND workout_templates.owner_id = auth.uid()
    )
  );
CREATE POLICY "Users can delete own workout_template_exercises" ON workout_template_exercises
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM workout_templates
      WHERE workout_templates.id = workout_template_exercises.template_id
        AND workout_templates.owner_id = auth.uid()
    )
  );
