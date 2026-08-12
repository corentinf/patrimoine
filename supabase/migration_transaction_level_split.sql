-- Per-transaction shared-expense split — independent of the Amex account-wide
-- split (migration_amex_split.sql). Lets any single transaction (e.g. one
-- dinner split with a friend) be flagged shared without touching its account.
-- app/lib/split.ts treats a transaction-level is_shared as taking precedence
-- over the account's own setting.

alter table transactions add column if not exists is_shared boolean default false;
alter table transactions add column if not exists personal_percentage numeric default 100;
