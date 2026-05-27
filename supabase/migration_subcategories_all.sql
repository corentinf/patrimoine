-- Subcategories for all remaining parent categories
-- Safe to run multiple times (ON CONFLICT DO NOTHING)

-- Travel
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Flights', '#06B6D4', '✈️', false, 81, id FROM categories WHERE name = 'Travel'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Hotels & Lodging', '#06B6D4', '🏨', false, 82, id FROM categories WHERE name = 'Travel'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Car Rental', '#06B6D4', '🚙', false, 83, id FROM categories WHERE name = 'Travel'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Activities & Tours', '#06B6D4', '🎡', false, 84, id FROM categories WHERE name = 'Travel'
ON CONFLICT (name) DO NOTHING;

-- Groceries
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Supermarket', '#F59E0B', '🛒', false, 21, id FROM categories WHERE name = 'Groceries'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Farmers Market', '#F59E0B', '🌽', false, 22, id FROM categories WHERE name = 'Groceries'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Alcohol & Wine', '#F59E0B', '🍷', false, 23, id FROM categories WHERE name = 'Groceries'
ON CONFLICT (name) DO NOTHING;

-- Subscriptions
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Software & Apps', '#6366F1', '💻', false, 91, id FROM categories WHERE name = 'Subscriptions'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'News & Magazines', '#6366F1', '📰', false, 92, id FROM categories WHERE name = 'Subscriptions'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Music', '#6366F1', '🎵', false, 93, id FROM categories WHERE name = 'Subscriptions'
ON CONFLICT (name) DO NOTHING;

-- Utilities
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Electric', '#78716C', '⚡', false, 101, id FROM categories WHERE name = 'Utilities'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Internet & Cable', '#78716C', '🌐', false, 102, id FROM categories WHERE name = 'Utilities'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Phone', '#78716C', '📱', false, 103, id FROM categories WHERE name = 'Utilities'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Water & Trash', '#78716C', '💧', false, 104, id FROM categories WHERE name = 'Utilities'
ON CONFLICT (name) DO NOTHING;

-- Insurance
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Health Insurance', '#64748B', '🏥', false, 111, id FROM categories WHERE name = 'Insurance'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Auto Insurance', '#64748B', '🚗', false, 112, id FROM categories WHERE name = 'Insurance'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Home Insurance', '#64748B', '🏠', false, 113, id FROM categories WHERE name = 'Insurance'
ON CONFLICT (name) DO NOTHING;

-- Education
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Tuition & Fees', '#14B8A6', '🎓', false, 121, id FROM categories WHERE name = 'Education'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Books & Supplies', '#14B8A6', '📚', false, 122, id FROM categories WHERE name = 'Education'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Online Courses', '#14B8A6', '🖥️', false, 123, id FROM categories WHERE name = 'Education'
ON CONFLICT (name) DO NOTHING;

-- Gifts & Donations
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Gifts', '#A855F7', '🎁', false, 131, id FROM categories WHERE name = 'Gifts & Donations'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Charity & Donations', '#A855F7', '💝', false, 132, id FROM categories WHERE name = 'Gifts & Donations'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Tips', '#A855F7', '💰', false, 133, id FROM categories WHERE name = 'Gifts & Donations'
ON CONFLICT (name) DO NOTHING;

-- Personal Care
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Haircut & Grooming', '#F472B6', '💇', false, 141, id FROM categories WHERE name = 'Personal Care'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Spa & Massage', '#F472B6', '💆', false, 142, id FROM categories WHERE name = 'Personal Care'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Cosmetics & Skincare', '#F472B6', '💄', false, 143, id FROM categories WHERE name = 'Personal Care'
ON CONFLICT (name) DO NOTHING;
