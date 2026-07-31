-- The "Food & Drink" umbrella category is the old top-level "Restaurants"
-- category, renamed in place (Restaurants -> Restaurants & Dining -> Food &
-- Drink; see migration_food_drink_reorg.sql). Its niche children (Bakeries &
-- Cafés, Bars & Drink, Coffee & Tea, Fine Dining, Food Delivery, etc.)
-- survived the rename, but nothing ever re-added a plain "Restaurants"
-- catch-all for generic dine-out spend that doesn't fit those niches.
-- Safe to run multiple times: insert uses ON CONFLICT (name) DO NOTHING.

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Restaurants', '#F97316', '🍽️', false, 30, id FROM categories WHERE name = 'Food & Drink'
ON CONFLICT (name) DO NOTHING;
