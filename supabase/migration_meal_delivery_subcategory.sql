-- Adds a "Meal Delivery" sub-category under "Food & Drink" for delivery-app
-- orders (DoorDash, Uber Eats, etc.) as a distinct bucket from generic
-- "Restaurants" dine-out spend.
-- Safe to run multiple times: insert uses ON CONFLICT (name) DO NOTHING.

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Meal Delivery', '#F97316', '🍱', false, 35, id FROM categories WHERE name = 'Food & Drink'
ON CONFLICT (name) DO NOTHING;
