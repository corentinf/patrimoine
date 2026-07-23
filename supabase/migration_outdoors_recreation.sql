-- Migration: add "Outdoors & Recreation" category
insert into categories (name, color, icon, is_income, sort_order)
values ('Outdoors & Recreation', '#65A30D', '🏕️', false, 15)
on conflict do nothing;
