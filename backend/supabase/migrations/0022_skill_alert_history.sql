-- Tracks which early-warning skill alerts have already been sent to each user,
-- so re-running the forecast does not re-send the same notifications.
create table if not exists public.skill_alert_history (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  skill       text not null,
  weeks_ahead int,
  sent_at     timestamptz not null default now(),
  unique (user_id, skill)
);

create index if not exists skill_alert_history_user_id_idx on public.skill_alert_history(user_id);

alter table public.skill_alert_history enable row level security;

drop policy if exists "skill_alert_history_select_self" on public.skill_alert_history;
create policy "skill_alert_history_select_self"
  on public.skill_alert_history for select using (auth.uid() = user_id);
