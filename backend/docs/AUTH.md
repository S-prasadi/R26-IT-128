# Authentication & Authorization Guide

This document describes the auth system end-to-end: how Supabase Auth integrates with the Express backend, how JWTs are verified, how the RBAC layer works, and how to wire everything up locally.

---

## 1. Architecture

```
┌─────────────┐  1. signUp / signIn / OAuth  ┌──────────────┐
│  Frontend   │ ───────────────────────────► │   Supabase   │
│  (Next.js)  │ ◄──── access + refresh token │     Auth     │
└──────┬──────┘                              └──────┬───────┘
       │                                            │ writes auth.users
       │ 2. API call w/ Bearer <access_token>       │
       ▼                                            ▼
┌─────────────┐  3. Verify JWT via JWKS    ┌──────────────────┐
│   Express   │ ──────────────────────────►│ Supabase Postgres│
│   Backend   │  4. Reads roles/permissions│  profiles        │
│             │  via service_role key      │  roles, perms    │
│             │                            │  user_roles      │
└─────────────┘                            └──────────────────┘
```

**Key principle:** `auth.users` is owned by Supabase. Application data lives in `public.profiles` (1:1 with `auth.users`) and the RBAC tables. The backend never stores passwords.

---

## 2. Supabase project setup

1. Create a new project at <https://supabase.com>.
2. Copy **Project URL**, **anon key**, and **service_role key** from *Settings → API*.
3. Enable email auth: *Authentication → Providers → Email*. Toggle "Confirm email" if you want verification.
4. Enable OAuth providers (optional): *Authentication → Providers → Google / GitHub*. Add redirect URL `http://localhost:3000/auth/callback` (and your prod URL).
5. Set the site URL: *Authentication → URL Configuration → Site URL = `http://localhost:3000`*.
6. Apply migrations from `backend/supabase/migrations/` (in numeric order) via the SQL editor or `supabase db push`.

---

## 3. Environment variables

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Project URL, e.g. `https://xxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Public key, used for unauthenticated auth flows |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Bypasses RLS. Server-side only |
| `SUPABASE_JWT_ISSUER` | `${SUPABASE_URL}/auth/v1` |
| `SUPABASE_JWKS_URL` | `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` |
| `SUPABASE_JWT_AUDIENCE` | Defaults to `authenticated` |

> ⚠️ Never expose `SUPABASE_SERVICE_ROLE_KEY` to the frontend. Keep it in `.env`, never commit it.

---

## 4. Auth flows

### 4.1 Signup (email/password)

```
Frontend                      Supabase Auth                  Postgres
   │  signUp(email, password)      │                             │
   │ ────────────────────────────► │                             │
   │                                │ INSERT auth.users           │
   │                                │ ─────────────────────────► │
   │                                │   trigger handle_new_user   │
   │                                │   inserts profiles + role   │
   │                                │ ◄───────────────────────── │
   │ ◄ confirmation email if on ── │                             │
```

The DB trigger `handle_new_user` creates the matching `profiles` row and assigns the default `user` role.

### 4.2 Login

```
signInWithPassword({ email, password })
  → returns { access_token, refresh_token, user }
```

### 4.3 OAuth (Google / GitHub)

```ts
supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: 'http://localhost:3000/auth/callback' }
})
```

Same trigger fires on the new `auth.users` row.

### 4.4 Refresh

`POST /api/auth/refresh` with `{ refresh_token }`. Supabase rotates and returns a new pair.

### 4.5 Password reset

1. `POST /api/auth/forgot-password` with `{ email }` → Supabase emails a reset link.
2. User opens the link, lands on the frontend with a one-time access token.
3. Frontend calls `POST /api/auth/reset-password` with the new password (Bearer the recovery token).

### 4.6 Logout

`POST /api/auth/logout` with the current `Authorization: Bearer <token>`. Calls `supabase.auth.admin.signOut(token)` to revoke.

---

## 5. Frontend usage (supabase-js)

```ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Sign up
await supabase.auth.signUp({ email, password })

// Sign in
const { data } = await supabase.auth.signInWithPassword({ email, password })

// Call backend
await fetch('/api/users/me', {
  headers: { Authorization: `Bearer ${data.session?.access_token}` }
})
```

You can either let the frontend talk to Supabase directly *or* proxy via the backend. Both are supported.

---

## 6. Backend JWT verification

`src/middlewares/auth.middleware.ts` does:

1. Read `Authorization: Bearer <token>`.
2. Verify signature with `jose.createRemoteJWKSet(SUPABASE_JWKS_URL)` — checks `iss`, `aud`, `exp`.
3. Extract `sub` (user id) and `email` from the token.
4. Query `v_user_permissions` to load the user's roles + permissions.
5. Attach `req.user = { id, email, roles[], permissions[] }`.

JWKS keys are cached internally by `jose`, so this is fast.

---

## 7. RBAC usage

**In a route:**

```ts
import { authenticate } from '../middlewares/auth.middleware'
import { requirePermission, requireRole } from '../middlewares/permissions.middleware'

router.get('/users',
  authenticate,
  requirePermission('users:read'),
  userController.list
)

router.delete('/something',
  authenticate,
  requireRole('admin'),
  ...
)
```

**Helpers:**

| Helper | Behavior |
|---|---|
| `requirePermission('a','b')` | Allow only if user has **all** listed permissions |
| `requireAnyPermission('a','b')` | Allow if user has **any** of the listed |
| `requireRole('admin')` | Allow if user has any of the listed roles |

Permission names follow `<resource>:<action>` (e.g. `users:read`, `roles:write`).

---

## 8. Bootstrapping the first admin

After running migrations, no user is an admin yet. To promote yourself:

```sql
-- Replace with your auth.users.id
insert into public.user_roles (user_id, role_id)
select '<your-user-id>', id from public.roles where name = 'admin';
```

Run this once via Supabase SQL editor with your service role.

---

## 9. Common pitfalls

- **RLS blocks reads/writes:** the backend should always use `supabaseAdmin` (service role) for app data, which bypasses RLS. RLS is for direct frontend → DB access only.
- **Token expiry:** access tokens are short-lived (default 1 hour). Use `/api/auth/refresh` or the supabase-js auto-refresh.
- **Email provider not set:** signup/forgot-password emails won't deliver until you configure SMTP under *Authentication → Email Templates → SMTP Settings*.
- **Audience mismatch:** if you configure a custom JWT audience in Supabase, update `SUPABASE_JWT_AUDIENCE` to match.
- **Profile not created:** if `handle_new_user` trigger is missing, signups won't create a `profiles` row. Re-apply migration `0006`.
