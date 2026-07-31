-- Migration: Track a single "last synced" timestamp for the whole app.
-- plaid_items.last_synced_at and simplefin_connections.last_synced_at are
-- per-connection; this is the one value the nav bar's sync indicator and
-- the 6-hour auto-sync check read/write. Run this in the Supabase SQL editor.

alter table user_settings add column if not exists last_synced_at timestamptz;
