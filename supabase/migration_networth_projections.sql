-- Stores AI-generated net worth projections (optimistic/regular/pessimistic
-- scenarios), generated on-demand via a "Regenerate" button rather than on
-- every page load. The Home page reads the latest row on every load (free);
-- a new row is only inserted when the user explicitly clicks Regenerate
-- (calls Claude). RLS/policy pattern matches migration_settings.sql.

create table if not exists networth_projections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  generated_at timestamptz not null default now(),
  model text not null,
  scenarios jsonb not null
);

alter table networth_projections enable row level security;

create policy "Users manage own projections"
  on networth_projections for all
  using (auth.uid() = user_id);

create index if not exists idx_networth_projections_generated
  on networth_projections(generated_at desc);
