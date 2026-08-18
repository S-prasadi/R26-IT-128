/**
 * End-to-end test for the Career Pathway feature.
 *
 * What it does:
 *   1. Health check
 *   2. Register (or bootstrap a confirmed) STUDENT test user
 *   3. Log in -> access token
 *   4. Add a realistic set of user skills (matched against the master catalog)
 *   5. Create a career goal
 *   6. Run the model:  POST /career/predict  -> checks Module B is really working
 *   7. Generate a roadmap from the top path
 *   8. Read back history + roadmap, then print the LOGIN DETAILS for the frontend
 *
 * Run (backend + python modules must be up via ./run-all.sh):
 *   node scripts/test-career-flow.mjs
 *   API_BASE_URL=http://localhost:8081/api node scripts/test-career-flow.mjs
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const apiBaseUrl = process.env.API_BASE_URL || "http://localhost:8081/api";
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// Stable, memorable credentials so you can log into the frontend afterwards.
// Override with TEST_STUDENT_EMAIL / TEST_STUDENT_PASSWORD if you like.
const student = {
  full_name: "Test Student",
  email: process.env.TEST_STUDENT_EMAIL || "student.test@pathwayiq.dev",
  password: process.env.TEST_STUDENT_PASSWORD || "Student@12345",
};

// Skills we'd like this student to have — only the ones present in the master
// catalogue are added. Tuned toward a data / ML leaning student.
const SKILL_WISHLIST = [
  { name: "Python",            proficiency_level: 4, proficiency_label: "Advanced" },
  { name: "SQL",               proficiency_level: 3, proficiency_label: "Intermediate" },
  { name: "Pandas",            proficiency_level: 3, proficiency_label: "Intermediate" },
  { name: "Machine Learning",  proficiency_level: 2, proficiency_label: "Beginner" },
  { name: "JavaScript",        proficiency_level: 3, proficiency_label: "Intermediate" },
  { name: "Git",               proficiency_level: 3, proficiency_label: "Intermediate" },
];

const C = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", c: "\x1b[36m", b: "\x1b[1m", n: "\x1b[0m" };
const ok = (m) => console.log(`${C.g}✓${C.n} ${m}`);
const info = (m) => console.log(`${C.c}•${C.n} ${m}`);
const warn = (m) => console.log(`${C.y}!${C.n} ${m}`);

let token = null;
async function api(path, { method = "GET", body, auth = true } = {}) {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  return { res, json };
}

function fail(step, res, json) {
  console.error(`${C.r}✗ ${step} failed — HTTP ${res?.status}${C.n}`);
  if (json) console.error(JSON.stringify(json, null, 2));
  process.exit(1);
}

async function bootstrapConfirmedUser() {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to bootstrap a confirmed user.");
  }
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const existing = data.users.find((u) => u.email === student.email);
  if (existing) {
    const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password: student.password,
      email_confirm: true,
      user_metadata: { full_name: student.full_name },
    });
    if (upErr) throw upErr;
  } else {
    const { error: crErr } = await supabaseAdmin.auth.admin.createUser({
      email: student.email,
      password: student.password,
      email_confirm: true,
      user_metadata: { full_name: student.full_name },
    });
    if (crErr) throw crErr;
  }
}

// ── 1. Health ────────────────────────────────────────────────────────────────
const health = await api("/health", { auth: false });
if (!health.res.ok) fail("Health check", health.res, health.json);
ok("Backend health check passed");

// ── 2. Register / bootstrap ──────────────────────────────────────────────────
const reg = await api("/auth/register", { method: "POST", auth: false, body: student });
if (reg.res.ok) {
  ok(`Registered student ${student.email}`);
} else {
  const msg = String(reg.json?.message ?? "").toLowerCase();
  if (msg.includes("already") || msg.includes("registered") || msg.includes("rate limit") || msg.includes("confirm")) {
    warn(`Register: ${reg.json?.message ?? "needs bootstrap"} — creating a confirmed user via admin.`);
    await bootstrapConfirmedUser();
    ok("Confirmed test user bootstrapped");
  } else {
    fail("Register", reg.res, reg.json);
  }
}

// ── 3. Login ─────────────────────────────────────────────────────────────────
let login = await api("/auth/login", { method: "POST", auth: false, body: { email: student.email, password: student.password } });
if (!login.res.ok || !login.json?.data?.session?.access_token) {
  // First login can fail if email confirmation is on — bootstrap then retry.
  await bootstrapConfirmedUser();
  login = await api("/auth/login", { method: "POST", auth: false, body: { email: student.email, password: student.password } });
}
token = login.json?.data?.session?.access_token;
if (!token) fail("Login", login.res, login.json);
ok("Logged in — access token acquired");

// ── 4. Add user skills ───────────────────────────────────────────────────────
const master = await api("/skills");
if (!master.res.ok) fail("Fetch master skills", master.res, master.json);
const catalog = master.json?.data ?? [];
const byName = new Map(catalog.map((s) => [String(s.name).toLowerCase(), s]));
info(`Master catalogue has ${catalog.length} skills`);

let added = 0;
for (const want of SKILL_WISHLIST) {
  const match = byName.get(want.name.toLowerCase());
  if (!match) { warn(`Skill not in catalogue, skipping: ${want.name}`); continue; }
  const r = await api("/skills/user", {
    method: "POST",
    body: { skill_id: match.id, proficiency_level: want.proficiency_level, proficiency_label: want.proficiency_label },
  });
  if (r.res.ok) { added++; }
  else if (r.res.status === 409) { info(`Already had skill: ${want.name}`); added++; }
  else warn(`Could not add ${want.name}: HTTP ${r.res.status} ${r.json?.message ?? ""}`);
}
ok(`Student skills ready (${added})`);

// ── 5. Career goal ───────────────────────────────────────────────────────────
const goal = await api("/career/goal", {
  method: "POST",
  body: {
    target_role: "Data Scientist",
    target_industry: "Software",
    target_date: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    notes: "Auto-created by test-career-flow.mjs",
  },
});
if (!goal.res.ok) fail("Create career goal", goal.res, goal.json);
ok(`Career goal set → ${goal.json.data.target_role}`);

// ── 6. Run the model ─────────────────────────────────────────────────────────
const predict = await api("/career/predict", {
  method: "POST",
  body: { current_role: "Student", experience_months: 12, num_projects: 2 },
});
if (!predict.res.ok) fail("Career predict", predict.res, predict.json);
const prediction = predict.json.data;
const paths = prediction?.paths ?? [];

console.log(`\n${C.b}── Model output (POST /career/predict) ──${C.n}`);
if (!paths.length) fail("Career predict returned no paths", predict.res, predict.json);

const MOCK_SIG = ["Senior Software Engineer", "Tech Lead", "DevOps Engineer"];
const looksMock = paths.length === 3 && paths.every((p, i) => (p.career_steps?.[p.career_steps.length - 1]) === MOCK_SIG[i]);
if (looksMock) {
  warn("Prediction matches the MOCK fallback — Module B (port 8002) is probably NOT running.");
} else {
  ok("Real model responded (not the mock fallback)");
}

for (const [i, p] of paths.entries()) {
  const role = p.career_steps?.[p.career_steps.length - 1] ?? "?";
  const rel = p.confidence_relative != null ? `${Math.round(p.confidence_relative * 100)}%` : "—";
  const ready = p.readiness_score != null ? `${Math.round(p.readiness_score * 100)}%` : "—";
  console.log(`  ${C.b}Path ${i + 1}${C.n}: ${role}  |  rel-confidence ${rel}  |  readiness ${ready}`);
  console.log(`     steps: ${(p.career_steps ?? []).join(" → ")}`);
  const ins = (p.skill_insights ?? []).slice(0, 4).map((x) => `${x.skill}[${x.velocity}${x.change_pct ? ` ${x.change_pct > 0 ? "+" : ""}${x.change_pct}%` : ""}]`);
  if (ins.length) console.log(`     gap skills (market): ${ins.join(", ")}`);
}

// Basic correctness assertions
const top = paths[0];
const readyOk = top.readiness_score >= 0 && top.readiness_score <= 1;
const hasGraph = Array.isArray(prediction.graph_nodes) && Array.isArray(prediction.graph_edges);
if (readyOk && hasGraph) ok("Model output well-formed (readiness 0–1, graph present)");
else warn("Model output shape looks off — inspect the payload above");

// ── 7. Generate roadmap from the top path ────────────────────────────────────
const gen = await api("/career/roadmap/generate", { method: "POST", body: { path_id: top.id, prediction_id: prediction.id } });
if (gen.res.ok) {
  ok(`Roadmap generated from top path — ${gen.json.data.created} item(s) created`);
} else if (gen.res.status === 500 && String(gen.json?.message ?? "").includes("career_predictions")) {
  warn("Roadmap/history need the 0024_career_predictions table — apply that migration in Supabase SQL editor.");
} else {
  fail("Roadmap generate", gen.res, gen.json);
}

// ── 7b. Negative cases — these must fail, not silently succeed ─────────────
{
  const badGoal = await api("/career/goal", { method: "POST", body: { target_role: "" } });
  if (badGoal.res.status === 422) ok("Empty target_role correctly rejected (422)");
  else fail("Expected 422 for empty target_role", badGoal.res, badGoal.json);
}
{
  const badPredict = await api("/career/predict", { method: "POST", body: { experience_months: -5 } });
  if (badPredict.res.status === 422) ok("Negative experience_months correctly rejected (422)");
  else fail("Expected 422 for negative experience_months", badPredict.res, badPredict.json);
}
{
  // A path_id that doesn't exist in the snapshot must fail loudly, not
  // silently substitute an unrelated path's skill gaps into the roadmap.
  const staleGen = await api("/career/roadmap/generate", {
    method: "POST",
    body: { path_id: "path-does-not-exist", prediction_id: prediction.id },
  });
  if (staleGen.res.status === 404) ok("Stale/unknown path_id correctly rejected (404), not silently substituted");
  else fail("Expected 404 for an unknown path_id", staleGen.res, staleGen.json);
}
{
  // A no-op delete (nonexistent/not-ours id) should respond cleanly, not 500 —
  // Supabase deletes are idempotent (0 rows affected isn't an error), so this
  // just confirms the route/ownership filter itself doesn't throw.
  const badDelete = await api("/career/predictions/00000000-0000-0000-0000-000000000000", { method: "DELETE" });
  if (badDelete.res.ok) ok("Deleting a nonexistent prediction id responds cleanly (no crash)");
  else fail("Deleting a nonexistent prediction id should not error", badDelete.res, badDelete.json);
}

// ── 8. Read back history + roadmap ───────────────────────────────────────────
const hist = await api("/career/predictions");
if (hist.res.ok) ok(`Prediction history rows: ${hist.json.data.length}`);
const road = await api("/career/roadmap");
if (road.res.ok) ok(`Roadmap items: ${road.json.data.length}`);

// ── Done — print login details ───────────────────────────────────────────────
console.log(`\n${C.g}${C.b}════════════════════════════════════════════════${C.n}`);
console.log(`${C.b}  TEST STUDENT — log in on the frontend${C.n}`);
console.log(`${C.g}${C.b}════════════════════════════════════════════════${C.n}`);
console.log(`  Frontend : http://localhost:3000`);
console.log(`  Email    : ${C.b}${student.email}${C.n}`);
console.log(`  Password : ${C.b}${student.password}${C.n}`);
console.log(`  Then open the ${C.b}Career${C.n} page → step "Career Path" → "Generate My Path".`);
console.log(`${C.g}${C.b}════════════════════════════════════════════════${C.n}\n`);
