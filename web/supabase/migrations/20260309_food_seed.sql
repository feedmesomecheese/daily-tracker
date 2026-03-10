-- Food seed data (~200 global food items with serving presets)
-- owner_id IS NULL = global/shared food

DO $$
DECLARE
  -- Meat
  id_chicken_breast UUID := gen_random_uuid();
  id_chicken_thigh UUID := gen_random_uuid();
  id_ground_beef_73 UUID := gen_random_uuid();
  id_ground_beef_80 UUID := gen_random_uuid();
  id_ground_beef_90 UUID := gen_random_uuid();
  id_salmon UUID := gen_random_uuid();
  id_tuna_can UUID := gen_random_uuid();
  id_tilapia UUID := gen_random_uuid();
  id_shrimp UUID := gen_random_uuid();
  id_pork_chop UUID := gen_random_uuid();
  id_bacon UUID := gen_random_uuid();
  id_turkey_breast UUID := gen_random_uuid();
  id_ny_strip UUID := gen_random_uuid();
  id_sirloin UUID := gen_random_uuid();
  id_beef_jerky UUID := gen_random_uuid();
  id_whey_protein UUID := gen_random_uuid();
  id_casein_protein UUID := gen_random_uuid();
  id_ground_turkey UUID := gen_random_uuid();
  id_chicken_wing UUID := gen_random_uuid();
  id_canned_chicken UUID := gen_random_uuid();
  id_sardines UUID := gen_random_uuid();
  id_cod UUID := gen_random_uuid();
  id_halibut UUID := gen_random_uuid();
  id_lamb_chop UUID := gen_random_uuid();
  id_pork_tenderloin UUID := gen_random_uuid();
  id_deli_turkey UUID := gen_random_uuid();
  id_deli_ham UUID := gen_random_uuid();
  id_hot_dog UUID := gen_random_uuid();
  id_pepperoni UUID := gen_random_uuid();
  id_sausage_link UUID := gen_random_uuid();
  id_ribeye UUID := gen_random_uuid();
  id_brisket UUID := gen_random_uuid();
  id_scallops UUID := gen_random_uuid();
  id_lobster UUID := gen_random_uuid();
  id_crab UUID := gen_random_uuid();
  id_duck_breast UUID := gen_random_uuid();
  id_venison UUID := gen_random_uuid();
  id_bison UUID := gen_random_uuid();
  id_plant_protein UUID := gen_random_uuid();
  id_collagen_peptides UUID := gen_random_uuid();

  -- Dairy
  id_eggs UUID := gen_random_uuid();
  id_egg_whites UUID := gen_random_uuid();
  id_milk_2pct UUID := gen_random_uuid();
  id_greek_yogurt_nonfat UUID := gen_random_uuid();
  id_greek_yogurt_fullfat UUID := gen_random_uuid();
  id_cottage_cheese_4pct UUID := gen_random_uuid();
  id_cottage_cheese_ff UUID := gen_random_uuid();
  id_mozzarella UUID := gen_random_uuid();
  id_cheddar UUID := gen_random_uuid();
  id_swiss UUID := gen_random_uuid();
  id_cojack UUID := gen_random_uuid();
  id_cream_cheese UUID := gen_random_uuid();
  id_butter UUID := gen_random_uuid();
  id_heavy_cream UUID := gen_random_uuid();
  id_sour_cream UUID := gen_random_uuid();
  id_parmesan UUID := gen_random_uuid();
  id_feta UUID := gen_random_uuid();
  id_ricotta UUID := gen_random_uuid();
  id_milk_whole UUID := gen_random_uuid();
  id_milk_skim UUID := gen_random_uuid();
  id_kefir UUID := gen_random_uuid();
  id_whipped_cream UUID := gen_random_uuid();
  id_american_cheese UUID := gen_random_uuid();
  id_provolone UUID := gen_random_uuid();
  id_gouda UUID := gen_random_uuid();

  -- Grains
  id_oatmeal UUID := gen_random_uuid();
  id_white_rice UUID := gen_random_uuid();
  id_brown_rice UUID := gen_random_uuid();
  id_ww_bread UUID := gen_random_uuid();
  id_ww_tortilla UUID := gen_random_uuid();
  id_ww_pita UUID := gen_random_uuid();
  id_pasta UUID := gen_random_uuid();
  id_bagel UUID := gen_random_uuid();
  id_sweet_potato UUID := gen_random_uuid();
  id_potato UUID := gen_random_uuid();
  id_quinoa UUID := gen_random_uuid();
  id_corn_tortilla UUID := gen_random_uuid();
  id_white_bread UUID := gen_random_uuid();
  id_english_muffin UUID := gen_random_uuid();
  id_granola UUID := gen_random_uuid();
  id_cream_of_wheat UUID := gen_random_uuid();
  id_rice_cake UUID := gen_random_uuid();
  id_corn UUID := gen_random_uuid();
  id_peas UUID := gen_random_uuid();
  id_butternut_squash UUID := gen_random_uuid();

  -- Plants
  id_bell_pepper UUID := gen_random_uuid();
  id_onion UUID := gen_random_uuid();
  id_broccoli UUID := gen_random_uuid();
  id_spinach UUID := gen_random_uuid();
  id_black_beans UUID := gen_random_uuid();
  id_lentils UUID := gen_random_uuid();
  id_chickpeas UUID := gen_random_uuid();
  id_green_beans UUID := gen_random_uuid();
  id_apple UUID := gen_random_uuid();
  id_banana UUID := gen_random_uuid();
  id_strawberries UUID := gen_random_uuid();
  id_avocado UUID := gen_random_uuid();
  id_edamame UUID := gen_random_uuid();
  id_tomato UUID := gen_random_uuid();
  id_cucumber UUID := gen_random_uuid();
  id_romaine UUID := gen_random_uuid();
  id_kale UUID := gen_random_uuid();
  id_blueberries UUID := gen_random_uuid();
  id_orange UUID := gen_random_uuid();
  id_grapes UUID := gen_random_uuid();
  id_mango UUID := gen_random_uuid();
  id_pineapple UUID := gen_random_uuid();
  id_celery UUID := gen_random_uuid();
  id_carrot UUID := gen_random_uuid();
  id_garlic UUID := gen_random_uuid();
  id_mushrooms UUID := gen_random_uuid();
  id_zucchini UUID := gen_random_uuid();
  id_asparagus UUID := gen_random_uuid();
  id_brussels_sprouts UUID := gen_random_uuid();
  id_cauliflower UUID := gen_random_uuid();
  id_kidney_beans UUID := gen_random_uuid();
  id_pinto_beans UUID := gen_random_uuid();
  id_tofu UUID := gen_random_uuid();
  id_tempeh UUID := gen_random_uuid();
  id_beets UUID := gen_random_uuid();
  id_sweet_peas UUID := gen_random_uuid();
  id_artichoke UUID := gen_random_uuid();
  id_leek UUID := gen_random_uuid();
  id_watermelon UUID := gen_random_uuid();
  id_peach UUID := gen_random_uuid();
  id_pear UUID := gen_random_uuid();
  id_kiwi UUID := gen_random_uuid();
  id_cherry UUID := gen_random_uuid();
  id_pomegranate UUID := gen_random_uuid();
  id_grapefruit UUID := gen_random_uuid();

  -- Misc/Fats
  id_evoo UUID := gen_random_uuid();
  id_coconut_oil UUID := gen_random_uuid();
  id_mayo UUID := gen_random_uuid();
  id_peanut_butter UUID := gen_random_uuid();
  id_almonds UUID := gen_random_uuid();
  id_peanuts UUID := gen_random_uuid();
  id_cashews UUID := gen_random_uuid();
  id_walnuts UUID := gen_random_uuid();
  id_coconut_milk UUID := gen_random_uuid();
  id_fish_oil UUID := gen_random_uuid();
  id_dark_chocolate UUID := gen_random_uuid();
  id_almond_butter UUID := gen_random_uuid();
  id_sunflower_seeds UUID := gen_random_uuid();
  id_chia_seeds UUID := gen_random_uuid();
  id_flaxseeds UUID := gen_random_uuid();
  id_hemp_seeds UUID := gen_random_uuid();
  id_macadamia UUID := gen_random_uuid();
  id_pecans UUID := gen_random_uuid();
  id_pistachios UUID := gen_random_uuid();
  id_olive UUID := gen_random_uuid();
BEGIN

-- ============ MEAT ============
INSERT INTO food_items (id, owner_id, name, category, sub_category) VALUES
  (id_chicken_breast, NULL, 'Chicken Breast', 'Meat', 'Poultry'),
  (id_chicken_thigh, NULL, 'Chicken Thigh', 'Meat', 'Poultry'),
  (id_ground_beef_73, NULL, 'Ground Beef 73/27', 'Meat', 'Beef'),
  (id_ground_beef_80, NULL, 'Ground Beef 80/20', 'Meat', 'Beef'),
  (id_ground_beef_90, NULL, 'Ground Beef 90/10', 'Meat', 'Beef'),
  (id_salmon, NULL, 'Salmon', 'Meat', 'Fish'),
  (id_tuna_can, NULL, 'Tuna (canned in water)', 'Meat', 'Fish'),
  (id_tilapia, NULL, 'Tilapia', 'Meat', 'Fish'),
  (id_shrimp, NULL, 'Shrimp', 'Meat', 'Seafood'),
  (id_pork_chop, NULL, 'Pork Chop', 'Meat', 'Pork'),
  (id_bacon, NULL, 'Bacon', 'Meat', 'Pork'),
  (id_turkey_breast, NULL, 'Turkey Breast', 'Meat', 'Poultry'),
  (id_ny_strip, NULL, 'NY Strip Steak', 'Meat', 'Beef'),
  (id_sirloin, NULL, 'Sirloin Steak', 'Meat', 'Beef'),
  (id_beef_jerky, NULL, 'Beef Jerky', 'Meat', 'Beef'),
  (id_whey_protein, NULL, 'Whey Protein Powder', 'Meat', 'Protein Supplement'),
  (id_casein_protein, NULL, 'Casein Protein Powder', 'Meat', 'Protein Supplement'),
  (id_ground_turkey, NULL, 'Ground Turkey', 'Meat', 'Poultry'),
  (id_chicken_wing, NULL, 'Chicken Wing', 'Meat', 'Poultry'),
  (id_canned_chicken, NULL, 'Chicken (canned)', 'Meat', 'Poultry'),
  (id_sardines, NULL, 'Sardines (canned in oil)', 'Meat', 'Fish'),
  (id_cod, NULL, 'Cod', 'Meat', 'Fish'),
  (id_halibut, NULL, 'Halibut', 'Meat', 'Fish'),
  (id_lamb_chop, NULL, 'Lamb Chop', 'Meat', 'Lamb'),
  (id_pork_tenderloin, NULL, 'Pork Tenderloin', 'Meat', 'Pork'),
  (id_deli_turkey, NULL, 'Deli Turkey', 'Meat', 'Deli'),
  (id_deli_ham, NULL, 'Deli Ham', 'Meat', 'Deli'),
  (id_hot_dog, NULL, 'Hot Dog', 'Meat', 'Processed'),
  (id_pepperoni, NULL, 'Pepperoni', 'Meat', 'Processed'),
  (id_sausage_link, NULL, 'Sausage Link', 'Meat', 'Pork'),
  (id_ribeye, NULL, 'Ribeye Steak', 'Meat', 'Beef'),
  (id_brisket, NULL, 'Brisket', 'Meat', 'Beef'),
  (id_scallops, NULL, 'Scallops', 'Meat', 'Seafood'),
  (id_lobster, NULL, 'Lobster', 'Meat', 'Seafood'),
  (id_crab, NULL, 'Crab', 'Meat', 'Seafood'),
  (id_duck_breast, NULL, 'Duck Breast', 'Meat', 'Poultry'),
  (id_venison, NULL, 'Venison', 'Meat', 'Game'),
  (id_bison, NULL, 'Bison Patty', 'Meat', 'Beef'),
  (id_plant_protein, NULL, 'Plant Protein Powder', 'Meat', 'Protein Supplement'),
  (id_collagen_peptides, NULL, 'Collagen Peptides', 'Meat', 'Protein Supplement');

INSERT INTO food_item_servings (food_item_id, label, calories, fat, carbs, protein, fiber, is_default, sort_order) VALUES
  (id_chicken_breast, '4 oz raw', 124, 1.4, 0, 26, 0, true, 0),
  (id_chicken_breast, '6 oz raw', 186, 2.1, 0, 39, 0, false, 1),
  (id_chicken_thigh, '4 oz raw', 172, 9, 0, 23, 0, true, 0),
  (id_ground_beef_73, '4 oz raw', 290, 23, 0, 20, 0, true, 0),
  (id_ground_beef_80, '4 oz raw', 287, 23, 0, 19, 0, true, 0),
  (id_ground_beef_90, '4 oz raw', 199, 11, 0, 23, 0, true, 0),
  (id_salmon, '4 oz raw', 208, 12, 0, 22, 0, true, 0),
  (id_salmon, '6 oz raw', 312, 18, 0, 33, 0, false, 1),
  (id_tuna_can, '1 can (5 oz)', 130, 1, 0, 28, 0, true, 0),
  (id_tilapia, '4 oz raw', 109, 2, 0, 22, 0, true, 0),
  (id_shrimp, '4 oz raw', 112, 1.7, 1, 21, 0, true, 0),
  (id_pork_chop, '4 oz raw', 187, 9, 0, 25, 0, true, 0),
  (id_bacon, '2 slices cooked', 87, 7, 0.2, 6, 0, true, 0),
  (id_bacon, '3 slices cooked', 130, 10.5, 0.3, 9, 0, false, 1),
  (id_turkey_breast, '4 oz raw', 120, 1, 0, 26, 0, true, 0),
  (id_ny_strip, '6 oz raw', 333, 19, 0, 36, 0, true, 0),
  (id_sirloin, '4 oz raw', 207, 10, 0, 27, 0, true, 0),
  (id_beef_jerky, '1 oz', 116, 7, 3, 9, 0.5, true, 0),
  (id_whey_protein, '1 scoop (30g)', 120, 2, 4, 22, 1, true, 0),
  (id_casein_protein, '1 scoop (30g)', 110, 1, 4, 24, 1, true, 0),
  (id_ground_turkey, '4 oz raw', 170, 9, 0, 21, 0, true, 0),
  (id_chicken_wing, '1 wing cooked', 99, 7, 0, 8, 0, true, 0),
  (id_canned_chicken, '1 can (4.5 oz)', 130, 4, 0, 22, 0, true, 0),
  (id_sardines, '1 can (3.75 oz)', 191, 12, 0, 19, 0, true, 0),
  (id_cod, '4 oz raw', 93, 0.8, 0, 20, 0, true, 0),
  (id_halibut, '4 oz raw', 124, 2.6, 0, 23, 0, true, 0),
  (id_lamb_chop, '4 oz raw', 245, 17, 0, 21, 0, true, 0),
  (id_pork_tenderloin, '4 oz raw', 136, 3.5, 0, 24, 0, true, 0),
  (id_deli_turkey, '2 oz (4 slices)', 60, 0.5, 2, 12, 0, true, 0),
  (id_deli_ham, '2 oz (4 slices)', 70, 3, 2, 9, 0, true, 0),
  (id_hot_dog, '1 link', 180, 16, 2, 7, 0, true, 0),
  (id_pepperoni, '1 oz (about 14 slices)', 130, 11, 0, 6, 0, true, 0),
  (id_sausage_link, '1 link (2 oz)', 196, 17, 0.5, 9, 0, true, 0),
  (id_ribeye, '6 oz raw', 420, 32, 0, 30, 0, true, 0),
  (id_brisket, '4 oz cooked', 330, 22, 0, 30, 0, true, 0),
  (id_scallops, '4 oz raw', 100, 0.8, 5, 19, 0, true, 0),
  (id_lobster, '4 oz cooked', 111, 1, 1, 23, 0, true, 0),
  (id_crab, '4 oz cooked', 116, 2, 0, 20, 0, true, 0),
  (id_duck_breast, '4 oz raw', 250, 18, 0, 21, 0, true, 0),
  (id_venison, '4 oz raw', 179, 7, 0, 26, 0, true, 0),
  (id_bison, '4 oz raw', 152, 7, 0, 22, 0, true, 0),
  (id_plant_protein, '1 scoop (30g)', 110, 2, 7, 20, 2, true, 0),
  (id_collagen_peptides, '1 scoop (10g)', 35, 0, 0, 9, 0, true, 0);

-- ============ DAIRY ============
INSERT INTO food_items (id, owner_id, name, category, sub_category) VALUES
  (id_eggs, NULL, 'Eggs', 'Dairy', 'Eggs'),
  (id_egg_whites, NULL, 'Egg Whites', 'Dairy', 'Eggs'),
  (id_milk_2pct, NULL, 'Milk 2%', 'Dairy', 'Milk'),
  (id_greek_yogurt_nonfat, NULL, 'Greek Yogurt (nonfat)', 'Dairy', 'Yogurt'),
  (id_greek_yogurt_fullfat, NULL, 'Greek Yogurt (full fat)', 'Dairy', 'Yogurt'),
  (id_cottage_cheese_4pct, NULL, 'Cottage Cheese 4%', 'Dairy', 'Cheese'),
  (id_cottage_cheese_ff, NULL, 'Cottage Cheese (fat-free)', 'Dairy', 'Cheese'),
  (id_mozzarella, NULL, 'Mozzarella', 'Dairy', 'Cheese'),
  (id_cheddar, NULL, 'Cheddar Cheese', 'Dairy', 'Cheese'),
  (id_swiss, NULL, 'Swiss Cheese', 'Dairy', 'Cheese'),
  (id_cojack, NULL, 'CoJack Cheese', 'Dairy', 'Cheese'),
  (id_cream_cheese, NULL, 'Cream Cheese', 'Dairy', 'Cheese'),
  (id_butter, NULL, 'Butter', 'Dairy', 'Fats'),
  (id_heavy_cream, NULL, 'Heavy Cream', 'Dairy', 'Cream'),
  (id_sour_cream, NULL, 'Sour Cream', 'Dairy', 'Cream'),
  (id_parmesan, NULL, 'Parmesan', 'Dairy', 'Cheese'),
  (id_feta, NULL, 'Feta Cheese', 'Dairy', 'Cheese'),
  (id_ricotta, NULL, 'Ricotta', 'Dairy', 'Cheese'),
  (id_milk_whole, NULL, 'Milk (whole)', 'Dairy', 'Milk'),
  (id_milk_skim, NULL, 'Milk (skim)', 'Dairy', 'Milk'),
  (id_kefir, NULL, 'Kefir', 'Dairy', 'Milk'),
  (id_whipped_cream, NULL, 'Whipped Cream', 'Dairy', 'Cream'),
  (id_american_cheese, NULL, 'American Cheese', 'Dairy', 'Cheese'),
  (id_provolone, NULL, 'Provolone', 'Dairy', 'Cheese'),
  (id_gouda, NULL, 'Gouda', 'Dairy', 'Cheese');

INSERT INTO food_item_servings (food_item_id, label, calories, fat, carbs, protein, fiber, is_default, sort_order) VALUES
  (id_eggs, '1 large egg', 72, 5, 0.4, 6, 0, true, 0),
  (id_eggs, '2 large eggs', 144, 10, 0.8, 12, 0, false, 1),
  (id_egg_whites, '3 egg whites', 51, 0.2, 1, 11, 0, true, 0),
  (id_egg_whites, '1/2 cup liquid', 63, 0.2, 1.3, 13, 0, false, 1),
  (id_milk_2pct, '1 cup', 122, 5, 12, 8, 0, true, 0),
  (id_greek_yogurt_nonfat, '1 cup', 100, 0.7, 6, 17, 0, true, 0),
  (id_greek_yogurt_fullfat, '1 cup', 220, 11, 8, 20, 0, true, 0),
  (id_cottage_cheese_4pct, '1/2 cup', 111, 5, 3, 13, 0, true, 0),
  (id_cottage_cheese_ff, '1/2 cup', 80, 0.5, 5, 14, 0, true, 0),
  (id_mozzarella, '1 oz', 85, 6.3, 1, 6.3, 0, true, 0),
  (id_cheddar, '1 oz', 114, 9, 0.4, 7, 0, true, 0),
  (id_swiss, '1 oz', 106, 7.9, 1.5, 7.6, 0, true, 0),
  (id_cojack, '1 oz', 105, 8, 1, 7, 0, true, 0),
  (id_cream_cheese, '2 tbsp', 99, 10, 1.2, 1.7, 0, true, 0),
  (id_butter, '1 tbsp', 102, 11.5, 0, 0.1, 0, true, 0),
  (id_heavy_cream, '2 tbsp', 103, 11, 0.8, 0.6, 0, true, 0),
  (id_sour_cream, '2 tbsp', 60, 5, 1, 0.9, 0, true, 0),
  (id_parmesan, '2 tbsp (10g)', 42, 2.8, 0.4, 3.8, 0, true, 0),
  (id_feta, '1 oz', 75, 6, 1.2, 4, 0, true, 0),
  (id_ricotta, '1/4 cup', 107, 7.9, 2, 7, 0, true, 0),
  (id_milk_whole, '1 cup', 149, 8, 12, 8, 0, true, 0),
  (id_milk_skim, '1 cup', 83, 0.2, 12, 8.3, 0, true, 0),
  (id_kefir, '1 cup', 110, 2, 12, 11, 0, true, 0),
  (id_whipped_cream, '2 tbsp', 20, 1.5, 1, 0.1, 0, true, 0),
  (id_american_cheese, '1 slice', 65, 5, 1, 3.5, 0, true, 0),
  (id_provolone, '1 oz', 98, 7.5, 0.6, 7.3, 0, true, 0),
  (id_gouda, '1 oz', 101, 7.8, 0.6, 7.1, 0, true, 0);

-- ============ GRAINS ============
INSERT INTO food_items (id, owner_id, name, category, sub_category) VALUES
  (id_oatmeal, NULL, 'Oatmeal (dry)', 'Grains', 'Oats'),
  (id_white_rice, NULL, 'White Rice (cooked)', 'Grains', 'Rice'),
  (id_brown_rice, NULL, 'Brown Rice (cooked)', 'Grains', 'Rice'),
  (id_ww_bread, NULL, 'Whole Wheat Bread', 'Grains', 'Bread'),
  (id_ww_tortilla, NULL, 'Whole Wheat Tortilla', 'Grains', 'Tortilla'),
  (id_ww_pita, NULL, 'Whole Wheat Pita', 'Grains', 'Bread'),
  (id_pasta, NULL, 'Pasta (cooked)', 'Grains', 'Pasta'),
  (id_bagel, NULL, 'Bagel (plain)', 'Grains', 'Bread'),
  (id_sweet_potato, NULL, 'Sweet Potato', 'Grains', 'Potato'),
  (id_potato, NULL, 'Potato (white)', 'Grains', 'Potato'),
  (id_quinoa, NULL, 'Quinoa (cooked)', 'Grains', 'Grain'),
  (id_corn_tortilla, NULL, 'Corn Tortilla', 'Grains', 'Tortilla'),
  (id_white_bread, NULL, 'White Bread', 'Grains', 'Bread'),
  (id_english_muffin, NULL, 'English Muffin', 'Grains', 'Bread'),
  (id_granola, NULL, 'Granola', 'Grains', 'Cereal'),
  (id_cream_of_wheat, NULL, 'Cream of Wheat (cooked)', 'Grains', 'Cereal'),
  (id_rice_cake, NULL, 'Rice Cake', 'Grains', 'Snack'),
  (id_corn, NULL, 'Corn (kernels)', 'Grains', 'Vegetable'),
  (id_peas, NULL, 'Green Peas', 'Grains', 'Legume'),
  (id_butternut_squash, NULL, 'Butternut Squash', 'Grains', 'Vegetable');

INSERT INTO food_item_servings (food_item_id, label, calories, fat, carbs, protein, fiber, is_default, sort_order) VALUES
  (id_oatmeal, '1/2 cup dry', 150, 2.5, 27, 5, 4, true, 0),
  (id_oatmeal, '1 cup dry', 300, 5, 54, 10, 8, false, 1),
  (id_white_rice, '1 cup cooked', 206, 0.4, 45, 4.3, 0.6, true, 0),
  (id_brown_rice, '1 cup cooked', 218, 1.8, 45, 4.5, 3.5, true, 0),
  (id_ww_bread, '1 slice', 69, 1, 12, 3.6, 1.9, true, 0),
  (id_ww_bread, '2 slices', 138, 2, 24, 7.2, 3.8, false, 1),
  (id_ww_tortilla, '1 large (10")', 146, 3.5, 26, 5, 3.4, true, 0),
  (id_ww_pita, '1 pita (6.5")', 170, 1.5, 35, 6, 5, true, 0),
  (id_pasta, '1 cup cooked', 220, 1.3, 43, 8, 2.5, true, 0),
  (id_bagel, '1 medium bagel', 270, 1.5, 53, 9, 2, true, 0),
  (id_sweet_potato, '1 medium (5 oz)', 130, 0, 30, 3, 4, true, 0),
  (id_potato, '1/2 large', 78, 0.1, 18, 2, 1.3, true, 0),
  (id_quinoa, '1 cup cooked', 222, 3.5, 39, 8, 5, true, 0),
  (id_corn_tortilla, '2 small (6")', 102, 1.5, 21, 2.6, 3, true, 0),
  (id_white_bread, '1 slice', 75, 1, 14, 2.5, 0.6, true, 0),
  (id_english_muffin, '1 whole muffin', 134, 1, 26, 4.5, 1.5, true, 0),
  (id_granola, '1/3 cup', 140, 5, 23, 3, 2, true, 0),
  (id_cream_of_wheat, '1 cup cooked', 126, 0.5, 27, 3.6, 1.3, true, 0),
  (id_rice_cake, '1 cake', 35, 0.3, 7.3, 0.7, 0.4, true, 0),
  (id_corn, '1/2 cup', 66, 0.8, 15, 2.5, 1.8, true, 0),
  (id_peas, '1/2 cup', 62, 0.2, 11, 4.1, 3.5, true, 0),
  (id_butternut_squash, '1 cup cubed', 63, 0.1, 16, 1.4, 2.8, true, 0);

-- ============ PLANTS ============
INSERT INTO food_items (id, owner_id, name, category, sub_category) VALUES
  (id_bell_pepper, NULL, 'Bell Pepper', 'Plants', 'Vegetable'),
  (id_onion, NULL, 'Onion', 'Plants', 'Vegetable'),
  (id_broccoli, NULL, 'Broccoli', 'Plants', 'Vegetable'),
  (id_spinach, NULL, 'Spinach', 'Plants', 'Leafy Green'),
  (id_black_beans, NULL, 'Black Beans', 'Plants', 'Legume'),
  (id_lentils, NULL, 'Lentils (cooked)', 'Plants', 'Legume'),
  (id_chickpeas, NULL, 'Chickpeas', 'Plants', 'Legume'),
  (id_green_beans, NULL, 'Green Beans', 'Plants', 'Vegetable'),
  (id_apple, NULL, 'Apple', 'Plants', 'Fruit'),
  (id_banana, NULL, 'Banana', 'Plants', 'Fruit'),
  (id_strawberries, NULL, 'Strawberries', 'Plants', 'Fruit'),
  (id_avocado, NULL, 'Avocado', 'Plants', 'Fruit'),
  (id_edamame, NULL, 'Edamame (shelled)', 'Plants', 'Legume'),
  (id_tomato, NULL, 'Tomato', 'Plants', 'Vegetable'),
  (id_cucumber, NULL, 'Cucumber', 'Plants', 'Vegetable'),
  (id_romaine, NULL, 'Romaine Lettuce', 'Plants', 'Leafy Green'),
  (id_kale, NULL, 'Kale', 'Plants', 'Leafy Green'),
  (id_blueberries, NULL, 'Blueberries', 'Plants', 'Fruit'),
  (id_orange, NULL, 'Orange', 'Plants', 'Fruit'),
  (id_grapes, NULL, 'Grapes', 'Plants', 'Fruit'),
  (id_mango, NULL, 'Mango', 'Plants', 'Fruit'),
  (id_pineapple, NULL, 'Pineapple', 'Plants', 'Fruit'),
  (id_celery, NULL, 'Celery', 'Plants', 'Vegetable'),
  (id_carrot, NULL, 'Carrot', 'Plants', 'Vegetable'),
  (id_garlic, NULL, 'Garlic', 'Plants', 'Vegetable'),
  (id_mushrooms, NULL, 'Mushrooms', 'Plants', 'Vegetable'),
  (id_zucchini, NULL, 'Zucchini', 'Plants', 'Vegetable'),
  (id_asparagus, NULL, 'Asparagus', 'Plants', 'Vegetable'),
  (id_brussels_sprouts, NULL, 'Brussels Sprouts', 'Plants', 'Vegetable'),
  (id_cauliflower, NULL, 'Cauliflower', 'Plants', 'Vegetable'),
  (id_kidney_beans, NULL, 'Kidney Beans', 'Plants', 'Legume'),
  (id_pinto_beans, NULL, 'Pinto Beans', 'Plants', 'Legume'),
  (id_tofu, NULL, 'Tofu (firm)', 'Plants', 'Soy'),
  (id_tempeh, NULL, 'Tempeh', 'Plants', 'Soy'),
  (id_beets, NULL, 'Beets', 'Plants', 'Vegetable'),
  (id_sweet_peas, NULL, 'Sugar Snap Peas', 'Plants', 'Vegetable'),
  (id_artichoke, NULL, 'Artichoke Heart', 'Plants', 'Vegetable'),
  (id_leek, NULL, 'Leek', 'Plants', 'Vegetable'),
  (id_watermelon, NULL, 'Watermelon', 'Plants', 'Fruit'),
  (id_peach, NULL, 'Peach', 'Plants', 'Fruit'),
  (id_pear, NULL, 'Pear', 'Plants', 'Fruit'),
  (id_kiwi, NULL, 'Kiwi', 'Plants', 'Fruit'),
  (id_cherry, NULL, 'Cherries', 'Plants', 'Fruit'),
  (id_pomegranate, NULL, 'Pomegranate Seeds', 'Plants', 'Fruit'),
  (id_grapefruit, NULL, 'Grapefruit', 'Plants', 'Fruit');

INSERT INTO food_item_servings (food_item_id, label, calories, fat, carbs, protein, fiber, is_default, sort_order) VALUES
  (id_bell_pepper, '1 medium', 31, 0.3, 7.6, 1, 2.5, true, 0),
  (id_onion, '1/2 cup chopped', 32, 0.1, 7.5, 0.7, 1.4, true, 0),
  (id_broccoli, '1 cup chopped', 31, 0.3, 6, 2.6, 2.4, true, 0),
  (id_spinach, '2 cups raw', 14, 0.2, 2.2, 1.7, 1.4, true, 0),
  (id_black_beans, '1/2 cup cooked', 114, 0.5, 20, 7.6, 7.5, true, 0),
  (id_black_beans, '1 can (15 oz)', 350, 1.5, 62, 23, 23, false, 1),
  (id_lentils, '1/2 cup cooked', 115, 0.4, 20, 9, 7.8, true, 0),
  (id_chickpeas, '1/2 cup cooked', 135, 2.1, 22, 7.3, 6.2, true, 0),
  (id_chickpeas, '1 can (15 oz)', 350, 5.5, 57, 19, 16, false, 1),
  (id_green_beans, '1 cup', 31, 0.1, 7, 1.8, 2.7, true, 0),
  (id_apple, '1 medium', 95, 0.3, 25, 0.5, 4.4, true, 0),
  (id_banana, '1 medium', 105, 0.4, 27, 1.3, 3.1, true, 0),
  (id_strawberries, '1 cup', 49, 0.5, 12, 1, 3, true, 0),
  (id_avocado, '1/2 avocado', 120, 11, 6.4, 1.5, 5, true, 0),
  (id_avocado, '1 whole avocado', 240, 22, 12.8, 3, 10, false, 1),
  (id_edamame, '1/2 cup shelled', 94, 4, 7.6, 9.2, 4, true, 0),
  (id_tomato, '1 medium', 22, 0.2, 4.8, 1.1, 1.5, true, 0),
  (id_cucumber, '1 cup sliced', 16, 0.1, 3.8, 0.7, 0.5, true, 0),
  (id_romaine, '2 cups chopped', 16, 0.3, 2.8, 1.2, 1.9, true, 0),
  (id_kale, '1 cup raw', 33, 0.5, 6.7, 2.2, 1.3, true, 0),
  (id_blueberries, '1 cup', 84, 0.5, 21, 1.1, 3.6, true, 0),
  (id_orange, '1 medium', 62, 0.2, 15, 1.2, 3.1, true, 0),
  (id_grapes, '1 cup', 104, 0.2, 27, 1.1, 1.4, true, 0),
  (id_mango, '1 cup cubed', 99, 0.6, 25, 1.4, 2.6, true, 0),
  (id_pineapple, '1 cup chunks', 82, 0.2, 22, 0.9, 2.3, true, 0),
  (id_celery, '2 stalks', 14, 0.2, 3, 0.7, 1.6, true, 0),
  (id_carrot, '1 medium', 25, 0.1, 5.8, 0.6, 1.7, true, 0),
  (id_garlic, '1 clove', 5, 0, 1, 0.2, 0.1, true, 0),
  (id_mushrooms, '1 cup sliced', 15, 0.2, 2.3, 2.2, 0.7, true, 0),
  (id_zucchini, '1 cup sliced', 21, 0.4, 3.9, 1.5, 1.2, true, 0),
  (id_asparagus, '5 spears', 17, 0.2, 3.2, 1.9, 1.7, true, 0),
  (id_brussels_sprouts, '1 cup', 38, 0.3, 8, 3, 3.3, true, 0),
  (id_cauliflower, '1 cup chopped', 27, 0.3, 5.3, 2.1, 2.5, true, 0),
  (id_kidney_beans, '1/2 cup cooked', 112, 0.4, 20, 7.7, 5.8, true, 0),
  (id_pinto_beans, '1/2 cup cooked', 123, 0.4, 22, 7.7, 7.7, true, 0),
  (id_tofu, '4 oz', 86, 5, 2.2, 9, 0.3, true, 0),
  (id_tempeh, '4 oz', 218, 12, 10, 22, 0, true, 0),
  (id_beets, '1/2 cup sliced', 37, 0.2, 8.5, 1.4, 1.7, true, 0),
  (id_sweet_peas, '1 cup', 41, 0.2, 7.4, 2.7, 2.5, true, 0),
  (id_artichoke, '1/2 cup hearts', 45, 0.3, 10, 2.4, 4.8, true, 0),
  (id_leek, '1/2 cup chopped', 27, 0.1, 6.3, 0.7, 0.9, true, 0),
  (id_watermelon, '2 cups cubed', 91, 0.5, 23, 1.9, 1.1, true, 0),
  (id_peach, '1 medium', 58, 0.4, 14, 1.4, 2.3, true, 0),
  (id_pear, '1 medium', 101, 0.2, 27, 0.6, 5.5, true, 0),
  (id_kiwi, '1 medium', 42, 0.4, 10, 0.8, 2.1, true, 0),
  (id_cherry, '1 cup', 87, 0.3, 22, 1.5, 2.9, true, 0),
  (id_pomegranate, '1/2 cup seeds', 72, 1, 16, 1.5, 3.5, true, 0),
  (id_grapefruit, '1/2 fruit', 52, 0.2, 13, 1, 2, true, 0);

-- ============ MISC / FATS ============
INSERT INTO food_items (id, owner_id, name, category, sub_category) VALUES
  (id_evoo, NULL, 'Olive Oil (EVOO)', 'Misc', 'Oil'),
  (id_coconut_oil, NULL, 'Coconut Oil', 'Misc', 'Oil'),
  (id_mayo, NULL, 'Mayonnaise', 'Misc', 'Condiment'),
  (id_peanut_butter, NULL, 'Peanut Butter', 'Misc', 'Nut Butter'),
  (id_almonds, NULL, 'Almonds', 'Misc', 'Nuts'),
  (id_peanuts, NULL, 'Peanuts', 'Misc', 'Nuts'),
  (id_cashews, NULL, 'Cashews', 'Misc', 'Nuts'),
  (id_walnuts, NULL, 'Walnuts', 'Misc', 'Nuts'),
  (id_coconut_milk, NULL, 'Coconut Milk', 'Misc', 'Other'),
  (id_fish_oil, NULL, 'Fish Oil', 'Misc', 'Supplement'),
  (id_dark_chocolate, NULL, 'Dark Chocolate (70%+)', 'Misc', 'Snack'),
  (id_almond_butter, NULL, 'Almond Butter', 'Misc', 'Nut Butter'),
  (id_sunflower_seeds, NULL, 'Sunflower Seeds', 'Misc', 'Seeds'),
  (id_chia_seeds, NULL, 'Chia Seeds', 'Misc', 'Seeds'),
  (id_flaxseeds, NULL, 'Flaxseeds (ground)', 'Misc', 'Seeds'),
  (id_hemp_seeds, NULL, 'Hemp Seeds', 'Misc', 'Seeds'),
  (id_macadamia, NULL, 'Macadamia Nuts', 'Misc', 'Nuts'),
  (id_pecans, NULL, 'Pecans', 'Misc', 'Nuts'),
  (id_pistachios, NULL, 'Pistachios', 'Misc', 'Nuts'),
  (id_olive, NULL, 'Olives (Kalamata)', 'Misc', 'Other');

INSERT INTO food_item_servings (food_item_id, label, calories, fat, carbs, protein, fiber, is_default, sort_order) VALUES
  (id_evoo, '1 tbsp', 119, 13.5, 0, 0, 0, true, 0),
  (id_coconut_oil, '1 tbsp', 117, 13.6, 0, 0, 0, true, 0),
  (id_mayo, '1 tbsp', 94, 10, 0.1, 0.1, 0, true, 0),
  (id_peanut_butter, '2 tbsp', 188, 16, 7, 7.7, 1.8, true, 0),
  (id_almonds, '1 oz (23 almonds)', 164, 14, 6, 6, 3.5, true, 0),
  (id_peanuts, '1 oz', 161, 14, 5, 7.3, 2.4, true, 0),
  (id_cashews, '1 oz', 157, 12, 9, 5.2, 0.9, true, 0),
  (id_walnuts, '1 oz (14 halves)', 185, 18.5, 3.9, 4.3, 1.9, true, 0),
  (id_coconut_milk, '1/3 cup', 150, 15, 3, 1.5, 0, true, 0),
  (id_coconut_milk, '1 can (13.5 oz)', 600, 60, 12, 6, 0, false, 1),
  (id_fish_oil, '1 softgel (1g)', 9, 1, 0, 0, 0, true, 0),
  (id_dark_chocolate, '1 oz', 170, 12, 13, 2, 2, true, 0),
  (id_almond_butter, '2 tbsp', 196, 18, 6, 6.7, 3.3, true, 0),
  (id_sunflower_seeds, '1 oz', 166, 14, 5.5, 5.8, 2.6, true, 0),
  (id_chia_seeds, '2 tbsp', 98, 6, 8.4, 3.3, 6.7, true, 0),
  (id_flaxseeds, '2 tbsp', 74, 6, 4, 2.6, 3.8, true, 0),
  (id_hemp_seeds, '3 tbsp', 166, 14.7, 2.6, 9.5, 1.2, true, 0),
  (id_macadamia, '1 oz (10-12 nuts)', 204, 21.5, 3.9, 2.2, 2.4, true, 0),
  (id_pecans, '1 oz (19 halves)', 196, 20, 4, 2.6, 2.7, true, 0),
  (id_pistachios, '1 oz (49 kernels)', 159, 12.9, 8, 5.7, 3, true, 0),
  (id_olive, '5 olives', 25, 2.5, 1, 0.2, 0.5, true, 0);

END $$;
