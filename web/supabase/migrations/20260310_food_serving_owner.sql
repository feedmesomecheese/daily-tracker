-- Allow users to add their own serving sizes to any food (global or custom)
-- by adding owner_id to food_item_servings

ALTER TABLE food_item_servings
  ADD COLUMN owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Drop old policies
DROP POLICY "food_item_servings_select" ON food_item_servings;
DROP POLICY "food_item_servings_insert" ON food_item_servings;
DROP POLICY "food_item_servings_update" ON food_item_servings;
DROP POLICY "food_item_servings_delete" ON food_item_servings;

-- SELECT: serving is global (owner_id NULL) or user's own,
--         AND the parent food is accessible to the user
CREATE POLICY "food_item_servings_select" ON food_item_servings
  FOR SELECT USING (
    (owner_id IS NULL OR owner_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM food_items fi
      WHERE fi.id = food_item_id
        AND (fi.owner_id IS NULL OR fi.owner_id = auth.uid())
        AND fi.is_archived = false
    )
  );

-- INSERT: user inserts their own servings on any accessible food
CREATE POLICY "food_item_servings_insert" ON food_item_servings
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM food_items fi
      WHERE fi.id = food_item_id
        AND (fi.owner_id IS NULL OR fi.owner_id = auth.uid())
        AND fi.is_archived = false
    )
  );

-- UPDATE / DELETE: only the user's own servings
CREATE POLICY "food_item_servings_update" ON food_item_servings
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "food_item_servings_delete" ON food_item_servings
  FOR DELETE USING (owner_id = auth.uid());
