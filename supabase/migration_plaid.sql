-- Migration: Add Plaid support
-- Run this in the Supabase SQL editor BEFORE connecting your first Plaid item.
-- It will clear existing SimpleFIN data (accounts cascade to transactions + holdings).

-- 1. Plaid items — one row per connected institution
create table if not exists plaid_items (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null,
  item_id           text not null unique,
  access_token      text not null,
  institution_id    text,
  institution_name  text,
  cursor            text,             -- /transactions/sync cursor; null = initial sync pending
  last_synced_at    timestamptz,
  created_at        timestamptz default now()
);

alter table plaid_items enable row level security;
create policy "Allow all for authenticated" on plaid_items for all using (auth.role() = 'authenticated');
create policy "Allow service role"          on plaid_items for all using (auth.role() = 'service_role');
create index idx_plaid_items_user on plaid_items(user_id);

-- 2. Clear old SimpleFIN data so Plaid IDs don't collide with leftover rows.
--    Cascade handles transactions and holdings automatically.
truncate table accounts restart identity cascade;
