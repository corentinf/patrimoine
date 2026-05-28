-- Expanded subcategories for all parent categories
-- Safe to run multiple times (ON CONFLICT DO NOTHING)
-- Parent lookups use both original seed names and common user-renamed variants.

-- ── Transport ────────────────────────────────────────────────────────────────
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Tolls', '#3B82F6', '🛣️', false, 45, id FROM categories WHERE name = 'Transport'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Auto Repair', '#3B82F6', '🔧', false, 46, id FROM categories WHERE name = 'Transport'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Car Wash', '#3B82F6', '🚿', false, 47, id FROM categories WHERE name = 'Transport'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'EV Charging', '#3B82F6', '⚡', false, 48, id FROM categories WHERE name = 'Transport'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Taxis & Limos', '#3B82F6', '🚖', false, 49, id FROM categories WHERE name = 'Transport'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Bicycle & Scooter', '#3B82F6', '🚲', false, 50, id FROM categories WHERE name = 'Transport'
ON CONFLICT (name) DO NOTHING;

-- ── Travel ───────────────────────────────────────────────────────────────────
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Train & Rail', '#06B6D4', '🚂', false, 85, id FROM categories WHERE name = 'Travel'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Cruise & Ferry', '#06B6D4', '🚢', false, 86, id FROM categories WHERE name = 'Travel'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Hostel & Camping', '#06B6D4', '⛺', false, 87, id FROM categories WHERE name = 'Travel'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Travel Insurance', '#06B6D4', '🛡️', false, 88, id FROM categories WHERE name = 'Travel'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Airport Transfers', '#06B6D4', '🚌', false, 89, id FROM categories WHERE name = 'Travel'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Luggage & Gear', '#06B6D4', '🧳', false, 90, id FROM categories WHERE name = 'Travel'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Visa & Entry Fees', '#06B6D4', '🛂', false, 91, id FROM categories WHERE name = 'Travel'
ON CONFLICT (name) DO NOTHING;

-- ── Health & Fitness (also tries "Fitness" for renamed variants) ──────────────
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Nutrition & Supplements', '#10B981', '🥗', false, 54, id FROM categories WHERE name = 'Health & Fitness'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Nutrition & Supplements', '#10B981', '🥗', false, 54, id FROM categories WHERE name = 'Fitness'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Sports Gear', '#10B981', '⚽', false, 55, id FROM categories WHERE name = 'Health & Fitness'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Sports Gear', '#10B981', '⚽', false, 55, id FROM categories WHERE name = 'Fitness'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Yoga & Meditation', '#10B981', '🧘', false, 56, id FROM categories WHERE name = 'Health & Fitness'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Yoga & Meditation', '#10B981', '🧘', false, 56, id FROM categories WHERE name = 'Fitness'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Personal Trainer', '#10B981', '💪', false, 57, id FROM categories WHERE name = 'Health & Fitness'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Personal Trainer', '#10B981', '💪', false, 57, id FROM categories WHERE name = 'Fitness'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Mental Health', '#10B981', '🧠', false, 58, id FROM categories WHERE name = 'Health & Fitness'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Mental Health', '#10B981', '🧠', false, 58, id FROM categories WHERE name = 'Fitness'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Running & Cycling', '#10B981', '🚴', false, 59, id FROM categories WHERE name = 'Health & Fitness'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Running & Cycling', '#10B981', '🚴', false, 59, id FROM categories WHERE name = 'Fitness'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Swimming & Water Sports', '#10B981', '🏊', false, 60, id FROM categories WHERE name = 'Health & Fitness'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Swimming & Water Sports', '#10B981', '🏊', false, 60, id FROM categories WHERE name = 'Fitness'
ON CONFLICT (name) DO NOTHING;

-- ── Restaurants (also tries "Restaurants & Dining") ───────────────────────────
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Fine Dining', '#F97316', '🍷', false, 34, id FROM categories WHERE name = 'Restaurants'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Fine Dining', '#F97316', '🍷', false, 34, id FROM categories WHERE name = 'Restaurants & Dining'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Food Delivery', '#F97316', '🛵', false, 35, id FROM categories WHERE name = 'Restaurants'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Food Delivery', '#F97316', '🛵', false, 35, id FROM categories WHERE name = 'Restaurants & Dining'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Coffee & Tea', '#F97316', '☕', false, 36, id FROM categories WHERE name = 'Restaurants'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Coffee & Tea', '#F97316', '☕', false, 36, id FROM categories WHERE name = 'Restaurants & Dining'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Desserts & Ice Cream', '#F97316', '🍦', false, 37, id FROM categories WHERE name = 'Restaurants'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Desserts & Ice Cream', '#F97316', '🍦', false, 37, id FROM categories WHERE name = 'Restaurants & Dining'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Brunch', '#F97316', '🥞', false, 38, id FROM categories WHERE name = 'Restaurants'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Brunch', '#F97316', '🥞', false, 38, id FROM categories WHERE name = 'Restaurants & Dining'
ON CONFLICT (name) DO NOTHING;

-- ── Groceries ────────────────────────────────────────────────────────────────
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Organic & Health Food', '#F59E0B', '🌿', false, 24, id FROM categories WHERE name = 'Groceries'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Meat & Seafood', '#F59E0B', '🥩', false, 25, id FROM categories WHERE name = 'Groceries'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Dairy & Eggs', '#F59E0B', '🥚', false, 26, id FROM categories WHERE name = 'Groceries'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Snacks & Beverages', '#F59E0B', '🍫', false, 27, id FROM categories WHERE name = 'Groceries'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Frozen & Prepared Foods', '#F59E0B', '🧊', false, 28, id FROM categories WHERE name = 'Groceries'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'International & Specialty', '#F59E0B', '🌍', false, 29, id FROM categories WHERE name = 'Groceries'
ON CONFLICT (name) DO NOTHING;

-- ── Entertainment ─────────────────────────────────────────────────────────────
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Concerts & Music Events', '#EC4899', '🎤', false, 74, id FROM categories WHERE name = 'Entertainment'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Sports Events', '#EC4899', '🏟️', false, 75, id FROM categories WHERE name = 'Entertainment'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Theater & Arts', '#EC4899', '🎭', false, 76, id FROM categories WHERE name = 'Entertainment'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Hobbies & Crafts', '#EC4899', '🎨', false, 77, id FROM categories WHERE name = 'Entertainment'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Books & Audiobooks', '#EC4899', '📖', false, 78, id FROM categories WHERE name = 'Entertainment'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Amusement & Theme Parks', '#EC4899', '🎢', false, 79, id FROM categories WHERE name = 'Entertainment'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Gambling & Lottery', '#EC4899', '🎲', false, 80, id FROM categories WHERE name = 'Entertainment'
ON CONFLICT (name) DO NOTHING;

-- ── Shopping ─────────────────────────────────────────────────────────────────
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Shoes & Accessories', '#8B5CF6', '👟', false, 64, id FROM categories WHERE name = 'Shopping'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Jewelry & Watches', '#8B5CF6', '⌚', false, 65, id FROM categories WHERE name = 'Shopping'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Kids & Baby', '#8B5CF6', '👶', false, 66, id FROM categories WHERE name = 'Shopping'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Pet Supplies', '#8B5CF6', '🐾', false, 67, id FROM categories WHERE name = 'Shopping'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Outdoor & Camping', '#8B5CF6', '🏕️', false, 68, id FROM categories WHERE name = 'Shopping'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Office & Stationery', '#8B5CF6', '📎', false, 69, id FROM categories WHERE name = 'Shopping'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Thrift & Vintage', '#8B5CF6', '🛍️', false, 70, id FROM categories WHERE name = 'Shopping'
ON CONFLICT (name) DO NOTHING;

-- ── Subscriptions ─────────────────────────────────────────────────────────────
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Streaming Video', '#6366F1', '📺', false, 94, id FROM categories WHERE name = 'Subscriptions'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Cloud Storage', '#6366F1', '☁️', false, 95, id FROM categories WHERE name = 'Subscriptions'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Gaming Subscriptions', '#6366F1', '🎮', false, 96, id FROM categories WHERE name = 'Subscriptions'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Fitness Apps', '#6366F1', '🏃', false, 97, id FROM categories WHERE name = 'Subscriptions'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Security & VPN', '#6366F1', '🔒', false, 98, id FROM categories WHERE name = 'Subscriptions'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Dating Apps', '#6366F1', '💝', false, 99, id FROM categories WHERE name = 'Subscriptions'
ON CONFLICT (name) DO NOTHING;

-- ── Utilities ─────────────────────────────────────────────────────────────────
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Natural Gas', '#78716C', '🔥', false, 105, id FROM categories WHERE name = 'Utilities'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Heating & Cooling', '#78716C', '❄️', false, 106, id FROM categories WHERE name = 'Utilities'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Solar & Renewable', '#78716C', '🌞', false, 107, id FROM categories WHERE name = 'Utilities'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Storage Unit', '#78716C', '📦', false, 108, id FROM categories WHERE name = 'Utilities'
ON CONFLICT (name) DO NOTHING;

-- ── Insurance ─────────────────────────────────────────────────────────────────
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Life Insurance', '#64748B', '💼', false, 114, id FROM categories WHERE name = 'Insurance'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Renters Insurance', '#64748B', '🏠', false, 115, id FROM categories WHERE name = 'Insurance'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Pet Insurance', '#64748B', '🐾', false, 116, id FROM categories WHERE name = 'Insurance'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Dental Insurance', '#64748B', '🦷', false, 117, id FROM categories WHERE name = 'Insurance'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Vision Insurance', '#64748B', '👓', false, 118, id FROM categories WHERE name = 'Insurance'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Disability Insurance', '#64748B', '🛡️', false, 119, id FROM categories WHERE name = 'Insurance'
ON CONFLICT (name) DO NOTHING;

-- ── Education ─────────────────────────────────────────────────────────────────
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Student Loans', '#14B8A6', '💳', false, 124, id FROM categories WHERE name = 'Education'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Tutoring', '#14B8A6', '👨‍🏫', false, 125, id FROM categories WHERE name = 'Education'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Test Prep & Exams', '#14B8A6', '📝', false, 126, id FROM categories WHERE name = 'Education'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Language Learning', '#14B8A6', '🌍', false, 127, id FROM categories WHERE name = 'Education'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Kids Education', '#14B8A6', '🎒', false, 128, id FROM categories WHERE name = 'Education'
ON CONFLICT (name) DO NOTHING;

-- ── Gifts & Donations ─────────────────────────────────────────────────────────
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Birthday & Holiday Gifts', '#A855F7', '🎂', false, 134, id FROM categories WHERE name = 'Gifts & Donations'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Wedding & Baby Gifts', '#A855F7', '💍', false, 135, id FROM categories WHERE name = 'Gifts & Donations'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Religious Donations', '#A855F7', '⛪', false, 136, id FROM categories WHERE name = 'Gifts & Donations'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Crowdfunding', '#A855F7', '💝', false, 137, id FROM categories WHERE name = 'Gifts & Donations'
ON CONFLICT (name) DO NOTHING;

-- ── Personal Care ─────────────────────────────────────────────────────────────
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Dental Care', '#F472B6', '🦷', false, 144, id FROM categories WHERE name = 'Personal Care'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Vision & Eyewear', '#F472B6', '👓', false, 145, id FROM categories WHERE name = 'Personal Care'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Nail Care', '#F472B6', '💅', false, 146, id FROM categories WHERE name = 'Personal Care'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Therapy & Counseling', '#F472B6', '🧠', false, 147, id FROM categories WHERE name = 'Personal Care'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Vitamins & Wellness', '#F472B6', '💊', false, 148, id FROM categories WHERE name = 'Personal Care'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Fragrances & Beauty', '#F472B6', '🌸', false, 149, id FROM categories WHERE name = 'Personal Care'
ON CONFLICT (name) DO NOTHING;

-- ── Rent & Housing ────────────────────────────────────────────────────────────
INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Rent & Mortgage', '#EF4444', '🏠', false, 13, id FROM categories WHERE name = 'Rent & Housing'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'HOA Fees', '#EF4444', '🏘️', false, 14, id FROM categories WHERE name = 'Rent & Housing'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Cleaning Services', '#EF4444', '🧹', false, 15, id FROM categories WHERE name = 'Rent & Housing'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Garden & Lawn', '#EF4444', '🌿', false, 16, id FROM categories WHERE name = 'Rent & Housing'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Security & Alarms', '#EF4444', '🔒', false, 17, id FROM categories WHERE name = 'Rent & Housing'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Appliances', '#EF4444', '🏷️', false, 18, id FROM categories WHERE name = 'Rent & Housing'
ON CONFLICT (name) DO NOTHING;

INSERT INTO categories (name, color, icon, is_income, sort_order, parent_id)
SELECT 'Moving & Storage', '#EF4444', '📦', false, 19, id FROM categories WHERE name = 'Rent & Housing'
ON CONFLICT (name) DO NOTHING;
