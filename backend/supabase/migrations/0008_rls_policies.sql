-- Enable RLS on all public tables. service_role bypasses RLS automatically.
alter table public.profiles         enable row level security;
alter table public.roles            enable row level security;
alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles       enable row level security;

-- profiles: users see/update their own; admins (service_role) handle the rest via backend
drop policy if exists "profiles_select_self" on public.profiles;
create policy "profiles_select_self"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- roles / permissions / role_permissions / user_roles: read-only to authenticated users.
-- All writes are mediated by the backend using the service_role key (bypasses RLS).
drop policy if exists "roles_read_authenticated" on public.roles;
create policy "roles_read_authenticated"
  on public.roles for select
  to authenticated
  using (true);

drop policy if exists "permissions_read_authenticated" on public.permissions;
create policy "permissions_read_authenticated"
  on public.permissions for select
  to authenticated
  using (true);

drop policy if exists "role_permissions_read_authenticated" on public.role_permissions;
create policy "role_permissions_read_authenticated"
  on public.role_permissions for select
  to authenticated
  using (true);

drop policy if exists "user_roles_read_self" on public.user_roles;
create policy "user_roles_read_self"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);
