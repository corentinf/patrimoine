-- Shared-card 50/50 split support (Amex Blue Cash Preferred, shared with Jenny).
-- personal_amount is NOT stored here — it's computed live in app/lib/split.ts
-- from is_shared/personal_percentage, since it must stay in sync if the
-- percentage ever changes and Postgres generated columns can't join accounts.

alter table accounts add column if not exists is_shared boolean default false;
alter table accounts add column if not exists personal_percentage numeric default 100;

alter table transactions add column if not exists split_settled_at timestamptz;
alter table transactions add column if not exists split_match_dismissed boolean default false;

update accounts set is_shared = true, personal_percentage = 50
where id = 'sfin_ACT-13d02aea-9a4f-4f31-9801-d835403fc14f';
