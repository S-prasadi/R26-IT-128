-- Interview sessions
create table if not exists public.interview_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  topic            text not null,
  difficulty       int  not null default 3 check (difficulty between 1 and 5),
  status           text not null default 'pending' check (status in ('pending','in_progress','completed')),
  duration_seconds int,
  overall_score    float check (overall_score between 0 and 100),
  engagement_score float check (engagement_score between 0 and 100),
  started_at       timestamptz,
  ended_at         timestamptz,
  created_at       timestamptz not null default now()
);

-- Questions generated for a session (by Module D or mock)
create table if not exists public.interview_questions (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.interview_sessions(id) on delete cascade,
  question_text text not null,
  question_type text not null default 'technical' check (question_type in ('behavioral','technical','situational')),
  difficulty    int  not null default 3,
  order_index   int  not null default 0
);

-- User responses with scoring and emotion data
create table if not exists public.interview_responses (
  id               uuid primary key default gen_random_uuid(),
  question_id      uuid not null references public.interview_questions(id) on delete cascade,
  response_text    text,
  score            float check (score between 0 and 100),
  feedback         text,
  emotion_data     jsonb,  -- {dominant: string, timeline: [{t: number, emotion: string}]}
  engagement_score float check (engagement_score between 0 and 100),
  created_at       timestamptz not null default now()
);

create index if not exists interview_sessions_user_id_idx     on public.interview_sessions(user_id);
create index if not exists interview_questions_session_id_idx on public.interview_questions(session_id);
create index if not exists interview_responses_question_id_idx on public.interview_responses(question_id);

-- RLS
alter table public.interview_sessions  enable row level security;
alter table public.interview_questions enable row level security;
alter table public.interview_responses enable row level security;

drop policy if exists "interview_sessions_select_self" on public.interview_sessions;
create policy "interview_sessions_select_self"
  on public.interview_sessions for select using (auth.uid() = user_id);

drop policy if exists "interview_sessions_insert_self" on public.interview_sessions;
create policy "interview_sessions_insert_self"
  on public.interview_sessions for insert with check (auth.uid() = user_id);

drop policy if exists "interview_sessions_update_self" on public.interview_sessions;
create policy "interview_sessions_update_self"
  on public.interview_sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "interview_questions_select" on public.interview_questions;
create policy "interview_questions_select"
  on public.interview_questions for select
  using (exists (select 1 from public.interview_sessions where id = session_id and user_id = auth.uid()));

drop policy if exists "interview_questions_insert" on public.interview_questions;
create policy "interview_questions_insert"
  on public.interview_questions for insert
  with check (exists (select 1 from public.interview_sessions where id = session_id and user_id = auth.uid()));

drop policy if exists "interview_responses_select" on public.interview_responses;
create policy "interview_responses_select"
  on public.interview_responses for select
  using (exists (
    select 1 from public.interview_questions iq
    join public.interview_sessions s on s.id = iq.session_id
    where iq.id = question_id and s.user_id = auth.uid()
  ));

drop policy if exists "interview_responses_insert" on public.interview_responses;
create policy "interview_responses_insert"
  on public.interview_responses for insert
  with check (exists (
    select 1 from public.interview_questions iq
    join public.interview_sessions s on s.id = iq.session_id
    where iq.id = question_id and s.user_id = auth.uid()
  ));

drop policy if exists "interview_responses_update" on public.interview_responses;
create policy "interview_responses_update"
  on public.interview_responses for update
  using (exists (
    select 1 from public.interview_questions iq
    join public.interview_sessions s on s.id = iq.session_id
    where iq.id = question_id and s.user_id = auth.uid()
  ));
