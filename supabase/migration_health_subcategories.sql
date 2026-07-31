-- Adds Mental Health & Therapy / Doctor & Medical Visits / Prescriptions &
-- Pharmacy / Dental / Vision sub-categories under "Health & Medications"
-- (previously a standalone leaf category with no sub-categories).
-- Safe to run multiple times: insert uses ON CONFLICT (name) DO NOTHING.

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Mental Health & Therapy', '#EF4444', '🧠', false, 1, id FROM categories WHERE name = 'Health & Medications'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Doctor & Medical Visits', '#EF4444', '👨‍⚕️', false, 2, id FROM categories WHERE name = 'Health & Medications'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Prescriptions & Pharmacy', '#EF4444', '💊', false, 3, id FROM categories WHERE name = 'Health & Medications'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Dental', '#EF4444', '🦷', false, 4, id FROM categories WHERE name = 'Health & Medications'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Vision', '#EF4444', '👁️', false, 5, id FROM categories WHERE name = 'Health & Medications'
ON CONFLICT (name) DO NOTHING;
