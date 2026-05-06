create table if not exists venmo_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  transaction_id text not null references transactions(id) on delete cascade,
  person_name text not null,
  amount numeric not null,
  status text not null default 'pending', -- pending | requested | settled
  created_at timestamptz default now()
);

alter table venmo_requests enable row level security;
create policy "Allow all for authenticated" on venmo_requests for all using (auth.role() = 'authenticated');
create policy "Allow service role" on venmo_requests for all using (auth.role() = 'service_role');

create index idx_venmo_requests_user on venmo_requests(user_id);
create index idx_venmo_requests_transaction on venmo_requests(transaction_id);
