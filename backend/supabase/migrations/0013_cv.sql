-- CV records
create table if not exists public.cvs (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.profiles(id) on delete cascade,
  title                   text not null default 'My CV',
  github_url              text,
  linkedin_url            text,
  summary                 text,
  ats_score               int  check (ats_score between 0 and 100),
  match_score             int  check (match_score between 0 and 100),
  bert_skills             jsonb,  -- Module C extracted skills
  github_verified_skills  jsonb,  -- Module C verified skills
  file_url                text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- CV content sections
create table if not exists public.cv_sections (
  id           uuid primary key default gen_random_uuid(),
  cv_id        uuid not null references public.cvs(id) on delete cascade,
  section_type text not null check (section_type in ('experience','education','skills','projects','summary')),
  content      jsonb not null default '{}',
  order_index  int  not null default 0,
  created_at   timestamptz not null default now()
);

-- Job match results from Module C
create table if not exists public.cv_job_matches (
  id          uuid primary key default gen_random_uuid(),
  cv_id       uuid not null references public.cvs(id) on delete cascade,
  job_title   text not null,
  company     text,
  match_pct   float check (match_pct between 0 and 100),
  skill_gaps  jsonb,
  source_url  text,
  created_at  timestamptz not null default now()
);

-- CV improvement suggestions from Module C
create table if not exists public.cv_suggestions (
  id           uuid primary key default gen_random_uuid(),
  cv_id        uuid not null references public.cvs(id) on delete cascade,
  section_type text,
  issue        text not null,
  fix_example  text,
  priority     int  not null default 1,
  created_at   timestamptz not null default now()
);

create index if not exists cvs_user_id_idx          on public.cvs(user_id);
create index if not exists cv_sections_cv_id_idx    on public.cv_sections(cv_id);
create index if not exists cv_job_matches_cv_id_idx on public.cv_job_matches(cv_id);
create index if not exists cv_suggestions_cv_id_idx on public.cv_suggestions(cv_id);

create or replace function public.set_cvs_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists cvs_updated_at on public.cvs;
create trigger cvs_updated_at
  before update on public.cvs
  for each row execute function public.set_cvs_updated_at();

-- RLS
alter table public.cvs            enable row level security;
alter table public.cv_sections    enable row level security;
alter table public.cv_job_matches enable row level security;
alter table public.cv_suggestions enable row level security;

drop policy if exists "cvs_select_self" on public.cvs;
create policy "cvs_select_self"
  on public.cvs for select using (auth.uid() = user_id);

drop policy if exists "cvs_insert_self" on public.cvs;
create policy "cvs_insert_self"
  on public.cvs for insert with check (auth.uid() = user_id);

drop policy if exists "cvs_update_self" on public.cvs;
create policy "cvs_update_self"
  on public.cvs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "cvs_delete_self" on public.cvs;
create policy "cvs_delete_self"
  on public.cvs for delete using (auth.uid() = user_id);

-- cv_sections/matches/suggestions: access via cv ownership
drop policy if exists "cv_sections_select" on public.cv_sections;
create policy "cv_sections_select"
  on public.cv_sections for select
  using (exists (select 1 from public.cvs where id = cv_id and user_id = auth.uid()));

drop policy if exists "cv_sections_insert" on public.cv_sections;
create policy "cv_sections_insert"
  on public.cv_sections for insert
  with check (exists (select 1 from public.cvs where id = cv_id and user_id = auth.uid()));

drop policy if exists "cv_sections_update" on public.cv_sections;
create policy "cv_sections_update"
  on public.cv_sections for update
  using (exists (select 1 from public.cvs where id = cv_id and user_id = auth.uid()));

drop policy if exists "cv_sections_delete" on public.cv_sections;
create policy "cv_sections_delete"
  on public.cv_sections for delete
  using (exists (select 1 from public.cvs where id = cv_id and user_id = auth.uid()));

drop policy if exists "cv_job_matches_select" on public.cv_job_matches;
create policy "cv_job_matches_select"
  on public.cv_job_matches for select
  using (exists (select 1 from public.cvs where id = cv_id and user_id = auth.uid()));

drop policy if exists "cv_suggestions_select" on public.cv_suggestions;
create policy "cv_suggestions_select"
  on public.cv_suggestions for select
  using (exists (select 1 from public.cvs where id = cv_id and user_id = auth.uid()));
