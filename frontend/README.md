# Frontend — PathwayIQ Web App

| | |
|---|---|
| **Project** | PathwayIQ (R26-IT-128) |
| **Stack** | Next.js (App Router, Turbopack) · TypeScript · Recharts · Axios · Sonner |
| **Port** | `3000` |
| **API** | Express backend at `:8081` (JWT auth; configured in `.env.local`) |

> ⚠️ Per [AGENTS.md](AGENTS.md): this Next.js version has breaking changes — read the bundled docs in `node_modules/next/dist/docs/` before writing framework-level code.

## Structure

- `src/app/(auth)/` — login/signup/admin auth pages
- `src/app/(dashboard)/` — the product pages (below), shared layout with sidebar + notifications
- `src/services/` — one Axios service per domain (`skill`, `cv`, `interview`, `github`, …) wrapping the backend REST API
- `src/types/index.ts` — all shared TypeScript contracts
- `src/components/piq/` — design-system primitives (`PiqBtn`, `PiqStatCard`, `PiqSpinner`, chart containers, colors)

## Pages & features

### `/dashboard`
Overview stats pulled from all modules.

### `/skill` — Skill Intelligence
- **My Skills** — add skills from the master catalog (category-grouped picker), edit proficiency inline on each card (Beginner/Intermediate/Advanced select), remove skills.
- **GitHub panel** — connect via OAuth, "Verify Skills" confirms proficiency from repo language statistics (✓ GitHub badge + confidence).
- **Forecast** — runs Module A for your skills: predicted weekly job-ad demand cards (honest labels, "of your skills" vs "in market"), an explicit banner when none of your skills have forecast data, early warnings showing real lead-lag results ("global leads local by N weeks, correlation X"), current-vs-predicted demand bar chart, and a 12-week demand line chart with real ISO week labels.
- **Assessments** — logged test scores per skill.
- **Skill Catalog** — browse/add by category.

### `/cv` — CV & Proficiency
- **My CVs** — list with ATS/Match badges; "Analyse" opens the saved analysis directly.
- **CV Editor** — upload (PDF/PNG/JPG/TXT → Module D OCR auto-fills all sections + contact links, with an extraction-preview banner and re-extract), or edit sections manually (experience, education, skills, projects, summary).
- **Analysis** — persisted in the DB and restored on revisit (no re-run needed); "↻ Re-analyse" updates the stored rows. Shows ATS + match gauges, extracted skills, role-blueprint matches with skill gaps, GitHub-verified skills, and improvement suggestions with one-click **Apply** into the editor.
- **GitHub Project Validation** — checks each CV project against your connected GitHub: repo found/owned, fork flag, last-active date, claimed tech verified against repo languages/topics, confidence %.
- **Compare With a Real Job Post** — paste or upload a job ad: skill-match % gauge, matched (✓) and missing (✗) skill chips with live market-demand badges (▲ rising / ▼ falling from Module A), closest role + ML readiness level, AI-tailored summary and per-section suggestions (Apply buttons), ATS keywords to add. Comparisons persist per CV and can be deleted.

### `/interview` — Interview Simulator
- **Setup** — topic, difficulty 1–5, optional document upload (job description/CV) for context-aware question generation.
- **Live Interview** — AI-generated questions; webcam **emotion detector** (proxied through the backend at ~1 fps) with a real emotion timeline per question and an explicit "camera off" state; typed answers get **rubric feedback**: score, five criterion bars, strengths/improvements, and a collapsible model answer.
- **Summary** — server-computed overall + engagement scores (averages of the real per-question results), score-progression line chart, per-type radar chart, full Q&A review with rubric details.
- **History** — past sessions with score trends and per-session detail.

### Other pages
`/career` (goal tracking with CV/skills snapshot), `/progress` (per-module completion + milestones), `/notifications`, `/profile`, `/roles` + `/users` (admin RBAC).

## Conventions

- Services return `ApiResponse<T>`; components read `res.data.data`.
- Inline styles using CSS variables (`var(--accent)`, `var(--surf2)`, …) — match the existing pattern, no CSS modules.
- Charts use Recharts wrapped in `PiqChartContainer` with `PIQ_COLORS`.
- Toasts via `sonner` (`toast.success/error/warning`).

## Running

```bash
cd frontend
npm run dev      # next dev on :3000 (hot reload)
npx tsc --noEmit # type check
# or via the repo root: ./run-all.sh
```
