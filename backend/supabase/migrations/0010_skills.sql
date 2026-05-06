-- Master skills catalog
create table if not exists public.skills (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  category    text not null default 'General',
  description text,
  created_at  timestamptz not null default now()
);

-- Skills a user has declared (with proficiency)
create table if not exists public.user_skills (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  skill_id           uuid not null references public.skills(id) on delete cascade,
  proficiency_level  int  not null default 1 check (proficiency_level between 1 and 5),
  proficiency_label  text not null default 'Beginner' check (proficiency_label in ('Beginner','Intermediate','Advanced')),
  github_verified    bool not null default false,
  confidence_score   float,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, skill_id)
);

-- Skill assessment logs
create table if not exists public.skill_assessments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  skill_id    uuid not null references public.skills(id) on delete cascade,
  score       float not null check (score between 0 and 100),
  notes       text,
  assessed_at timestamptz not null default now()
);

create index if not exists user_skills_user_id_idx        on public.user_skills(user_id);
create index if not exists skill_assessments_user_id_idx  on public.skill_assessments(user_id);
create index if not exists skill_assessments_skill_id_idx on public.skill_assessments(skill_id);

-- Auto-update updated_at
create or replace function public.set_user_skills_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists user_skills_updated_at on public.user_skills;
create trigger user_skills_updated_at
  before update on public.user_skills
  for each row execute function public.set_user_skills_updated_at();

-- RLS
alter table public.skills            enable row level security;
alter table public.user_skills       enable row level security;
alter table public.skill_assessments enable row level security;

-- skills: read-only to authenticated users; backend (service_role) handles writes
drop policy if exists "skills_read_authenticated" on public.skills;
create policy "skills_read_authenticated"
  on public.skills for select to authenticated using (true);

-- user_skills: users manage own rows; service_role bypasses
drop policy if exists "user_skills_select_self" on public.user_skills;
create policy "user_skills_select_self"
  on public.user_skills for select using (auth.uid() = user_id);

drop policy if exists "user_skills_insert_self" on public.user_skills;
create policy "user_skills_insert_self"
  on public.user_skills for insert with check (auth.uid() = user_id);

drop policy if exists "user_skills_update_self" on public.user_skills;
create policy "user_skills_update_self"
  on public.user_skills for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "user_skills_delete_self" on public.user_skills;
create policy "user_skills_delete_self"
  on public.user_skills for delete using (auth.uid() = user_id);

-- skill_assessments: users manage own rows
drop policy if exists "skill_assessments_select_self" on public.skill_assessments;
create policy "skill_assessments_select_self"
  on public.skill_assessments for select using (auth.uid() = user_id);

drop policy if exists "skill_assessments_insert_self" on public.skill_assessments;
create policy "skill_assessments_insert_self"
  on public.skill_assessments for insert with check (auth.uid() = user_id);

-- Seed master skills catalog
insert into public.skills (name, category, description) values
  ('JavaScript',   'Frontend',   'Core web scripting language'),
  ('TypeScript',   'Frontend',   'Typed superset of JavaScript'),
  ('React',        'Frontend',   'UI component library by Meta'),
  ('Next.js',      'Frontend',   'React framework with SSR/SSG'),
  ('Node.js',      'Backend',    'JavaScript runtime for servers'),
  ('Express.js',   'Backend',    'Minimal Node.js web framework'),
  ('Python',       'Backend',    'General-purpose scripting language'),
  ('FastAPI',      'Backend',    'Modern Python web framework'),
  ('PostgreSQL',   'Database',   'Open-source relational database'),
  ('MongoDB',      'Database',   'Document-oriented NoSQL database'),
  ('Redis',        'Database',   'In-memory key-value store'),
  ('Docker',       'DevOps',     'Container platform'),
  ('Kubernetes',   'DevOps',     'Container orchestration'),
  ('AWS',          'Cloud',      'Amazon Web Services'),
  ('GCP',          'Cloud',      'Google Cloud Platform'),
  ('Git',          'Tools',      'Version control system'),
  ('Java',         'Backend',    'Object-oriented language'),
  ('Spring Boot',  'Backend',    'Java application framework'),
  ('Flutter',      'Mobile',     'Cross-platform mobile framework'),
  ('React Native', 'Mobile',     'React-based mobile framework'),
  ('Machine Learning', 'AI/ML',  'Building predictive models'),
  ('TensorFlow',   'AI/ML',      'Deep learning framework by Google'),
  ('PyTorch',      'AI/ML',      'Deep learning framework by Meta'),
  ('SQL',          'Database',   'Structured query language'),
  ('GraphQL',      'API',        'Query language for APIs'),
  ('REST API',     'API',        'RESTful API design'),
  ('Rust',         'Systems',    'Systems programming language'),
  ('Go',           'Backend',    'Google Go language'),
  ('LangChain',    'AI/ML',      'LLM application framework'),
  ('Bun.js',       'Runtime',    'Fast JavaScript runtime')
on conflict (name) do nothing;
