-- Uber/Lyft/taxi cleanup. Applied live via the Supabase REST API this
-- session — this checks in the migration for the record, same as the other
-- category additions in this repo.
--
-- 1. "Ride Share" already existed under Transport, but the auto-categorization
--    rules were wrong: bare "uber" (priority 50) was pointed at Public Transit
--    and also outranked the "uber eats" rule (priority 10), so any future
--    Uber Eats transaction would have matched "uber" first and landed in
--    Public Transit instead of Restaurants. "lyft" pointed at the generic
--    Transport parent instead of Ride Share. No rule existed for "taxi" at all.
-- 2. Added "Local Rides" under Travel, for manually recategorizing rides taken
--    while traveling — merchant-name rules can't distinguish an Uber taken at
--    home from one taken on a trip, so that split has to stay a manual,
--    per-transaction call rather than an automatic rule.

insert into categories (name, color, icon, is_income, sort_order, parent_id)
select 'Local Rides', '#06B6D4', '🚕', false, 87, id from categories where name = 'Travel'
on conflict (name) do nothing;

do $$
declare
  ride_share_id uuid;
begin
  select id into ride_share_id from categories where name = 'Ride Share';

  update category_rules set category_id = ride_share_id, priority = 5
  where match_pattern = 'uber';

  update category_rules set category_id = ride_share_id
  where match_pattern = 'lyft';

  insert into category_rules (category_id, match_field, match_pattern, priority, user_id)
  select ride_share_id, 'payee', 'taxi', 10, user_id from category_rules where user_id is not null limit 1
  on conflict do nothing;
end $$;
