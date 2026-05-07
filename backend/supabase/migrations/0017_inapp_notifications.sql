-- In-app notifications table
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  title           text not null,
  message         text not null,
  type            text not null default 'info', -- 'info', 'success', 'warning', 'error'
  icon            text, -- emoji or icon URL
  data            jsonb default '{}', -- custom data payload
  read            boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Indexes for fast queries
create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_read_idx on public.notifications(user_id, read);
create index if not exists notifications_created_at_idx on public.notifications(user_id, created_at desc);

-- Auto-update updated_at timestamp
create or replace function public.set_notifications_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists notifications_updated_at on public.notifications;
create trigger notifications_updated_at
  before update on public.notifications
  for each row execute function public.set_notifications_updated_at();

-- Enable RLS
alter table public.notifications enable row level security;

-- RLS Policies: Users can only see their own notifications
drop policy if exists "notifications_select_self" on public.notifications;
create policy "notifications_select_self"
  on public.notifications for select using (auth.uid() = user_id);

drop policy if exists "notifications_insert_admin" on public.notifications;
create policy "notifications_insert_admin"
  on public.notifications for insert with check (true);

drop policy if exists "notifications_update_self" on public.notifications;
create policy "notifications_update_self"
  on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notifications_delete_self" on public.notifications;
create policy "notifications_delete_self"
  on public.notifications for delete using (auth.uid() = user_id);
