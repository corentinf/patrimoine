-- AI merchant lookups, stored once per merchant (keyed by normalizeMerchant() in app/lib/merchant.ts)
-- so opening another transaction from the same merchant never re-runs the web search.
create table if not exists merchant_enrichments (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  merchant_key  text not null,
  business_name text not null,
  description   text,
  category      text,
  website       text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique(user_id, merchant_key)
);

alter table merchant_enrichments enable row level security;

create policy "Users manage own merchant enrichments"
  on merchant_enrichments for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
