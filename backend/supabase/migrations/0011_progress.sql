-- Per-module progress tracker (one row per user per module)
create table if not exists public.progress_modules (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  module_name      text not null check (module_name in ('skill','career','cv','interview')),
  completion_pct   int  not null default 0 check (completion_pct between 0 and 100),
  last_activity_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, module_name)
);

-- Milestone achievements per user
create table if not exists public.milestones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  description text,
  module_name text not null check (module_name in ('skill','career','cv','interview','platform')),
  achieved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists progress_modules_user_id_idx on public.progress_modules(user_id);
create index if not exists milestones_user_id_idx       on public.milestones(user_id);

create or replace function public.set_progress_modules_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists progress_modules_updated_at on public.progress_modules;
create trigger progress_modules_updated_at
  before update on public.progress_modules
  for each row execute function public.set_progress_modules_updated_at();

-- RLS
alter table public.progress_modules enable row level security;
alter table public.milestones       enable row level security;

drop policy if exists "progress_modules_select_self" on public.progress_modules;
create policy "progress_modules_select_self"
  on public.progress_modules for select using (auth.uid() = user_id);

drop policy if exists "progress_modules_insert_self" on public.progress_modules;
create policy "progress_modules_insert_self"
  on public.progress_modules for insert with check (auth.uid() = user_id);

drop policy if exists "progress_modules_update_self" on public.progress_modules;
create policy "progress_modules_update_self"
  on public.progress_modules for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "milestones_select_self" on public.milestones;
create policy "milestones_select_self"
  on public.milestones for select using (auth.uid() = user_id);

drop policy if exists "milestones_insert_self" on public.milestones;
create policy "milestones_insert_self"
  on public.milestones for insert with check (auth.uid() = user_id);

drop policy if exists "milestones_update_self" on public.milestones;
create policy "milestones_update_self"
  on public.milestones for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
