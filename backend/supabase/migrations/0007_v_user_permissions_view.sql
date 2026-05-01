-- Flattened view: (user_id, role_id, role_name, permission_id, permission_name)
create or replace view public.v_user_permissions as
select
  ur.user_id,
  r.id   as role_id,
  r.name as role_name,
  p.id   as permission_id,
  p.name as permission_name,
  p.resource,
  p.action
from public.user_roles ur
join public.roles r            on r.id = ur.role_id
join public.role_permissions rp on rp.role_id = r.id
join public.permissions p      on p.id = rp.permission_id;
