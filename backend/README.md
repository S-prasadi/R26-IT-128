# Backend — Express API Gateway

| | |
|---|---|
| **Project** | PathwayIQ (R26-IT-128) |
| **Stack** | Node.js · Express 5 · TypeScript · Supabase (Postgres + Auth + Storage) · Zod |
| **Port** | `8081` |
| **Full API reference** | [docs/API.md](docs/API.md) · Postman collection in [docs/postman/](docs/postman/) |

## What this component does

The backend is the single gateway between the Next.js frontend, the Supabase database, and the three Python AI microservices. It owns **authentication, authorization, persistence, and orchestration** — the Python modules stay stateless.

## Architecture

```
Frontend (:3000) ──JWT──▶ Express (:8081) ──▶ Supabase (Postgres + Storage, RLS)
                                   │
                                   ├──▶ Module A (:8001)  skill demand forecasts
                                   ├──▶ Module C (:8003)  CV analysis / job-post compare
                                   └──▶ Module D (:8004)  LLM + OCR + emotion detection
```

- **Auth** — Supabase JWT verified via JWKS (`auth.middleware.ts`); role/permission checks per route (`requirePermission`, e.g. `skills:read`, `cv:write`).
- **Validation** — Zod schemas per module in `src/validations/`.
- **Python calls** — `src/services/python.service.ts` (`callPython`): 60 s timeout; HTTP errors propagate with the real reason, network errors fall back to a mock object so a dead module degrades instead of breaking the app.
- **Layout** — `routes → controllers → services`, one file per domain in each layer.

## Route groups (`/api/...`)

| Mount | Highlights |
|---|---|
| `/auth` | Login/session glue over Supabase auth |
| `/users`, `/roles`, `/permissions` | Admin user/role/permission management (RBAC tables, migrations 0003–0007, 0016) |
| `/skills` | Master catalog, user skills CRUD (incl. proficiency updates), assessments, **`POST /skills/forecast`** → Module A with per-user early-warning notification dedupe (`skill_alert_history`, migration 0022) |
| `/cv` | CV CRUD + sections, file upload to Supabase Storage + **Module D extraction**, **`/analyze`** via Module C, **`/verify-projects`** (GitHub cross-check), **`/job-post`** attach & compare (Modules C + A + D), job-post delete |
| `/interviews` | Sessions/questions/responses, **server-computed session scores**, document extraction for context-aware questions, **`/predict-emotion`** proxy to Module D |
| `/career` | Career goal management (skills snapshot links to CV, migration 0020) |
| `/progress` | Per-module completion tracking + milestones |
| `/notifications` | In-app notifications (list/unread/mark-read) |
| `/github` | OAuth connect/disconnect/status, **skill verification** from repo languages, repo data for CV project validation |

## Key flows

**CV upload → analysis** — upload stores the file in the `cv-files` bucket, Module D OCRs it, sections auto-save to `cv_sections`, and the raw text is kept in `cvs.extracted_text`. Analysis serializes the **current sections** (so edits change the score), sends `cv_text` to Module C, and persists ATS score, skills, job matches (`cv_job_matches`), and suggestions (`cv_suggestions`). Saved analyses are returned with the CV so the UI shows results without re-running.

**Job-post comparison** — `POST /cv/:id/job-post` accepts pasted text or a file (OCR'd by Module D), then: Module C `/compare-job` (match %, gaps, readiness) → Module A `/forecast` (demand annotation per gap skill) → Module D `/tailor-cv` (LLM tailoring) → stored in `cv_job_posts`.

**GitHub project validation** — `POST /cv/:id/verify-projects` matches CV project entries to the user's repos (URL ownership, fuzzy name match, tech-stack vs repo languages/topics with framework→language mapping) and stores the verdict in `cvs.project_verification`.

**Interview session** — create session → Module D generates questions (document-aware) → each answer goes to Module D **with the question context** and the real emotion timeline → rubric analysis stored per response (`analysis` jsonb, migration 0021) → `endSession` computes overall/engagement scores **server-side** from the stored responses (clients cannot inject scores).

**Forecast notifications** — early-warning alerts are recorded per user+skill with a unique constraint; only newly inserted rows trigger notifications, so re-running a forecast never spams.

## Environment (`.env`)

| Group | Variables |
|---|---|
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWKS_URL` |
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (OAuth app — callback `http://localhost:8081/api/github/callback`), `GITHUB_TOKEN` (GitHub Models token, shared with Module D via `run-all.sh`) |
| Python services | `PYTHON_MODULE_A_URL` … `PYTHON_MODULE_D_URL` (default `http://localhost:800{1,3,4}`) |
| Misc | `PORT`, `CORS_ORIGIN`, `FRONTEND_URL`, `NODE_ENV` |

Blank values in `.env` fall back to the localhost defaults (`env.ts` uses `||`, not `??`).

## Database

Migrations live in `supabase/migrations/` (0001–0023) and are applied via the Supabase SQL editor. All user-facing tables have **row-level security**; the backend uses the service-role client and enforces ownership in queries. Recent additions: `0021` interview response `analysis`, `0022` `skill_alert_history`, `0023` `cvs.extracted_text` + `cvs.project_verification` + `cv_job_posts`.

## Running

```bash
cd backend
npm run dev          # nodemon + ts-node on :8081 (auto-restarts on src changes)
npm run type-check   # tsc --noEmit
# or via the repo root: ./run-all.sh
```
