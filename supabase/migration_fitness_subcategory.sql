-- Adds a "Race & Event Fees" sub-category under "Fitness", alongside the
-- existing Gym / Supplement / Gears.
-- Safe to run multiple times: insert uses ON CONFLICT (name) DO NOTHING.

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Race & Event Fees', '#10B981', '🏃', false, 4, id FROM categories WHERE name = 'Fitness'
ON CONFLICT (name) DO NOTHING;
