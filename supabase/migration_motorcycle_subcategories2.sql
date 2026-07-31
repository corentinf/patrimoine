-- Adds "Gear & Apparel" and "Registration & Fees" sub-categories under
-- "Motorcycle", alongside the existing Improvements / Repairs.
-- Safe to run multiple times: insert uses ON CONFLICT (name) DO NOTHING.

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Gear & Apparel', '#6366F1', '🧰', false, 3, id FROM categories WHERE name = 'Motorcycle'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Registration & Fees', '#6366F1', '🪪', false, 4, id FROM categories WHERE name = 'Motorcycle'
ON CONFLICT (name) DO NOTHING;
