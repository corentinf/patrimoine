-- Add "Personal Payments" category for P2P transfers (Venmo, Zelle, Cash App, etc.)
-- These are real expenses that should count toward spending, unlike inter-account transfers.

insert into categories (name, color, icon, is_income, sort_order)
values ('Personal Payments', '#F97316', '💸', false, 29)
on conflict (name) do nothing;

-- Auto-classify Venmo, Zelle, and Cash App transactions to this category
insert into category_rules (category_id, match_field, match_pattern, priority)
select id, 'payee', 'venmo', 20 from categories where name = 'Personal Payments'
on conflict do nothing;

insert into category_rules (category_id, match_field, match_pattern, priority)
select id, 'payee', 'zelle', 20 from categories where name = 'Personal Payments'
on conflict do nothing;

insert into category_rules (category_id, match_field, match_pattern, priority)
select id, 'payee', 'cash app', 20 from categories where name = 'Personal Payments'
on conflict do nothing;
