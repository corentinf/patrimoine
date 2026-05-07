create table if not exists subscription_overrides (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  status       text not null check (status in ('confirmed', 'dismissed')),
  created_at   timestamptz default now(),
  unique(user_id, merchant_key)
);

alter table subscription_overrides enable row level security;

create policy "Users manage own subscription overrides"
  on subscription_overrides for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
