-- Migration: user_github_tokens
-- Stores GitHub OAuth access tokens per user for skill verification.

create table if not exists public.user_github_tokens (
  user_id         uuid primary key references public.profiles(id) on delete cascade,
  github_username text        not null,
  access_token    text        not null,
  scopes          text        not null default 'read:user repo',
  connected_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists user_github_tokens_user_id_idx
  on public.user_github_tokens(user_id);

create or replace function public.set_github_tokens_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists github_tokens_updated_at on public.user_github_tokens;
create trigger github_tokens_updated_at
  before update on public.user_github_tokens
  for each row execute function public.set_github_tokens_updated_at();

alter table public.user_github_tokens enable row level security;
