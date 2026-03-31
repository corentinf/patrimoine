-- Patrimoine — Supabase schema
-- Run this in your Supabase SQL editor

-- Accounts (checking, savings, credit cards, investment)
create table accounts (
  id text primary key,                    -- SimpleFIN account ID
  name text not null,
  institution text,                       -- e.g. "Chase", "Vanguard"
  institution_domain text,                -- e.g. "chase.com"
  account_type text default 'checking',   -- checking, savings, credit, investment
  currency text default 'USD',
  balance numeric(12,2) default 0,
  available_balance numeric(12,2),
  balance_date timestamptz,
  is_hidden boolean default false,        -- hide closed accounts
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Transactions
create table transactions (
  id text primary key,                    -- SimpleFIN transaction ID
  account_id text references accounts(id) on delete cascade,
  amount numeric(12,2) not null,
  description text,
  payee text,
  memo text,
  posted_at timestamptz not null,
  transacted_at timestamptz,
  category_id uuid references categories(id) on delete set null,
  is_transfer boolean default false,
  created_at timestamptz default now()
);

-- Categories for spending breakdown
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text default '#6B7280',           -- hex color for charts
  icon text,                              -- optional emoji or icon name
  is_income boolean default false,
  sort_order int default 0
);

-- Category rules for auto-categorization
create table category_rules (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete cascade,
  match_field text default 'payee',       -- payee, description, memo
  match_pattern text not null,            -- case-insensitive substring match
  priority int default 0,                 -- higher = checked first
  created_at timestamptz default now()
);

-- Investment holdings (from SimpleFIN)
create table holdings (
  id text primary key,                    -- SimpleFIN holding ID
  account_id text references accounts(id) on delete cascade,
  symbol text,
  description text,
  shares numeric(14,4),
  cost_basis numeric(12,2),
  market_value numeric(12,2),
  purchase_price numeric(12,4),
  currency text default 'USD',
  updated_at timestamptz default now()
);

-- Net worth snapshots (captured daily by cron)
create table networth_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  total_assets numeric(12,2) default 0,
  total_liabilities numeric(12,2) default 0,
  net_worth numeric(12,2) default 0,
  breakdown jsonb,                        -- { "chase_checking": 5000, "vanguard": 50000, ... }
  created_at timestamptz default now()
);

-- Indexes
create index idx_transactions_account on transactions(account_id);
create index idx_transactions_posted on transactions(posted_at desc);
create index idx_transactions_category on transactions(category_id);
create index idx_holdings_account on holdings(account_id);
create index idx_networth_date on networth_snapshots(snapshot_date desc);
create index idx_category_rules_pattern on category_rules(match_pattern);

-- Seed default categories
insert into categories (name, color, icon, is_income, sort_order) values
  ('Rent & Housing',    '#EF4444', '🏠', false, 1),
  ('Groceries',         '#F59E0B', '🛒', false, 2),
  ('Restaurants',       '#F97316', '🍽️', false, 3),
  ('Transport',         '#3B82F6', '🚗', false, 4),
  ('Health & Fitness',  '#10B981', '💪', false, 5),
  ('Shopping',          '#8B5CF6', '🛍️', false, 6),
  ('Entertainment',     '#EC4899', '🎬', false, 7),
  ('Travel',            '#06B6D4', '✈️', false, 8),
  ('Subscriptions',     '#6366F1', '🔄', false, 9),
  ('Utilities',         '#78716C', '⚡', false, 10),
  ('Insurance',         '#64748B', '🛡️', false, 11),
  ('Education',         '#14B8A6', '📚', false, 12),
  ('Gifts & Donations', '#A855F7', '🎁', false, 13),
  ('Personal Care',     '#F472B6', '✨', false, 14),
  ('Income - Salary',   '#22C55E', '💰', true,  20),
  ('Income - Other',    '#16A34A', '📈', true,  21),
  ('Transfer',          '#9CA3AF', '↔️', false, 30),
  ('Uncategorized',     '#D1D5DB', '❓', false, 99);

-- Seed some category rules for your banks
insert into category_rules (category_id, match_field, match_pattern, priority) values
  ((select id from categories where name = 'Groceries'), 'payee', 'whole foods', 10),
  ((select id from categories where name = 'Groceries'), 'payee', 'trader joe', 10),
  ((select id from categories where name = 'Groceries'), 'payee', 'safeway', 10),
  ((select id from categories where name = 'Restaurants'), 'payee', 'doordash', 10),
  ((select id from categories where name = 'Restaurants'), 'payee', 'uber eats', 10),
  ((select id from categories where name = 'Transport'), 'payee', 'uber', 5),
  ((select id from categories where name = 'Transport'), 'payee', 'lyft', 10),
  ((select id from categories where name = 'Subscriptions'), 'payee', 'netflix', 10),
  ((select id from categories where name = 'Subscriptions'), 'payee', 'spotify', 10),
  ((select id from categories where name = 'Subscriptions'), 'payee', 'youtube', 10),
  ((select id from categories where name = 'Health & Fitness'), 'payee', 'planet granite', 10),
  ((select id from categories where name = 'Health & Fitness'), 'payee', 'movement', 10),
  ((select id from categories where name = 'Income - Salary'), 'payee', 'capgemini', 10),
  ((select id from categories where name = 'Rent & Housing'), 'payee', 'rent', 5),
  ((select id from categories where name = 'Utilities'), 'payee', 'pg&e', 10),
  ((select id from categories where name = 'Utilities'), 'payee', 'comcast', 10),
  ((select id from categories where name = 'Utilities'), 'payee', 'xfinity', 10);

-- RLS policies (since this is single-user, we keep it simple)
-- Enable RLS on all tables
alter table accounts enable row level security;
alter table transactions enable row level security;
alter table categories enable row level security;
alter table category_rules enable row level security;
alter table holdings enable row level security;
alter table networth_snapshots enable row level security;

-- Allow all operations for authenticated users
create policy "Allow all for authenticated" on accounts for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on transactions for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on categories for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on category_rules for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on holdings for all using (auth.role() = 'authenticated');
create policy "Allow all for authenticated" on networth_snapshots for all using (auth.role() = 'authenticated');

-- Also allow service role (for cron job)
create policy "Allow service role" on accounts for all using (auth.role() = 'service_role');
create policy "Allow service role" on transactions for all using (auth.role() = 'service_role');
create policy "Allow service role" on categories for all using (auth.role() = 'service_role');
create policy "Allow service role" on category_rules for all using (auth.role() = 'service_role');
create policy "Allow service role" on holdings for all using (auth.role() = 'service_role');
create policy "Allow service role" on networth_snapshots for all using (auth.role() = 'service_role');
