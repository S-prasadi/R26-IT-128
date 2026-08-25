-- Default CV selection + computed total work experience (months), used to
-- auto-suggest an interview difficulty level from the user's chosen CV.
alter table public.cvs
  add column if not exists is_default boolean not null default false,
  add column if not exists experience_months int;

-- Enforce at most one default CV per user.
create unique index if not exists cvs_one_default_per_user
  on public.cvs (user_id) where is_default = true;
