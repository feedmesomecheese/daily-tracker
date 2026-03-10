-- Food / Nutrition module schema

-- Food items (global seeded + user custom)
CREATE TABLE food_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Misc', -- Meat / Dairy / Grains / Plants / Misc
  sub_category TEXT,
  note TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE food_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "food_items_select" ON food_items
  FOR SELECT USING (owner_id IS NULL OR owner_id = auth.uid());

CREATE POLICY "food_items_insert" ON food_items
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "food_items_update" ON food_items
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "food_items_delete" ON food_items
  FOR DELETE USING (owner_id = auth.uid());

CREATE INDEX food_items_owner_idx ON food_items(owner_id);
CREATE INDEX food_items_name_idx ON food_items(name);
CREATE INDEX food_items_category_idx ON food_items(category);

-- Named serving presets per food item
CREATE TABLE food_item_servings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food_item_id UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  label TEXT NOT NULL,          -- e.g. "1/2 cup", "1 can", "100g"
  calories NUMERIC NOT NULL DEFAULT 0,
  fat NUMERIC NOT NULL DEFAULT 0,
  carbs NUMERIC NOT NULL DEFAULT 0,
  protein NUMERIC NOT NULL DEFAULT 0,
  fiber NUMERIC NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE food_item_servings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "food_item_servings_select" ON food_item_servings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM food_items fi
      WHERE fi.id = food_item_id
        AND (fi.owner_id IS NULL OR fi.owner_id = auth.uid())
    )
  );

CREATE POLICY "food_item_servings_insert" ON food_item_servings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM food_items fi
      WHERE fi.id = food_item_id AND fi.owner_id = auth.uid()
    )
  );

CREATE POLICY "food_item_servings_update" ON food_item_servings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM food_items fi
      WHERE fi.id = food_item_id AND fi.owner_id = auth.uid()
    )
  );

CREATE POLICY "food_item_servings_delete" ON food_item_servings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM food_items fi
      WHERE fi.id = food_item_id AND fi.owner_id = auth.uid()
    )
  );

CREATE INDEX food_item_servings_food_idx ON food_item_servings(food_item_id);

-- User favorites (both global and custom foods)
CREATE TABLE food_favorites (
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_item_id UUID NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, food_item_id)
);

ALTER TABLE food_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "food_favorites_all" ON food_favorites
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Daily food logs (one per user per day)
CREATE TABLE food_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  notes TEXT,
  is_submitted BOOLEAN NOT NULL DEFAULT false,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, date)
);

ALTER TABLE food_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "food_logs_all" ON food_logs
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX food_logs_owner_date_idx ON food_logs(owner_id, date DESC);

-- Meals within a day log
CREATE TABLE food_log_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food_log_id UUID NOT NULL REFERENCES food_logs(id) ON DELETE CASCADE,
  meal_name TEXT NOT NULL DEFAULT 'Meal 1',
  meal_order INTEGER NOT NULL DEFAULT 0,
  meal_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE food_log_meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "food_log_meals_all" ON food_log_meals
  USING (
    EXISTS (
      SELECT 1 FROM food_logs fl
      WHERE fl.id = food_log_id AND fl.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM food_logs fl
      WHERE fl.id = food_log_id AND fl.owner_id = auth.uid()
    )
  );

CREATE INDEX food_log_meals_log_idx ON food_log_meals(food_log_id);

-- Food items within a meal (macros snapshotted at write time)
CREATE TABLE food_log_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food_log_meal_id UUID NOT NULL REFERENCES food_log_meals(id) ON DELETE CASCADE,
  food_item_id UUID REFERENCES food_items(id) ON DELETE SET NULL,
  food_item_serving_id UUID REFERENCES food_item_servings(id) ON DELETE SET NULL,
  food_name_snapshot TEXT NOT NULL,
  serving_label_snapshot TEXT NOT NULL,
  qty NUMERIC NOT NULL DEFAULT 1,
  calories NUMERIC NOT NULL DEFAULT 0,
  fat NUMERIC NOT NULL DEFAULT 0,
  carbs NUMERIC NOT NULL DEFAULT 0,
  protein NUMERIC NOT NULL DEFAULT 0,
  fiber NUMERIC NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE food_log_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "food_log_items_all" ON food_log_items
  USING (
    EXISTS (
      SELECT 1 FROM food_log_meals flm
      JOIN food_logs fl ON fl.id = flm.food_log_id
      WHERE flm.id = food_log_meal_id AND fl.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM food_log_meals flm
      JOIN food_logs fl ON fl.id = flm.food_log_id
      WHERE flm.id = food_log_meal_id AND fl.owner_id = auth.uid()
    )
  );

CREATE INDEX food_log_items_meal_idx ON food_log_items(food_log_meal_id);

-- Per-nutrient goals
CREATE TABLE food_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nutrient TEXT NOT NULL CHECK (nutrient IN ('calories', 'protein', 'fat', 'carbs', 'fiber')),
  direction TEXT NOT NULL CHECK (direction IN ('min', 'max', 'target')),
  value_type TEXT NOT NULL CHECK (value_type IN ('absolute', 'per_lb_bodyweight', 'pct_calories')),
  value NUMERIC NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE food_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "food_goals_all" ON food_goals
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX food_goals_owner_idx ON food_goals(owner_id);
