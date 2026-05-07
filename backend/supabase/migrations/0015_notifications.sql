-- Notification preferences (one row per user)
create table if not exists public.notification_preferences (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade unique,
  skill_alerts         bool not null default true,
  career_updates       bool not null default true,
  cv_feedback          bool not null default true,
  interview_reminders  bool not null default true,
  system_notices       bool not null default true,
  updated_at           timestamptz not null default now()
);

-- Firebase FCM device tokens
create table if not exists public.fcm_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  token       text not null unique,
  device_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists fcm_tokens_user_id_idx on public.fcm_tokens(user_id);

create or replace function public.set_notification_prefs_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists notification_prefs_updated_at on public.notification_preferences;
create trigger notification_prefs_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_notification_prefs_updated_at();

drop trigger if exists fcm_tokens_updated_at on public.fcm_tokens;
create trigger fcm_tokens_updated_at
  before update on public.fcm_tokens
  for each row execute function public.set_notification_prefs_updated_at();

-- Auto-create notification_preferences when a new user is created
-- (extends the existing handle_new_user function)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_role_id uuid;
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;

  select id into default_role_id from public.roles where name = 'user' limit 1;

  if default_role_id is not null then
    insert into public.user_roles (user_id, role_id)
    values (new.id, default_role_id)
    on conflict do nothing;
  end if;

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- RLS
alter table public.notification_preferences enable row level security;
alter table public.fcm_tokens               enable row level security;

drop policy if exists "notification_prefs_select_self" on public.notification_preferences;
create policy "notification_prefs_select_self"
  on public.notification_preferences for select using (auth.uid() = user_id);

drop policy if exists "notification_prefs_insert_self" on public.notification_preferences;
create policy "notification_prefs_insert_self"
  on public.notification_preferences for insert with check (auth.uid() = user_id);

drop policy if exists "notification_prefs_update_self" on public.notification_preferences;
create policy "notification_prefs_update_self"
  on public.notification_preferences for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "fcm_tokens_select_self" on public.fcm_tokens;
create policy "fcm_tokens_select_self"
  on public.fcm_tokens for select using (auth.uid() = user_id);

drop policy if exists "fcm_tokens_insert_self" on public.fcm_tokens;
create policy "fcm_tokens_insert_self"
  on public.fcm_tokens for insert with check (auth.uid() = user_id);

drop policy if exists "fcm_tokens_update_self" on public.fcm_tokens;
create policy "fcm_tokens_update_self"
  on public.fcm_tokens for update using (auth.uid() = user_id);

drop policy if exists "fcm_tokens_delete_self" on public.fcm_tokens;
create policy "fcm_tokens_delete_self"
  on public.fcm_tokens for delete using (auth.uid() = user_id);
