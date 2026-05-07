create table if not exists category_budgets (
  id             uuid default gen_random_uuid() primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  category_id    uuid not null references categories(id) on delete cascade,
  monthly_amount numeric not null check (monthly_amount > 0),
  unique(user_id, category_id)
);

alter table category_budgets enable row level security;

create policy "Users manage own budgets"
  on category_budgets for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
