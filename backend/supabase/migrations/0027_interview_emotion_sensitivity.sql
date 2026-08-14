-- Per-session control for live facial-emotion detection sensitivity (0-100, default = current hardcoded behavior).
alter table public.interview_sessions
  add column if not exists emotion_sensitivity smallint not null default 50
  constraint interview_sessions_emotion_sensitivity_range check (emotion_sensitivity between 0 and 100);
