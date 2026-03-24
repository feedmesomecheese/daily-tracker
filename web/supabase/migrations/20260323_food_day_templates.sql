-- Day-level food templates (saves all meals + items from a logged day)

CREATE TABLE food_day_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE food_day_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "food_day_templates_all" ON food_day_templates
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX food_day_templates_owner_idx ON food_day_templates(owner_id);

-- Each day template has one or more named meals
CREATE TABLE food_day_template_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_template_id UUID NOT NULL REFERENCES food_day_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE food_day_template_meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "food_day_template_meals_all" ON food_day_template_meals
  USING (
    EXISTS (
      SELECT 1 FROM food_day_templates fdt
      WHERE fdt.id = day_template_id AND fdt.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM food_day_templates fdt
      WHERE fdt.id = day_template_id AND fdt.owner_id = auth.uid()
    )
  );

CREATE INDEX food_day_template_meals_template_idx ON food_day_template_meals(day_template_id);

-- Each meal in a day template has food items (same snapshotted fields as log items)
CREATE TABLE food_day_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_template_meal_id UUID NOT NULL REFERENCES food_day_template_meals(id) ON DELETE CASCADE,
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

ALTER TABLE food_day_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "food_day_template_items_all" ON food_day_template_items
  USING (
    EXISTS (
      SELECT 1 FROM food_day_template_meals fdtm
      JOIN food_day_templates fdt ON fdt.id = fdtm.day_template_id
      WHERE fdtm.id = day_template_meal_id AND fdt.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM food_day_template_meals fdtm
      JOIN food_day_templates fdt ON fdt.id = fdtm.day_template_id
      WHERE fdtm.id = day_template_meal_id AND fdt.owner_id = auth.uid()
    )
  );

CREATE INDEX food_day_template_items_meal_idx ON food_day_template_items(day_template_meal_id);
