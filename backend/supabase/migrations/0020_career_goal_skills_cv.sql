-- Add skills snapshot and CV reference to career_goals
alter table public.career_goals
  add column if not exists skills_snapshot jsonb,
  add column if not exists cv_id           uuid references public.cvs(id) on delete set null;
