-- Assign parent_id to user-created subcategories that were created without one.
-- Safe to run multiple times (UPDATE is idempotent for these names).

UPDATE categories SET parent_id = (SELECT id FROM categories WHERE name = 'Restaurants' AND parent_id IS NULL)
WHERE name = 'Bakeries & Cafés';

UPDATE categories SET parent_id = (SELECT id FROM categories WHERE name = 'Restaurants' AND parent_id IS NULL)
WHERE name = 'Bar Drinks';

UPDATE categories SET parent_id = (SELECT id FROM categories WHERE name = 'Restaurants' AND parent_id IS NULL)
WHERE name = 'Bars & Drink';

UPDATE categories SET parent_id = (SELECT id FROM categories WHERE name = 'Shopping' AND parent_id IS NULL)
WHERE name = 'Clothing';

UPDATE categories SET parent_id = (SELECT id FROM categories WHERE name = 'Health & Fitness' AND parent_id IS NULL)
WHERE name = 'Health & Medications';

UPDATE categories SET parent_id = (SELECT id FROM categories WHERE name = 'Rent & Housing' AND parent_id IS NULL)
WHERE name = 'Household & Cleaning';

-- Banking Fees and Cash & ATM are left as top-level — assign manually if needed.
