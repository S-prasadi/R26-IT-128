-- Career path prediction snapshots — one row per /career/predict run,
-- so users can compare readiness / target roles over time.
create table if not exists public.career_predictions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  "current_role"    text,
  experience_months int,
  result            jsonb not null,          -- full CareerPrediction snapshot
  top_target_role   text,
  top_confidence    numeric,
  top_readiness     numeric,
  created_at        timestamptz not null default now()
);

create index if not exists career_predictions_user_id_idx
  on public.career_predictions(user_id, created_at desc);

-- RLS (mirrors 0012_career.sql)
alter table public.career_predictions enable row level security;

drop policy if exists "career_predictions_select_self" on public.career_predictions;
create policy "career_predictions_select_self"
  on public.career_predictions for select using (auth.uid() = user_id);

drop policy if exists "career_predictions_insert_self" on public.career_predictions;
create policy "career_predictions_insert_self"
  on public.career_predictions for insert with check (auth.uid() = user_id);

drop policy if exists "career_predictions_delete_self" on public.career_predictions;
create policy "career_predictions_delete_self"
  on public.career_predictions for delete using (auth.uid() = user_id);
