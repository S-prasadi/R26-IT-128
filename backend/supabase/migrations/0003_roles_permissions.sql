-- Role catalog
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

-- Permission catalog
create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  resource text not null,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists permissions_resource_idx on public.permissions (resource);
