-- Migration: Add SimpleFIN connections table
-- Run this in the Supabase SQL editor.

create table if not exists simplefin_connections (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null,
  access_url     text not null,
  last_synced_at timestamptz,
  created_at     timestamptz default now()
);

alter table simplefin_connections enable row level security;
create policy "Allow all for authenticated" on simplefin_connections for all using (auth.role() = 'authenticated');
create policy "Allow service role"          on simplefin_connections for all using (auth.role() = 'service_role');
create index idx_simplefin_connections_user on simplefin_connections(user_id);
