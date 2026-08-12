-- Adds "Fines & Tickets" under Transport (parking/traffic fines, tolls
-- violations, etc.) and "Printing" under Shipping & Delivery (FedEx Office
-- print jobs, distinct from FedEx shipping — same merchant name, different
-- spend). Safe to run multiple times: insert uses ON CONFLICT (name) DO NOTHING.

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Fines & Tickets', '#3B82F6', '🚨', false, 50, id FROM categories WHERE name = 'Transport'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Printing', '#6B7280', '🖨️', false, 1, id FROM categories WHERE name = 'Shipping & Delivery'
ON CONFLICT (name) DO NOTHING;
