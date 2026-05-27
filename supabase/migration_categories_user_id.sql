-- Make user_id nullable on categories so global seed data (user_id = NULL) can coexist
-- with per-user custom categories (user_id = <auth.uid()>)
alter table categories alter column user_id drop not null;
