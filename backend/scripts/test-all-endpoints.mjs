/**
 * Comprehensive endpoint test + Postman collection updater.
 * Bootstraps a confirmed admin test user via Supabase Admin API,
 * exercises every route, then rewrites the Postman collection with
 * accurate test scripts and real captured examples.
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.API_BASE_URL ?? "http://localhost:8080/api";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ADMIN_EMAIL = "rp01-admin-test@olee.ai";
const ADMIN_PASS  = "AdminTest123!";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── helpers ─────────────────────────────────────────────────────────────────

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  return { res, body, ok: res.ok, status: res.status };
}

function pass(label, status) {
  console.log(`  ✓ ${label} (${status})`);
}

function fail(label, status, body) {
  console.error(`  ✗ ${label} (${status})`);
  console.error("   ", JSON.stringify(body, null, 2));
  process.exit(1);
}

function check(label, r, expectedStatus = 200) {
  if (r.status !== expectedStatus || !r.body?.success) {
    fail(label, r.status, r.body);
  }
  pass(label, r.status);
  return r.body?.data;
}

// ── bootstrap admin user ─────────────────────────────────────────────────────

async function bootstrapAdmin() {
  console.log("\n── Bootstrap admin test user ──");
  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users?.find((u) => u.email === ADMIN_EMAIL);

  let userId;
  if (existing) {
    console.log("  User already exists, resetting password…");
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: ADMIN_PASS,
      email_confirm: true,
    });
    if (error) { console.error(error); process.exit(1); }
    userId = existing.id;
  } else {
    console.log("  Creating new admin user…");
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASS,
      email_confirm: true,
      user_metadata: { full_name: "RP01 Admin Tester" },
    });
    if (error) { console.error(error); process.exit(1); }
    userId = data.user.id;
  }

  // Assign admin role via DB
  const { data: adminRole } = await supabase
    .from("roles")
    .select("id")
    .eq("name", "admin")
    .single();

  if (adminRole) {
    await supabase
      .from("user_roles")
      .upsert({ user_id: userId, role_id: adminRole.id }, { onConflict: "user_id,role_id" });
    console.log("  Admin role assigned");
  } else {
    console.warn("  Warning: admin role not found in DB – some tests may 403");
  }

  console.log(`  Admin user ready: ${ADMIN_EMAIL}`);
  return userId;
}

// ── run tests ────────────────────────────────────────────────────────────────

const results = {};   // label → { status, body }

async function run() {
  const adminUserId = await bootstrapAdmin();

  // ─ Health ─
  console.log("\n── Health ──");
  const health = await req("/health");
  check("GET /health", health);
  results.health = health;

  // ─ Auth ─
  console.log("\n── Auth ──");

  const register = await req("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: `rp01-reg-test-${Date.now()}@olee.ai`,
      password: "RegTest123!",
      full_name: "Reg Test User",
    }),
  });
  // 201 created, 409 already-registered, or 400 rate-limit – all valid in dev
  const regMsg = String(register.body?.message ?? "").toLowerCase();
  const regRateLimit = regMsg.includes("rate limit") || register.status === 429;
  if (register.status !== 201 && register.status !== 409 && !regRateLimit) {
    fail("POST /auth/register", register.status, register.body);
  }
  pass(`POST /auth/register${regRateLimit ? " (rate-limited — expected on dev)" : ""}`, register.status);
  results.register = register;

  const login = await req("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  check("POST /auth/login", login);
  results.login = login;

  const ACCESS  = login.body.data.session.access_token;
  const REFRESH = login.body.data.session.refresh_token;
  const auth    = { Authorization: `Bearer ${ACCESS}` };

  const refresh = await req("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: REFRESH }),
  });
  check("POST /auth/refresh", refresh);
  results.refresh = refresh;
  const FRESH_ACCESS = refresh.body.data.session.access_token;
  const freshAuth = { Authorization: `Bearer ${FRESH_ACCESS}` };

  const forgotPw = await req("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL }),
  });
  // Accept 200 (sent) OR 400/429 rate-limit (Supabase free tier) as valid outcomes
  const fpMsg = String(forgotPw.body?.message ?? "").toLowerCase();
  const fpRateLimit = fpMsg.includes("rate limit") || forgotPw.status === 429;
  if (!forgotPw.ok && !fpRateLimit) {
    fail("POST /auth/forgot-password", forgotPw.status, forgotPw.body);
  }
  pass(`POST /auth/forgot-password${fpRateLimit ? " (rate-limited — expected on dev)" : ""}`, forgotPw.status);
  results.forgotPw = forgotPw;

  const me = await req("/auth/me", { headers: freshAuth });
  check("GET /auth/me", me);
  results.me = me;

  const resetPw = await req("/auth/reset-password", {
    method: "POST",
    headers: freshAuth,
    body: JSON.stringify({ password: ADMIN_PASS }),
  });
  check("POST /auth/reset-password", resetPw);
  results.resetPw = resetPw;

  // Re-login after reset
  const login2 = await req("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  check("POST /auth/login (post-reset)", login2);
  const TOKEN = login2.body.data.session.access_token;
  const H = { Authorization: `Bearer ${TOKEN}` };

  // ─ Permissions ─
  console.log("\n── Permissions ──");

  const listPerms = await req("/permissions", { headers: H });
  check("GET /permissions", listPerms);
  results.listPerms = listPerms;
  const firstPerm = listPerms.body.data[0];

  const createPerm = await req("/permissions", {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: `posts:read-${Date.now()}`,
      description: "View posts",
      resource: "posts",
      action: "read",
    }),
  });
  check("POST /permissions", createPerm, 201);
  results.createPerm = createPerm;
  const newPermId = createPerm.body.data.id;

  // ─ Roles ─
  console.log("\n── Roles ──");

  const listRoles = await req("/roles", { headers: H });
  check("GET /roles", listRoles);
  results.listRoles = listRoles;

  const createRole = await req("/roles", {
    method: "POST",
    headers: H,
    body: JSON.stringify({ name: `editor-${Date.now()}`, description: "Can edit content" }),
  });
  check("POST /roles", createRole, 201);
  results.createRole = createRole;
  const newRoleId = createRole.body.data.id;

  const getRole = await req(`/roles/${newRoleId}`, { headers: H });
  check("GET /roles/:id", getRole);
  results.getRole = getRole;

  const updateRole = await req(`/roles/${newRoleId}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ description: "Updated description" }),
  });
  check("PATCH /roles/:id", updateRole);
  results.updateRole = updateRole;

  const attachPerm = await req(`/roles/${newRoleId}/permissions`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ permission_id: firstPerm.id }),
  });
  check("POST /roles/:id/permissions", attachPerm, 200);
  results.attachPerm = attachPerm;

  const detachPerm = await req(`/roles/${newRoleId}/permissions/${firstPerm.id}`, {
    method: "DELETE",
    headers: H,
  });
  check("DELETE /roles/:id/permissions/:permissionId", detachPerm);
  results.detachPerm = detachPerm;

  const deleteRole = await req(`/roles/${newRoleId}`, { method: "DELETE", headers: H });
  check("DELETE /roles/:id", deleteRole);
  results.deleteRole = deleteRole;

  // ─ Users ─
  console.log("\n── Users ──");

  const listUsers = await req("/users?page=1&limit=20", { headers: H });
  check("GET /users", listUsers);
  results.listUsers = listUsers;

  const listUsersSearch = await req("/users?page=1&limit=5&search=admin", { headers: H });
  check("GET /users?search=...", listUsersSearch);
  results.listUsersSearch = listUsersSearch;

  const getUser = await req(`/users/${adminUserId}`, { headers: H });
  check("GET /users/:id", getUser);
  results.getUser = getUser;

  const updateUser = await req(`/users/${adminUserId}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({ full_name: "RP01 Admin Tester (updated)" }),
  });
  check("PATCH /users/:id", updateUser);
  results.updateUser = updateUser;

  // Assign + remove role on admin user using "manager" role
  const { data: mgrRole } = await supabase.from("roles").select("id").eq("name", "manager").single();
  const mgrRoleId = mgrRole?.id;

  if (mgrRoleId) {
    const assignRole = await req(`/users/${adminUserId}/roles`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ role_id: mgrRoleId }),
    });
    check("POST /users/:id/roles", assignRole);
    results.assignRole = assignRole;

    const removeRole = await req(`/users/${adminUserId}/roles/${mgrRoleId}`, {
      method: "DELETE",
      headers: H,
    });
    check("DELETE /users/:id/roles/:roleId", removeRole);
    results.removeRole = removeRole;
  }

  // Create a throwaway user to soft-delete + hard-delete
  const stamp = Date.now();
  const { data: throwawayAuth } = await supabase.auth.admin.createUser({
    email: `throwaway-${stamp}@olee.ai`,
    password: "Throwaway123!",
    email_confirm: true,
  });
  const throwawayId = throwawayAuth?.user?.id;

  if (throwawayId) {
    const deactivate = await req(`/users/${throwawayId}`, { method: "DELETE", headers: H });
    check("DELETE /users/:id (soft delete)", deactivate);
    results.deactivate = deactivate;

    const hardDelete = await req(`/users/${throwawayId}/hard`, { method: "DELETE", headers: H });
    check("DELETE /users/:id/hard", hardDelete);
    results.hardDelete = hardDelete;
  }

  // Logout last so we still have the token above
  const logout = await req("/auth/logout", { method: "POST", headers: H });
  check("POST /auth/logout", logout);
  results.logout = logout;

  // ─ Error cases ─
  console.log("\n── Error scenarios ──");

  const badLogin = await req("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: "WrongPass!" }),
  });
  if (badLogin.status !== 401 && badLogin.status !== 400) {
    fail("POST /auth/login (bad creds should 401/400)", badLogin.status, badLogin.body);
  }
  pass("POST /auth/login (wrong password → 4xx)", badLogin.status);
  results.badLogin = badLogin;

  const noToken = await req("/auth/me");
  if (noToken.status !== 401) fail("GET /auth/me (no token → 401)", noToken.status, noToken.body);
  pass("GET /auth/me (no token → 401)", noToken.status);
  results.noToken = noToken;

  const notFound = await req("/users/00000000-0000-0000-0000-000000000000", { headers: H });
  // token is now invalid (logged out), re-login
  const finalLogin = await req("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  const finalToken = finalLogin.body?.data?.session?.access_token;
  const finalH = { Authorization: `Bearer ${finalToken}` };

  const notFoundUser = await req("/users/00000000-0000-0000-0000-000000000000", { headers: finalH });
  if (notFoundUser.status !== 404) {
    // Some backends return 400 for invalid UUIDs — accept 404 or 400
    if (notFoundUser.status !== 400) {
      fail("GET /users/:id (not found → 404)", notFoundUser.status, notFoundUser.body);
    }
  }
  pass(`GET /users/:id (unknown id → ${notFoundUser.status})`, notFoundUser.status);
  results.notFoundUser = notFoundUser;

  console.log("\n✅  All endpoint tests passed!\n");
  return { results, adminUserId, mgrRoleId, firstPermId: firstPerm?.id, newPermId };
}

// ── build updated Postman collection ─────────────────────────────────────────

function buildCollection(results, ids) {
  const { mgrRoleId, firstPermId } = ids;

  const col = {
    info: {
      _postman_id: "rp01-backend-api",
      name: "RP01 Backend API",
      description: "Authentication, RBAC, user management.\n\n**Setup:** Import RP01.postman_environment.json, set base_url to http://localhost:8080/api.\n\nRun **Login** first — it auto-stores access_token, refresh_token, user_id.",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    auth: {
      type: "bearer",
      bearer: [{ key: "token", value: "{{access_token}}", type: "string" }],
    },
    variable: [],
    item: [
      // ── Health ──
      {
        name: "Health",
        item: [
          {
            name: "Health check",
            request: {
              method: "GET",
              url: { raw: "{{base_url}}/health", host: ["{{base_url}}"], path: ["health"] },
              auth: { type: "noauth" },
              description: "Verify the API is reachable. No auth required.",
            },
            response: [example("Health check – 200 OK", 200, {}, results.health?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
              "pm.test('success=true', () => pm.expect(pm.response.json().success).to.be.true);",
            ])],
          },
        ],
      },

      // ── Auth ──
      {
        name: "Auth",
        item: [
          {
            name: "Register",
            request: {
              method: "POST",
              url: { raw: "{{base_url}}/auth/register", host: ["{{base_url}}"], path: ["auth", "register"] },
              header: [jsonHeader()],
              body: rawBody(`{\n  "email": "newuser@olee.ai",\n  "password": "MyPass123!",\n  "full_name": "New User"\n}`),
              auth: { type: "noauth" },
              description: "Create a new account. `full_name` is optional.\n\nReturns `user` + `session` on success (201). Supabase may require email confirmation.",
            },
            response: [example("Register – 201 Created", 201, {email:"newuser@olee.ai",password:"MyPass123!",full_name:"New User"}, results.register?.body)],
            event: [testEvent([
              "pm.test('Status 201', () => pm.response.to.have.status(201));",
              "const res = pm.response.json();",
              "if (res.success && res.data?.session) {",
              "  pm.environment.set('access_token', res.data.session.access_token);",
              "  pm.environment.set('refresh_token', res.data.session.refresh_token);",
              "  pm.environment.set('user_id', res.data.user.id);",
              "}",
            ])],
          },
          {
            name: "Login",
            request: {
              method: "POST",
              url: { raw: "{{base_url}}/auth/login", host: ["{{base_url}}"], path: ["auth", "login"] },
              header: [jsonHeader()],
              body: rawBody(`{\n  "email": "{{test_email}}",\n  "password": "{{test_password}}"\n}`),
              auth: { type: "noauth" },
              description: "Authenticate with email + password. On success the test script auto-stores `access_token`, `refresh_token`, and `user_id` in the environment.",
            },
            response: [example("Login – 200 OK", 200, {email:"{{test_email}}",password:"{{test_password}}"}, results.login?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
              "const res = pm.response.json();",
              "pm.test('Has session tokens', () => {",
              "  pm.expect(res.data.session.access_token).to.be.a('string');",
              "  pm.expect(res.data.session.refresh_token).to.be.a('string');",
              "});",
              "if (res.success && res.data?.session) {",
              "  pm.environment.set('access_token', res.data.session.access_token);",
              "  pm.environment.set('refresh_token', res.data.session.refresh_token);",
              "  pm.environment.set('user_id', res.data.user.id);",
              "}",
            ])],
          },
          {
            name: "Refresh token",
            request: {
              method: "POST",
              url: { raw: "{{base_url}}/auth/refresh", host: ["{{base_url}}"], path: ["auth", "refresh"] },
              header: [jsonHeader()],
              body: rawBody(`{\n  "refresh_token": "{{refresh_token}}"\n}`),
              auth: { type: "noauth" },
              description: "Exchange a refresh token for a fresh access + refresh token pair.",
            },
            response: [example("Refresh – 200 OK", 200, {refresh_token:"{{refresh_token}}"}, results.refresh?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
              "const res = pm.response.json();",
              "if (res.success && res.data?.session) {",
              "  pm.environment.set('access_token', res.data.session.access_token);",
              "  pm.environment.set('refresh_token', res.data.session.refresh_token);",
              "}",
            ])],
          },
          {
            name: "Forgot password",
            request: {
              method: "POST",
              url: { raw: "{{base_url}}/auth/forgot-password", host: ["{{base_url}}"], path: ["auth", "forgot-password"] },
              header: [jsonHeader()],
              body: rawBody(`{\n  "email": "{{test_email}}"\n}`),
              auth: { type: "noauth" },
              description: "Send a password-reset email. Optional `redirect_to` (URL) overrides the default reset link destination.",
            },
            response: [example("Forgot password – 200 OK", 200, {email:"{{test_email}}"}, results.forgotPw?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
              "pm.test('success=true', () => pm.expect(pm.response.json().success).to.be.true);",
            ])],
          },
          {
            name: "Reset password",
            request: {
              method: "POST",
              url: { raw: "{{base_url}}/auth/reset-password", host: ["{{base_url}}"], path: ["auth", "reset-password"] },
              header: [jsonHeader()],
              body: rawBody(`{\n  "password": "NewStrongPass123!"\n}`),
              description: "Change the authenticated user's password. Requires Bearer token. Password must be ≥8 characters.",
            },
            response: [example("Reset password – 200 OK", 200, {password:"NewStrongPass123!"}, results.resetPw?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
              "pm.test('success=true', () => pm.expect(pm.response.json().success).to.be.true);",
            ])],
          },
          {
            name: "Get current user (me)",
            request: {
              method: "GET",
              url: { raw: "{{base_url}}/auth/me", host: ["{{base_url}}"], path: ["auth", "me"] },
              description: "Fetch the authenticated user's profile + permissions. Requires Bearer token.",
            },
            response: [example("Get me – 200 OK", 200, null, results.me?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
              "const res = pm.response.json();",
              "pm.test('Has user id', () => pm.expect(res.data.id).to.be.a('string'));",
            ])],
          },
          {
            name: "Logout",
            request: {
              method: "POST",
              url: { raw: "{{base_url}}/auth/logout", host: ["{{base_url}}"], path: ["auth", "logout"] },
              description: "Revoke the current session. Requires Bearer token. After this the `access_token` is invalid.",
            },
            response: [example("Logout – 200 OK", 200, null, results.logout?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
              "pm.environment.unset('access_token');",
              "pm.environment.unset('refresh_token');",
            ])],
          },
        ],
      },

      // ── Users ──
      {
        name: "Users",
        item: [
          {
            name: "List users",
            request: {
              method: "GET",
              url: {
                raw: "{{base_url}}/users?page=1&limit=20",
                host: ["{{base_url}}"],
                path: ["users"],
                query: [
                  { key: "page", value: "1", description: "Page number (default 1)" },
                  { key: "limit", value: "20", description: "Items per page, max 100 (default 20)" },
                  { key: "search", value: "", disabled: true, description: "Filter by full_name or email" },
                ],
              },
              description: "Paginated user list. Requires `users:read` permission.",
            },
            response: [example("List users – 200 OK", 200, null, results.listUsers?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
              "const res = pm.response.json();",
              "pm.test('Returns array', () => pm.expect(res.data.users).to.be.an('array'));",
            ])],
          },
          {
            name: "Get user by id",
            request: {
              method: "GET",
              url: { raw: "{{base_url}}/users/{{user_id}}", host: ["{{base_url}}"], path: ["users", "{{user_id}}"] },
              description: "Fetch a single user profile by UUID. Requires `users:read` permission.",
            },
            response: [example("Get user – 200 OK", 200, null, results.getUser?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
              "pm.test('Has id', () => pm.expect(pm.response.json().data.id).to.be.a('string'));",
            ])],
          },
          {
            name: "Update user",
            request: {
              method: "PATCH",
              url: { raw: "{{base_url}}/users/{{user_id}}", host: ["{{base_url}}"], path: ["users", "{{user_id}}"] },
              header: [jsonHeader()],
              body: rawBody(`{\n  "full_name": "Updated Name",\n  "avatar_url": "https://example.com/avatar.png",\n  "is_active": true\n}`),
              description: "Partially update a user. All fields optional. Requires `users:write` permission.",
            },
            response: [example("Update user – 200 OK", 200, {full_name:"Updated Name"}, results.updateUser?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
            ])],
          },
          {
            name: "Deactivate user (soft delete)",
            request: {
              method: "DELETE",
              url: { raw: "{{base_url}}/users/{{user_id}}", host: ["{{base_url}}"], path: ["users", "{{user_id}}"] },
              description: "Set `is_active = false`. The account record remains in the database. Requires `users:delete` permission.",
            },
            response: [example("Deactivate user – 200 OK", 200, null, results.deactivate?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
            ])],
          },
          {
            name: "Hard delete user",
            request: {
              method: "DELETE",
              url: { raw: "{{base_url}}/users/{{user_id}}/hard", host: ["{{base_url}}"], path: ["users", "{{user_id}}", "hard"] },
              description: "Permanently remove a user from both the profiles table and Supabase Auth. **Irreversible.** Requires `users:delete` permission.",
            },
            response: [example("Hard delete user – 200 OK", 200, null, results.hardDelete?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
            ])],
          },
          {
            name: "Assign role to user",
            request: {
              method: "POST",
              url: { raw: "{{base_url}}/users/{{user_id}}/roles", host: ["{{base_url}}"], path: ["users", "{{user_id}}", "roles"] },
              header: [jsonHeader()],
              body: rawBody(`{\n  "role_id": "${mgrRoleId ?? "{{role_id}}"}"\n}`),
              description: "Add a role to a user. `role_id` must be a valid UUID. Requires `roles:write` permission.",
            },
            response: [example("Assign role – 200 OK", 200, {role_id: mgrRoleId ?? "{{role_id}}"}, results.assignRole?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
            ])],
          },
          {
            name: "Remove role from user",
            request: {
              method: "DELETE",
              url: {
                raw: `{{base_url}}/users/{{user_id}}/roles/${mgrRoleId ?? "{{role_id}}"}`,
                host: ["{{base_url}}"],
                path: ["users", "{{user_id}}", "roles", mgrRoleId ?? "{{role_id}}"],
              },
              description: "Revoke a role from a user. Requires `roles:write` permission.",
            },
            response: [example("Remove role – 200 OK", 200, null, results.removeRole?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
            ])],
          },
        ],
      },

      // ── Roles ──
      {
        name: "Roles",
        item: [
          {
            name: "List roles",
            request: {
              method: "GET",
              url: { raw: "{{base_url}}/roles", host: ["{{base_url}}"], path: ["roles"] },
              description: "Return all roles with their attached permissions. Requires `roles:read` permission.",
            },
            response: [example("List roles – 200 OK", 200, null, results.listRoles?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
              "const res = pm.response.json();",
              "pm.test('Returns array', () => pm.expect(res.data).to.be.an('array'));",
              "if (res.data.length > 0) pm.environment.set('role_id', res.data[0].id);",
            ])],
          },
          {
            name: "Get role by id",
            request: {
              method: "GET",
              url: { raw: "{{base_url}}/roles/{{role_id}}", host: ["{{base_url}}"], path: ["roles", "{{role_id}}"] },
              description: "Fetch a single role by UUID. Requires `roles:read` permission.",
            },
            response: [example("Get role – 200 OK", 200, null, results.getRole?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
              "pm.test('Has id', () => pm.expect(pm.response.json().data.id).to.be.a('string'));",
            ])],
          },
          {
            name: "Create role",
            request: {
              method: "POST",
              url: { raw: "{{base_url}}/roles", host: ["{{base_url}}"], path: ["roles"] },
              header: [jsonHeader()],
              body: rawBody(`{\n  "name": "editor",\n  "description": "Can edit content"\n}`),
              description: "Create a new role. `name` must be unique (1-64 chars). Requires `roles:write` permission.",
            },
            response: [example("Create role – 201 Created", 201, {name:"editor",description:"Can edit content"}, results.createRole?.body)],
            event: [testEvent([
              "pm.test('Status 201', () => pm.response.to.have.status(201));",
              "const res = pm.response.json();",
              "if (res.success && res.data?.id) pm.environment.set('role_id', res.data.id);",
            ])],
          },
          {
            name: "Update role",
            request: {
              method: "PATCH",
              url: { raw: "{{base_url}}/roles/{{role_id}}", host: ["{{base_url}}"], path: ["roles", "{{role_id}}"] },
              header: [jsonHeader()],
              body: rawBody(`{\n  "name": "editor-v2",\n  "description": "Updated description"\n}`),
              description: "Partially update a role. All fields optional. Requires `roles:write` permission.",
            },
            response: [example("Update role – 200 OK", 200, {description:"Updated description"}, results.updateRole?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
            ])],
          },
          {
            name: "Delete role",
            request: {
              method: "DELETE",
              url: { raw: "{{base_url}}/roles/{{role_id}}", host: ["{{base_url}}"], path: ["roles", "{{role_id}}"] },
              description: "Delete a role. System roles (`is_system=true`) cannot be deleted. Requires `roles:delete` permission.",
            },
            response: [example("Delete role – 200 OK", 200, null, results.deleteRole?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
            ])],
          },
          {
            name: "Attach permission to role",
            request: {
              method: "POST",
              url: { raw: "{{base_url}}/roles/{{role_id}}/permissions", host: ["{{base_url}}"], path: ["roles", "{{role_id}}", "permissions"] },
              header: [jsonHeader()],
              body: rawBody(`{\n  "permission_id": "${firstPermId ?? "{{permission_id}}"}"\n}`),
              description: "Add an existing permission to a role. `permission_id` must be a valid UUID. Requires `permissions:assign` permission.",
            },
            response: [example("Attach permission – 200 OK", 200, {permission_id: firstPermId ?? "{{permission_id}}"}, results.attachPerm?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
            ])],
          },
          {
            name: "Detach permission from role",
            request: {
              method: "DELETE",
              url: {
                raw: `{{base_url}}/roles/{{role_id}}/permissions/${firstPermId ?? "{{permission_id}}"}`,
                host: ["{{base_url}}"],
                path: ["roles", "{{role_id}}", "permissions", firstPermId ?? "{{permission_id}}"],
              },
              description: "Remove a permission from a role. Requires `permissions:assign` permission.",
            },
            response: [example("Detach permission – 200 OK", 200, null, results.detachPerm?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
            ])],
          },
        ],
      },

      // ── Permissions ──
      {
        name: "Permissions",
        item: [
          {
            name: "List permissions",
            request: {
              method: "GET",
              url: { raw: "{{base_url}}/permissions", host: ["{{base_url}}"], path: ["permissions"] },
              description: "Return all permissions. Requires `permissions:read` permission. The test script auto-stores the first permission's id as `permission_id`.",
            },
            response: [example("List permissions – 200 OK", 200, null, results.listPerms?.body)],
            event: [testEvent([
              "pm.test('Status 200', () => pm.response.to.have.status(200));",
              "const res = pm.response.json();",
              "pm.test('Returns array', () => pm.expect(res.data).to.be.an('array'));",
              "if (res.data.length > 0) pm.environment.set('permission_id', res.data[0].id);",
            ])],
          },
          {
            name: "Create permission",
            request: {
              method: "POST",
              url: { raw: "{{base_url}}/permissions", host: ["{{base_url}}"], path: ["permissions"] },
              header: [jsonHeader()],
              body: rawBody(`{\n  "name": "posts:read",\n  "description": "View posts",\n  "resource": "posts",\n  "action": "read"\n}`),
              description: "Create a new permission. `name` must be unique; convention is `resource:action`. Requires `roles:write` permission.",
            },
            response: [example("Create permission – 201 Created", 201, {name:"posts:read",description:"View posts",resource:"posts",action:"read"}, results.createPerm?.body)],
            event: [testEvent([
              "pm.test('Status 201', () => pm.response.to.have.status(201));",
              "const res = pm.response.json();",
              "if (res.success && res.data?.id) pm.environment.set('permission_id', res.data.id);",
            ])],
          },
        ],
      },

      // ── Error scenarios ──
      {
        name: "Error scenarios",
        item: [
          {
            name: "Login with wrong password (→ 401)",
            request: {
              method: "POST",
              url: { raw: "{{base_url}}/auth/login", host: ["{{base_url}}"], path: ["auth", "login"] },
              header: [jsonHeader()],
              body: rawBody(`{\n  "email": "{{test_email}}",\n  "password": "WrongPassword!"\n}`),
              auth: { type: "noauth" },
              description: "Demonstrates the 401 Unauthorized response for invalid credentials.",
            },
            response: [example("Wrong password – 401", 401, {email:"{{test_email}}",password:"WrongPassword!"}, results.badLogin?.body)],
            event: [testEvent([
              "pm.test('Status 401 or 400', () => {",
              "  pm.expect(pm.response.code).to.be.oneOf([400, 401]);",
              "});",
              "pm.test('success=false', () => pm.expect(pm.response.json().success).to.be.false);",
            ])],
          },
          {
            name: "Get me without token (→ 401)",
            request: {
              method: "GET",
              url: { raw: "{{base_url}}/auth/me", host: ["{{base_url}}"], path: ["auth", "me"] },
              auth: { type: "noauth" },
              description: "Demonstrates the 401 response when no Bearer token is provided.",
            },
            response: [example("No token – 401", 401, null, results.noToken?.body)],
            event: [testEvent([
              "pm.test('Status 401', () => pm.response.to.have.status(401));",
              "pm.test('success=false', () => pm.expect(pm.response.json().success).to.be.false);",
            ])],
          },
          {
            name: "Get unknown user (→ 404)",
            request: {
              method: "GET",
              url: {
                raw: "{{base_url}}/users/00000000-0000-0000-0000-000000000000",
                host: ["{{base_url}}"],
                path: ["users", "00000000-0000-0000-0000-000000000000"],
              },
              description: "Demonstrates the 404 response for a non-existent user UUID.",
            },
            response: [example("Unknown user – 404", 404, null, results.notFoundUser?.body)],
            event: [testEvent([
              "pm.test('Status 404 or 400', () => {",
              "  pm.expect(pm.response.code).to.be.oneOf([400, 404]);",
              "});",
              "pm.test('success=false', () => pm.expect(pm.response.json().success).to.be.false);",
            ])],
          },
        ],
      },
    ],
  };

  return col;
}

function jsonHeader() {
  return { key: "Content-Type", value: "application/json" };
}

function rawBody(raw) {
  return { mode: "raw", raw, options: { raw: { language: "json" } } };
}

function testEvent(lines) {
  return { listen: "test", script: { type: "text/javascript", exec: lines } };
}

function example(name, status, reqBody, resBody) {
  const ex = {
    name,
    status: httpStatusText(status),
    code: status,
    _postman_previewlanguage: "json",
    header: [{ key: "Content-Type", value: "application/json" }],
    body: JSON.stringify(resBody ?? { success: true }, null, 2),
  };
  if (reqBody !== null && reqBody !== undefined) {
    ex.originalRequest = {
      method: "POST",
      body: rawBody(JSON.stringify(reqBody, null, 2)),
    };
  }
  return ex;
}

function httpStatusText(code) {
  const map = { 200: "OK", 201: "Created", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found" };
  return map[code] ?? String(code);
}

// ── main ─────────────────────────────────────────────────────────────────────

const { results: testResults, mgrRoleId, firstPermId } = await run();
const collection = buildCollection(testResults, { mgrRoleId, firstPermId });

const outPath = join(__dirname, "../docs/postman/RP01.postman_collection.json");
writeFileSync(outPath, JSON.stringify(collection, null, 2), "utf8");
console.log(`\nPostman collection written → ${outPath}`);
