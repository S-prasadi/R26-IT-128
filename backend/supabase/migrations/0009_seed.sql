-- Seed permissions
insert into public.permissions (name, description, resource, action) values
  ('users:read',         'List and view users',           'users',       'read'),
  ('users:write',        'Update users',                  'users',       'write'),
  ('users:delete',       'Delete or deactivate users',    'users',       'delete'),
  ('roles:read',         'List and view roles',           'roles',       'read'),
  ('roles:write',        'Create or update roles',        'roles',       'write'),
  ('roles:delete',       'Delete roles',                  'roles',       'delete'),
  ('permissions:read',   'List permissions',              'permissions', 'read'),
  ('permissions:assign', 'Attach permissions to roles',   'permissions', 'assign')
on conflict (name) do nothing;

-- Seed roles
insert into public.roles (name, description, is_system) values
  ('admin',   'Full system access',                       true),
  ('manager', 'Read users and roles, no writes by default', false),
  ('user',    'Default role for newly registered users',  true)
on conflict (name) do nothing;

-- admin -> all permissions
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'admin'
on conflict do nothing;

-- manager -> read-only on users + roles
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.name in ('users:read', 'roles:read', 'permissions:read')
where r.name = 'manager'
on conflict do nothing;
