-- Migration: Add mask (last 4 digits of the account/card number) to accounts.
-- Differentiates multiple accounts at the same institution (e.g. several
-- Chase cards) when Plaid reports the same generic name for each.
-- Run this in the Supabase SQL editor, then hit "Sync now" to backfill it
-- for Plaid-connected accounts.

alter table accounts add column if not exists mask text;
