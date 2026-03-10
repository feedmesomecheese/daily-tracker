-- Clear global seed data and re-seed cleanly
-- Servings cascade-delete when food_items are deleted

DELETE FROM food_item_servings
WHERE food_item_id IN (
  SELECT id FROM food_items WHERE owner_id IS NULL
);

DELETE FROM food_items WHERE owner_id IS NULL;
