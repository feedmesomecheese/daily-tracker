-- Add glycemic_index column to food_items
-- GI thresholds: Low < 55, Medium 55–69, High ≥ 70
-- Source: University of Sydney GI database + International GI Table (Atkinson et al., 2008)
-- Only seeded for foods with well-established, published values.

ALTER TABLE food_items ADD COLUMN IF NOT EXISTS glycemic_index INTEGER;

-- ── Grains ────────────────────────────────────────────────────────────────────
UPDATE food_items SET glycemic_index = 55  WHERE name = 'Oatmeal (dry)'          AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 73  WHERE name = 'White Rice (cooked)'     AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 68  WHERE name = 'Brown Rice (cooked)'     AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 69  WHERE name = 'Whole Wheat Bread'       AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 30  WHERE name = 'Whole Wheat Tortilla'    AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 57  WHERE name = 'Whole Wheat Pita'        AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 49  WHERE name = 'Pasta (cooked)'          AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 72  WHERE name = 'Bagel (plain)'           AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 44  WHERE name = 'Sweet Potato'            AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 78  WHERE name = 'Potato (white)'          AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 53  WHERE name = 'Quinoa (cooked)'         AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 46  WHERE name = 'Corn Tortilla'           AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 75  WHERE name = 'White Bread'             AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 77  WHERE name = 'English Muffin'          AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 66  WHERE name = 'Cream of Wheat (cooked)' AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 82  WHERE name = 'Rice Cake'               AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 55  WHERE name = 'Corn (kernels)'          AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 51  WHERE name = 'Green Peas'              AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 51  WHERE name = 'Butternut Squash'        AND owner_id IS NULL;
-- Granola omitted — GI varies widely by brand/recipe (25–65+)

-- ── Dairy ─────────────────────────────────────────────────────────────────────
UPDATE food_items SET glycemic_index = 27  WHERE name = 'Milk 2%'                 AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 31  WHERE name = 'Milk (whole)'            AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 32  WHERE name = 'Milk (skim)'             AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 11  WHERE name = 'Greek Yogurt (nonfat)'   AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 11  WHERE name = 'Greek Yogurt (full fat)' AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 10  WHERE name = 'Cottage Cheese 4%'       AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 10  WHERE name = 'Cottage Cheese (fat-free)' AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 17  WHERE name = 'Kefir'                   AND owner_id IS NULL;

-- ── Plants — Fruits ───────────────────────────────────────────────────────────
UPDATE food_items SET glycemic_index = 38  WHERE name = 'Apple'                   AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 51  WHERE name = 'Banana'                  AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 40  WHERE name = 'Strawberries'            AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 53  WHERE name = 'Blueberries'             AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 45  WHERE name = 'Orange'                  AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 59  WHERE name = 'Grapes'                  AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 55  WHERE name = 'Mango'                   AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 59  WHERE name = 'Pineapple'               AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 76  WHERE name = 'Watermelon'              AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 42  WHERE name = 'Peach'                   AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 38  WHERE name = 'Pear'                    AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 52  WHERE name = 'Kiwi'                    AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 22  WHERE name = 'Cherries'                AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 35  WHERE name = 'Pomegranate Seeds'       AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 25  WHERE name = 'Grapefruit'              AND owner_id IS NULL;

-- ── Plants — Legumes ──────────────────────────────────────────────────────────
UPDATE food_items SET glycemic_index = 30  WHERE name = 'Black Beans'             AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 32  WHERE name = 'Lentils (cooked)'        AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 28  WHERE name = 'Chickpeas'               AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 29  WHERE name = 'Kidney Beans'            AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 39  WHERE name = 'Pinto Beans'             AND owner_id IS NULL;

-- ── Plants — Vegetables (notable GI only) ────────────────────────────────────
UPDATE food_items SET glycemic_index = 64  WHERE name = 'Beets'                   AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 35  WHERE name = 'Carrot'                  AND owner_id IS NULL;
-- Low-GI vegetables (broccoli, spinach, kale, etc.) omitted — GI < 15, not clinically meaningful

-- ── Misc ──────────────────────────────────────────────────────────────────────
UPDATE food_items SET glycemic_index = 14  WHERE name = 'Peanut Butter'           AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 14  WHERE name = 'Peanuts'                 AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 27  WHERE name = 'Cashews'                 AND owner_id IS NULL;
UPDATE food_items SET glycemic_index = 23  WHERE name = 'Dark Chocolate (70%+)'   AND owner_id IS NULL;
