-- Tag demo sessions (prebuilt questions, skip AI generation) so history/analytics can distinguish them.
alter table public.interview_sessions add column if not exists is_demo boolean not null default false;
