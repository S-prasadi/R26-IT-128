-- Career goal (one active goal per user)
create table if not exists public.career_goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade unique,
  target_role      text not null,
  target_industry  text,
  target_date      date,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Career roadmap action items
create table if not exists public.career_roadmap_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  description text,
  status      text not null default 'pending' check (status in ('pending','in_progress','done')),
  due_date    date,
  order_index int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists career_goals_user_id_idx         on public.career_goals(user_id);
create index if not exists career_roadmap_items_user_id_idx on public.career_roadmap_items(user_id);

create or replace function public.set_career_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists career_goals_updated_at on public.career_goals;
create trigger career_goals_updated_at
  before update on public.career_goals
  for each row execute function public.set_career_updated_at();

drop trigger if exists career_roadmap_items_updated_at on public.career_roadmap_items;
create trigger career_roadmap_items_updated_at
  before update on public.career_roadmap_items
  for each row execute function public.set_career_updated_at();

-- RLS
alter table public.career_goals         enable row level security;
alter table public.career_roadmap_items enable row level security;

drop policy if exists "career_goals_select_self" on public.career_goals;
create policy "career_goals_select_self"
  on public.career_goals for select using (auth.uid() = user_id);

drop policy if exists "career_goals_insert_self" on public.career_goals;
create policy "career_goals_insert_self"
  on public.career_goals for insert with check (auth.uid() = user_id);

drop policy if exists "career_goals_update_self" on public.career_goals;
create policy "career_goals_update_self"
  on public.career_goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "career_roadmap_select_self" on public.career_roadmap_items;
create policy "career_roadmap_select_self"
  on public.career_roadmap_items for select using (auth.uid() = user_id);

drop policy if exists "career_roadmap_insert_self" on public.career_roadmap_items;
create policy "career_roadmap_insert_self"
  on public.career_roadmap_items for insert with check (auth.uid() = user_id);

drop policy if exists "career_roadmap_update_self" on public.career_roadmap_items;
create policy "career_roadmap_update_self"
  on public.career_roadmap_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "career_roadmap_delete_self" on public.career_roadmap_items;
create policy "career_roadmap_delete_self"
  on public.career_roadmap_items for delete using (auth.uid() = user_id);
