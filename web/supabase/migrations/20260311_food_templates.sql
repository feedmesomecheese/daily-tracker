-- Meal templates for the food module

CREATE TABLE food_meal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE food_meal_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "food_meal_templates_all" ON food_meal_templates
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX food_meal_templates_owner_idx ON food_meal_templates(owner_id);

CREATE TABLE food_meal_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES food_meal_templates(id) ON DELETE CASCADE,
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

ALTER TABLE food_meal_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "food_meal_template_items_all" ON food_meal_template_items
  USING (
    EXISTS (
      SELECT 1 FROM food_meal_templates fmt
      WHERE fmt.id = template_id AND fmt.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM food_meal_templates fmt
      WHERE fmt.id = template_id AND fmt.owner_id = auth.uid()
    )
  );

CREATE INDEX food_meal_template_items_template_idx ON food_meal_template_items(template_id);
