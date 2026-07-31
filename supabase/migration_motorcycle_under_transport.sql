-- Moves "Motorcycle" (and its existing sub-categories: Improvements,
-- Repairs, Gear & Apparel, Registration & Fees) from a standalone
-- top-level category to live under "Transport" instead.
--
-- The app's category model only supports one level of nesting (only
-- top-level categories can be a "parent" — see CategoryManager.tsx's
-- parent picker, which filters to `!c.parent_id`), so this flattens
-- Motorcycle's own children to be direct Transport sub-categories too,
-- as siblings of Motorcycle itself, rather than trying to nest three
-- levels deep. No transactions move — category_id on transactions is
-- untouched; only these categories' parent_id/color/sort_order change.
-- Safe to run multiple times (plain UPDATEs, idempotent).

UPDATE categories
SET parent_id = (SELECT id FROM categories WHERE name = 'Transport' AND parent_id IS NULL),
    color = '#3B82F6',
    sort_order = 45
WHERE name = 'Motorcycle' AND parent_id IS NULL;

UPDATE categories
SET parent_id = (SELECT id FROM categories WHERE name = 'Transport' AND parent_id IS NULL),
    color = '#3B82F6',
    sort_order = 46
WHERE name = 'Improvements';

UPDATE categories
SET parent_id = (SELECT id FROM categories WHERE name = 'Transport' AND parent_id IS NULL),
    color = '#3B82F6',
    sort_order = 47
WHERE name = 'Repairs';

UPDATE categories
SET parent_id = (SELECT id FROM categories WHERE name = 'Transport' AND parent_id IS NULL),
    color = '#3B82F6',
    sort_order = 48
WHERE name = 'Gear & Apparel';

UPDATE categories
SET parent_id = (SELECT id FROM categories WHERE name = 'Transport' AND parent_id IS NULL),
    color = '#3B82F6',
    sort_order = 49
WHERE name = 'Registration & Fees';
