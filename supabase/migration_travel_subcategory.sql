-- Adds a "Cruises & Ferries" sub-category under "Travel", alongside the
-- existing Flights / Hotels & Lodging / Car Rental / Activities & Tours /
-- Train & Rail.
-- Safe to run multiple times: insert uses ON CONFLICT (name) DO NOTHING.

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Cruises & Ferries', '#06B6D4', '🚢', false, 86, id FROM categories WHERE name = 'Travel'
ON CONFLICT (name) DO NOTHING;
