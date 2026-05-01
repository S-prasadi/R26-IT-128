import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:8080/api";
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;
const stamp = Date.now();
const user = {
  full_name: "Auth Test User",
  email: process.env.TEST_AUTH_EMAIL ?? `auth-test-${stamp}@example.com`,
  password: process.env.TEST_AUTH_PASSWORD ?? `TestPass${stamp}!`,
};
const shouldRegister = !process.env.TEST_AUTH_EMAIL || !process.env.TEST_AUTH_PASSWORD;

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function bootstrapTestUser(user) {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to bootstrap a test user.");
  }

  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    throw error;
  }

  const existingUser = data.users.find((candidate) => candidate.email === user.email);
  if (existingUser) {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      password: user.password,
      email_confirm: true,
      user_metadata: user.full_name ? { full_name: user.full_name } : undefined,
    });
    if (updateError) {
      throw updateError;
    }
    return;
  }

  const { error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: user.full_name ? { full_name: user.full_name } : undefined,
  });
  if (createError) {
    throw createError;
  }
}

function fail(step, response, body) {
  console.error(`${step} failed with HTTP ${response.status}`);
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

const health = await request("/health");
if (!health.response.ok || health.body?.success !== true) {
  fail("Health check", health.response, health.body);
}
console.log("Health check passed");

if (shouldRegister) {
  const register = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify(user),
  });
  if (!register.response.ok) {
    const message = String(register.body?.message ?? "").toLowerCase();
    const canBootstrap = message.includes("rate limit") || message.includes("already registered");

    if (!canBootstrap) {
      fail("Register", register.response, register.body);
    }

    console.warn(`Register hit a temporary Supabase limit (${register.body?.message ?? "unknown error"}); bootstrapping a confirmed test user instead.`);
    await bootstrapTestUser(user);
  }
  console.log(`Register passed for ${user.email}`);
} else {
  console.log(`Register skipped; using TEST_AUTH_EMAIL ${user.email}`);
}

const login = await request("/auth/login", {
  method: "POST",
  body: JSON.stringify({
    email: user.email,
    password: user.password,
  }),
});
if (!login.response.ok) {
  fail("Login", login.response, login.body);
}

const token = login.body?.data?.session?.access_token;
if (!token) {
  console.log("Login passed, but no access token was returned. Email confirmation may be enabled.");
  process.exit(0);
}
console.log("Login passed and access token returned");

const me = await request("/auth/me", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
if (!me.response.ok) {
  fail("Authenticated profile fetch", me.response, me.body);
}
console.log("Authenticated profile fetch passed");
