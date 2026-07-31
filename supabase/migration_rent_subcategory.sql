-- Adds a "Rent" sub-category under "Rent & Housing" for the actual rent
-- payment itself, alongside the existing Household & Cleaning / Home
-- Improvement / Furniture & Decor / Laundry sub-categories.
-- Safe to run multiple times: insert uses ON CONFLICT (name) DO NOTHING.

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Rent', '#EF4444', '🔑', false, 1, id FROM categories WHERE name = 'Rent & Housing'
ON CONFLICT (name) DO NOTHING;
