-- Sub-category defaults
-- Safe to run multiple times (ON CONFLICT DO NOTHING)

-- parent_id column already added via schema.sql line 130

-- Transport
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Gas & Fuel', '#3B82F6', '⛽', false, 41, id FROM categories WHERE name = 'Transport'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Ride Share', '#3B82F6', '🚕', false, 42, id FROM categories WHERE name = 'Transport'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Public Transit', '#3B82F6', '🚌', false, 43, id FROM categories WHERE name = 'Transport'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Parking', '#3B82F6', '🅿️', false, 44, id FROM categories WHERE name = 'Transport'
ON CONFLICT (name) DO NOTHING;

-- Restaurants
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Bakery & Cafe', '#F97316', '☕', false, 31, id FROM categories WHERE name = 'Restaurants'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Fast Food', '#F97316', '🍔', false, 32, id FROM categories WHERE name = 'Restaurants'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Bars & Nightlife', '#F97316', '🍺', false, 33, id FROM categories WHERE name = 'Restaurants'
ON CONFLICT (name) DO NOTHING;

-- Health & Fitness
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Gym & Fitness', '#10B981', '🏋️', false, 51, id FROM categories WHERE name = 'Health & Fitness'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Doctor & Medical', '#10B981', '🏥', false, 52, id FROM categories WHERE name = 'Health & Fitness'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Pharmacy', '#10B981', '💊', false, 53, id FROM categories WHERE name = 'Health & Fitness'
ON CONFLICT (name) DO NOTHING;

-- Shopping
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Clothing', '#8B5CF6', '👕', false, 61, id FROM categories WHERE name = 'Shopping'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Electronics', '#8B5CF6', '💻', false, 62, id FROM categories WHERE name = 'Shopping'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Home Goods', '#8B5CF6', '🛋️', false, 63, id FROM categories WHERE name = 'Shopping'
ON CONFLICT (name) DO NOTHING;

-- Entertainment
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Streaming', '#EC4899', '📺', false, 71, id FROM categories WHERE name = 'Entertainment'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Movies & Events', '#EC4899', '🎭', false, 72, id FROM categories WHERE name = 'Entertainment'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Games', '#EC4899', '🎮', false, 73, id FROM categories WHERE name = 'Entertainment'
ON CONFLICT (name) DO NOTHING;

-- Rent & Housing
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Home Improvement', '#EF4444', '🔨', false, 11, id FROM categories WHERE name = 'Rent & Housing'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Furniture & Decor', '#EF4444', '🪑', false, 12, id FROM categories WHERE name = 'Rent & Housing'
ON CONFLICT (name) DO NOTHING;
