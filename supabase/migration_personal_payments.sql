-- Add "Personal Payments" category for P2P transfers (Venmo, Zelle, Cash App, etc.)
-- These are real expenses that should count toward spending, unlike inter-account transfers.
-- user_id is nullable on categories (global seed rows use NULL).

insert into categories (name, color, icon, is_income, sort_order)
values ('Personal Payments', '#F97316', '💸', false, 29)
on conflict do nothing;

-- category_rules requires user_id — borrow it from existing rules rows.
do $$
declare
  cat_id uuid;
  uid uuid;
begin
  select id into cat_id from categories where name = 'Personal Payments' limit 1;
  select user_id into uid from category_rules where user_id is not null limit 1;

  insert into category_rules (category_id, match_field, match_pattern, priority, user_id)
  values
    (cat_id, 'payee', 'venmo',    20, uid),
    (cat_id, 'payee', 'zelle',    20, uid),
    (cat_id, 'payee', 'cash app', 20, uid)
  on conflict do nothing;
end $$;
