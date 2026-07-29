-- Reorganize "Restaurants & Dining" into a "Food & Drink" umbrella, folding
-- the standalone "Bakeries & Cafés" and "Bars & Drink" top-level categories
-- into it as sub-categories (alongside new Coffee & Tea / Pastries), plus a
-- couple of unrelated subcategory additions requested alongside this reorg.
-- Safe to run multiple times: updates are idempotent by id/name, inserts use
-- ON CONFLICT (name) DO NOTHING.

-- Rename the umbrella category itself (same row/id, existing transactions
-- categorized directly under it are unaffected).
UPDATE categories SET name = 'Food & Drink' WHERE name = 'Restaurants & Dining';

-- Fold former top-level categories into it as sub-categories, matching its color.
UPDATE categories
SET parent_id = (SELECT id FROM categories WHERE name = 'Food & Drink'),
    color = '#F97316',
    sort_order = 31
WHERE name = 'Bakeries & Cafés';

UPDATE categories
SET parent_id = (SELECT id FROM categories WHERE name = 'Food & Drink'),
    color = '#F97316',
    sort_order = 32
WHERE name = 'Bars & Drink';

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Coffee & Tea', '#F97316', '☕', false, 36, id FROM categories WHERE name = 'Food & Drink'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Pastries', '#F97316', '🥐', false, 39, id FROM categories WHERE name = 'Food & Drink'
ON CONFLICT (name) DO NOTHING;

-- Motorcycle
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Improvements', '#6366F1', '🔧', false, 1, id FROM categories WHERE name = 'Motorcycle'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Repairs', '#6366F1', '🛠️', false, 2, id FROM categories WHERE name = 'Motorcycle'
ON CONFLICT (name) DO NOTHING;

-- Travel — matches the name/icon already staged (unapplied) in
-- migration_subcategories_expanded.sql for consistency.
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Train & Rail', '#06B6D4', '🚂', false, 85, id FROM categories WHERE name = 'Travel'
ON CONFLICT (name) DO NOTHING;
