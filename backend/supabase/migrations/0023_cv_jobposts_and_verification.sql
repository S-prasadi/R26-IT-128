-- CV: store the raw text extracted at upload (Module D OCR) so analysis can
-- reuse it, plus GitHub project-verification results.
alter table public.cvs add column if not exists extracted_text text;
alter table public.cvs add column if not exists project_verification jsonb;

-- Job posts attached to a CV for real comparison (vs. the role blueprints)
create table if not exists public.cv_job_posts (
  id          uuid primary key default gen_random_uuid(),
  cv_id       uuid not null references public.cvs(id) on delete cascade,
  title       text,
  job_text    text not null,
  comparison  jsonb,   -- Module C compare result + Module A demand annotations
  tailoring   jsonb,   -- Module D LLM tailoring suggestions
  created_at  timestamptz not null default now()
);

create index if not exists cv_job_posts_cv_id_idx on public.cv_job_posts(cv_id);

alter table public.cv_job_posts enable row level security;

drop policy if exists "cv_job_posts_select" on public.cv_job_posts;
create policy "cv_job_posts_select"
  on public.cv_job_posts for select
  using (exists (select 1 from public.cvs where id = cv_id and user_id = auth.uid()));

drop policy if exists "cv_job_posts_insert" on public.cv_job_posts;
create policy "cv_job_posts_insert"
  on public.cv_job_posts for insert
  with check (exists (select 1 from public.cvs where id = cv_id and user_id = auth.uid()));

drop policy if exists "cv_job_posts_delete" on public.cv_job_posts;
create policy "cv_job_posts_delete"
  on public.cv_job_posts for delete
  using (exists (select 1 from public.cvs where id = cv_id and user_id = auth.uid()));
