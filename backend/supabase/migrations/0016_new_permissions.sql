-- New module permissions
insert into public.permissions (name, description, resource, action) values
  ('skills:read',         'View skills and forecasts',          'skills',        'read'),
  ('skills:write',        'Add, update, remove user skills',    'skills',        'write'),
  ('career:read',         'View career goals and roadmap',      'career',        'read'),
  ('career:write',        'Update career goals and roadmap',    'career',        'write'),
  ('cv:read',             'View CVs and analysis results',      'cv',            'read'),
  ('cv:write',            'Create and edit CVs',                'cv',            'write'),
  ('interviews:read',     'View interview sessions',            'interviews',    'read'),
  ('interviews:write',    'Start and manage interview sessions','interviews',    'write'),
  ('progress:read',       'View progress and milestones',       'progress',      'read'),
  ('progress:write',      'Update progress and milestones',     'progress',      'write'),
  ('notifications:read',  'View notification preferences',      'notifications', 'read'),
  ('notifications:write', 'Update notification preferences',    'notifications', 'write')
on conflict (name) do nothing;

-- admin -> all new permissions (cross join catches everything)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'admin'
on conflict do nothing;

-- user role -> all new module permissions (own-data access is enforced by RLS + service logic)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.name in (
  'skills:read',      'skills:write',
  'career:read',      'career:write',
  'cv:read',          'cv:write',
  'interviews:read',  'interviews:write',
  'progress:read',    'progress:write',
  'notifications:read','notifications:write'
)
where r.name = 'user'
on conflict do nothing;
