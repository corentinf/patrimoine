create table if not exists user_settings (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  monthly_income numeric not null default 0,
  updated_at     timestamptz default now()
);

alter table user_settings enable row level security;

create policy "Users manage own settings"
  on user_settings for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
