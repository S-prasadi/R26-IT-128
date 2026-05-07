# Database Schema Reference

All application tables live in the `public` schema of the Supabase Postgres instance. Identity is owned by `auth.users` (Supabase-managed). RBAC is normalized into roles, permissions, and join tables.

## ERD

```mermaid
erDiagram
  auth_users ||--|| profiles : "1:1 (id)"
  profiles ||--o{ user_roles : "has"
  roles ||--o{ user_roles : "assigned to"
  roles ||--o{ role_permissions : "has"
  permissions ||--o{ role_permissions : "granted by"

  auth_users {
    uuid id PK
    text email
    text encrypted_password
  }
  profiles {
    uuid id PK_FK
    text email
    text full_name
    text avatar_url
    bool is_active
    timestamptz created_at
    timestamptz updated_at
  }
  roles {
    uuid id PK
    text name UK
    text description
    bool is_system
    timestamptz created_at
  }
  permissions {
    uuid id PK
    text name UK
    text description
    text resource
    text action
    timestamptz created_at
  }
  role_permissions {
    uuid role_id PK_FK
    uuid permission_id PK_FK
  }
  user_roles {
    uuid user_id PK_FK
    uuid role_id PK_FK
    timestamptz assigned_at
    uuid assigned_by FK
  }
```

## Tables

### `profiles`
1:1 with `auth.users`. App-level user data.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | FK → `auth.users.id` ON DELETE CASCADE |
| email | text NOT NULL UNIQUE | mirrored from `auth.users` |
| full_name | text | from signup metadata |
| avatar_url | text | OAuth provider or user upload |
| is_active | boolean DEFAULT true | soft-delete flag |
| created_at | timestamptz DEFAULT now() | |
| updated_at | timestamptz DEFAULT now() | trigger updates on every UPDATE |

Indexes: `email`, `is_active`.

### `roles`
Role catalog.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| name | text UNIQUE NOT NULL | e.g. `admin`, `manager`, `user` |
| description | text | |
| is_system | boolean DEFAULT false | system roles cannot be modified or deleted |
| created_at | timestamptz | |

### `permissions`
Permission catalog.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text UNIQUE NOT NULL | e.g. `users:read` |
| description | text | |
| resource | text NOT NULL | e.g. `users` |
| action | text NOT NULL | e.g. `read`, `write`, `delete` |
| created_at | timestamptz | |

Indexes: `resource`.

### `role_permissions`
M:N roles ↔ permissions.

| Column | Type | Notes |
|---|---|---|
| role_id | uuid FK roles ON DELETE CASCADE | PK part |
| permission_id | uuid FK permissions ON DELETE CASCADE | PK part |
| created_at | timestamptz | |

### `user_roles`
M:N profiles ↔ roles.

| Column | Type | Notes |
|---|---|---|
| user_id | uuid FK profiles ON DELETE CASCADE | PK part |
| role_id | uuid FK roles ON DELETE CASCADE | PK part |
| assigned_at | timestamptz DEFAULT now() | |
| assigned_by | uuid FK profiles ON DELETE SET NULL | nullable for system seeds |

## Triggers & functions

- **`set_updated_at()`** — generic trigger to update `updated_at`. Bound to `profiles`.
- **`handle_new_user()`** — fires AFTER INSERT on `auth.users`. Creates the matching `profiles` row (pulling `full_name`/`avatar_url` from `raw_user_meta_data`) and assigns the default `user` role.

## Views

- **`v_user_permissions`** — flattens `user_roles ⋈ roles ⋈ role_permissions ⋈ permissions` to `(user_id, role_id, role_name, permission_id, permission_name, resource, action)`. The auth middleware queries this view to hydrate `req.user.permissions`.

## Row Level Security

Enabled on all public tables. The `service_role` key bypasses RLS, so the backend always has full access.

| Table | Policy | Effect |
|---|---|---|
| profiles | `profiles_select_self` | Users can SELECT their own row |
| profiles | `profiles_update_self` | Users can UPDATE their own row |
| roles | `roles_read_authenticated` | Any signed-in user can SELECT |
| permissions | `permissions_read_authenticated` | Any signed-in user can SELECT |
| role_permissions | `role_permissions_read_authenticated` | Any signed-in user can SELECT |
| user_roles | `user_roles_read_self` | Users can SELECT their own assignments |

All writes to `roles`, `permissions`, `role_permissions`, `user_roles` go through the backend (service role), guarded by permission checks.

## Seed data

| Roles | Permissions granted |
|---|---|
| `admin` (system) | all permissions |
| `manager` | `users:read`, `roles:read`, `permissions:read` |
| `user` (system) | none — default for new signups |

Seeded permissions: `users:read`, `users:write`, `users:delete`, `roles:read`, `roles:write`, `roles:delete`, `permissions:read`, `permissions:assign`.

## Migration order

```
0001_extensions.sql
0002_profiles.sql
0003_roles_permissions.sql
0004_role_permissions.sql
0005_user_roles.sql
0006_handle_new_user_trigger.sql
0007_v_user_permissions_view.sql
0008_rls_policies.sql
0009_seed.sql
```

## Running migrations

**Option A — Supabase CLI (recommended):**
```bash
supabase link --project-ref <ref>
supabase db push
```

**Option B — psql:**
```bash
for f in backend/supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -f "$f"
done
```

**Option C — SQL editor:** paste each file in order in the Supabase dashboard.
