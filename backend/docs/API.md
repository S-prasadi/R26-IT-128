# API Reference

Base URL: `http://localhost:8080/api`

## Conventions

- **Auth header:** `Authorization: Bearer <access_token>` (Supabase access JWT).
- **Content-Type:** `application/json` for all bodies.
- **Success shape:**
  ```json
  { "success": true, "message": "...", "data": { ... } }
  ```
- **Error shape:**
  ```json
  { "success": false, "message": "..." }
  ```
- **Validation error shape (422):**
  ```json
  { "success": false, "message": "Validation failed", "errors": [{ "path": "email", "message": "..." }] }
  ```

## Status codes

| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 400 | Bad request (incl. Supabase auth errors) |
| 401 | Missing or invalid token |
| 403 | Authenticated but lacking required permission/role |
| 404 | Resource not found |
| 409 | Conflict (duplicate) |
| 422 | Validation failed |
| 500 | Server error |

---

## Auth — `/auth`

| Method | Path | Auth | Required perm | Body |
|---|---|---|---|---|
| POST | `/register` | — | — | `{ email, password, full_name? }` |
| POST | `/login` | — | — | `{ email, password }` |
| POST | `/refresh` | — | — | `{ refresh_token }` |
| POST | `/forgot-password` | — | — | `{ email, redirect_to? }` |
| POST | `/reset-password` | Bearer | — | `{ password }` |
| POST | `/logout` | Bearer | — | — |
| GET  | `/me` | Bearer | — | — |

**`POST /auth/register` 201**
```json
{ "success": true, "message": "Account created",
  "data": { "user": { "id": "...", "email": "..." }, "session": null } }
```
(`session` is `null` until email is verified, if email confirmation is enabled.)

**`POST /auth/login` 200**
```json
{ "success": true, "data": {
    "user": { "id": "...", "email": "..." },
    "session": { "access_token": "...", "refresh_token": "...", "expires_in": 3600 }
} }
```

**`GET /auth/me` 200**
```json
{ "success": true, "data": {
    "id": "...", "email": "...", "full_name": "...",
    "is_active": true, "roles": ["user"], "permissions": []
} }
```

---

## Users — `/users` (all require Bearer)

| Method | Path | Required perm | Body / query |
|---|---|---|---|
| GET    | `/` | `users:read` | `?page=1&limit=20&search=foo` |
| GET    | `/:id` | `users:read` | — |
| PATCH  | `/:id` | `users:write` | `{ full_name?, avatar_url?, is_active? }` |
| DELETE | `/:id` | `users:delete` | soft-delete (sets `is_active=false`) |
| DELETE | `/:id/hard` | `users:delete` | hard-delete (removes `auth.users` row) |
| POST   | `/:id/roles` | `roles:write` | `{ role_id }` |
| DELETE | `/:id/roles/:roleId` | `roles:write` | — |

**`GET /users` 200**
```json
{ "success": true, "data": {
    "items": [{ "id": "...", "email": "...", "is_active": true, ... }],
    "page": 1, "limit": 20, "total": 42
} }
```

**`GET /users/:id` 200** — includes `roles` (array of `{id, name}`) and flattened `permissions[]`.

---

## Roles — `/roles` (all require Bearer)

| Method | Path | Required perm | Body |
|---|---|---|---|
| GET    | `/` | `roles:read` | — |
| GET    | `/:id` | `roles:read` | — (returns role + attached permissions) |
| POST   | `/` | `roles:write` | `{ name, description? }` |
| PATCH  | `/:id` | `roles:write` | `{ name?, description? }` (blocked on `is_system`) |
| DELETE | `/:id` | `roles:delete` | (blocked on `is_system`) |
| POST   | `/:id/permissions` | `permissions:assign` | `{ permission_id }` |
| DELETE | `/:id/permissions/:permissionId` | `permissions:assign` | — |

---

## Permissions — `/permissions` (all require Bearer)

| Method | Path | Required perm | Body |
|---|---|---|---|
| GET    | `/` | `permissions:read` | — |
| POST   | `/` | `roles:write` | `{ name, description?, resource, action }` |

---

## Health

| Method | Path | Auth |
|---|---|---|
| GET | `/health` | — |

```json
{ "success": true, "message": "API is healthy" }
```
