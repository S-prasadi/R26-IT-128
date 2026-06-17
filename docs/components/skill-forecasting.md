# Skill Forecasting (Module A)

> *"Which skills should I learn next?"*
> The Skill Forecaster looks at how popular different tech skills have been over time and predicts which ones will be **hot in the coming weeks** — and warns you about skills that are blowing up globally before they reach Sri Lanka.

New here? Read [the project overview](00-project-overview.md) first — it explains how the frontend, backend, database, and Python brains fit together. This document zooms into just the Skill module.

---

## Table of contents

1. [What this module does](#1-what-this-module-does)
2. [Feature list](#2-feature-list)
3. [The journey of your data (step by step)](#3-the-journey-of-your-data-step-by-step)
4. [How the pieces talk (diagram)](#4-how-the-pieces-talk-diagram)
5. [Frontend side](#5-frontend-side)
6. [Backend side](#6-backend-side)
7. [Routes and endpoints](#7-routes-and-endpoints)
8. [What you send and what you get back (examples)](#8-what-you-send-and-what-you-get-back-examples)
9. [The database tables it uses](#9-the-database-tables-it-uses)
10. [Validation: what gets checked](#10-validation-what-gets-checked)
11. [Error handling](#11-error-handling)
12. [Security](#12-security)
13. [What happens if the AI service is off](#13-what-happens-if-the-ai-service-is-off)
14. [A real example, start to finish](#14-a-real-example-start-to-finish)
15. [Sequence diagram (text)](#15-sequence-diagram-text)
16. [Where it lives in the code](#16-where-it-lives-in-the-code)

---

## 1. What this module does

Imagine you could watch the demand for "React", "Rust", "LangChain" and hundreds of other skills rise and fall like stock prices. Module A does exactly that.

It has studied roughly **2.5 years of weekly skill-demand data** gathered from Google Trends and job sites — both **global** and **Sri Lankan (local)** — and uses time-series forecasting maths (**ARIMA** and **Exponential Smoothing**) to **predict demand for the next 12 weeks**.

Its three core jobs:

- **Forecasting** — for each skill, predict whether demand is *rising*, *stable*, or *falling*, and by how much.
- **Lead-lag detection** — using statistics (cross-correlation + Granger causality), it spots skills that trend **globally before they reach the local market**. That gap is the "early warning."
- **Serving the results** — the heavy maths is done ahead of time and saved into CSV/model files; at request time the service just reads those files and answers quickly.

In plain terms: the user asks *"what's hot?"* and Module A answers with a ranked list, a set of early warnings, and a 12-week chart.

---

## 2. Feature list

| Feature | What you do | What you see |
|---------|-------------|--------------|
| **Master skills catalog** | Open the Skill page | A searchable list of all known skills, grouped by category |
| **Track a skill** | Add a skill to your profile and set a level (1–5) | The skill appears in "My Skills" |
| **Update a skill** | Change a tracked skill's level/label | The updated level is saved |
| **Remove a skill** | Delete a tracked skill | It disappears from "My Skills" |
| **Log a self-assessment** | Record a score (0–100) for a skill | Your assessment history grows |
| **Run a forecast** | Click "Run Forecast" | A ranked list of trending skills (rising/stable/falling, % change) |
| **Personalised forecast** | Run a forecast *with* your tracked skills | The list focuses on the skills you care about |
| **Early-warning alerts** | (Automatic when you forecast) | Skills heating up globally that will likely spike locally soon |
| **Skill notifications** | (Automatic) | Each *new* early warning becomes a notification in your bell |
| **12-week chart** | Run a forecast | A line graph predicting demand for the top skills |

---

## 3. The journey of your data (step by step)

Here's what happens when a user clicks **"Run Forecast"** on the Skill page:

1. **You click "Run Forecast."** The Skill page optionally includes the list of skills you're already tracking.

2. **The page sends your request to the backend.** It calls `POST /api/skills/forecast`, attaching your **login token** so the backend knows it's you. The body is tiny: `{ "skills": ["React", "Python"] }` (or empty for an overall forecast).

3. **The backend checks the wristband.** The `authenticate` middleware confirms your token is valid; the `requirePermission("skills:read")` middleware confirms you're allowed to read skills.

4. **The backend validates the request.** A small rule (Zod schema) checks that `skills`, if present, is an array of strings.

5. **The backend asks the Skill brain (Module A).** Inside `runForecast()`, it calls `callPython()` which sends a `POST` to `http://localhost:8001/forecast` with `{ user_id, skills }`.

6. **Module A does the smart work.** It reads its pre-computed forecast files (`forecasts.csv`, `lead_lag_analysis.csv`) and assembles three things: the trending list, the early warnings, and the 12-week chart.

7. **Module A sends the answer back** to the backend: `{ trending, early_warnings, forecast_chart }`.

8. **The backend turns warnings into notifications — without spamming.** For each early-warning skill it does an *upsert* into the `skill_alert_history` table. Because of a unique rule on `(user_id, skill)`, only **genuinely new** warnings come back — so re-running the forecast never re-sends the same alert. For each new one, it creates a "Skill Alert" notification.

9. **The backend sends everything to the page**, which draws the trending cards, the early-warning list, and the line chart. Done!

---

## 4. How the pieces talk (diagram)

```
You (browser)
  │  click "Run Forecast"
  ▼
Skill page  ───────────────►  Backend (Express :8081)
(Next.js)    POST                 │
             /api/skills/forecast  │ 1. authenticate (valid token?)
             { skills: [...] }     │ 2. requirePermission("skills:read")
                                   │ 3. validate body
                                   │ 4. POST http://localhost:8001/forecast
                                   ▼
                            Module A (FastAPI :8001)  ── reads forecasts.csv + lead_lag_analysis.csv
                                   │
                                   │  { trending, early_warnings, forecast_chart }
                                   ▼
                            Backend  ── upsert skill_alert_history → create notifications (DB)
                                   │
You (browser)  ◄───────────────────┘  { success, data: { trending, early_warnings, forecast_chart } }
  │  charts + cards + alerts appear
  ▼
Done
```

---

## 5. Frontend side

- **The page:** `frontend/src/app/(dashboard)/skill/page.tsx`. It shows the master skill catalog, the user's tracked skills, and a "Forecast" area with cards and a chart.
- **State management:** the page keeps React state for the list of skills, the user's tracked skills, the latest forecast result, and a loading flag while the forecast runs.
- **Forms:** adding/updating a skill uses simple form inputs (skill choice + proficiency level). "Run Forecast" is just a button.
- **Charts:** the 12-week `forecast_chart` is drawn with Recharts (a charting library).
- **API calls:** all calls go through `frontend/src/services/skill.service.ts`, which uses the shared Axios client (it automatically attaches the login token to every request). Typical calls: list master skills, list/add/update/delete user skills, log an assessment, and run the forecast.

---

## 6. Backend side

The chain is always **route → controller → service → (database and/or Python)**:

- **Routes** (`skill.routes.ts`) define the addresses and attach the guards (`authenticate`, `requirePermission`, `validate`).
- **Controller** (`skill.controller.ts`) receives the request, pulls out the user id and body, and calls the service.
- **Service** (`skill.service.ts`) holds the real logic:
  - `listMasterSkills()`, `getUserSkills()`, `addUserSkill()`, `updateUserSkill()`, `deleteUserSkill()` — straight database reads/writes via the Supabase admin client.
  - `getAssessments()`, `logAssessment()` — read/write the `skill_assessments` table.
  - `runForecast()` — the star of the module: calls Module A, records alerts, sends notifications, returns the forecast.
- **The Python bridge** (`python.service.ts`) provides `callPython(url, body, fallback)` — if the Python service can't be reached, it returns the `fallback` (mock data) instead of crashing.

---

## 7. Routes and endpoints

All routes live under `/api/skills` and **require a valid login token**. The permission needed is shown in the last column.

| Method | Path | What it does | Permission |
|--------|------|--------------|------------|
| GET | `/api/skills` | List the master skills catalog | `skills:read` |
| GET | `/api/skills/user` | List the current user's tracked skills | `skills:read` |
| POST | `/api/skills/user` | Add a skill to the user's profile | `skills:write` |
| PATCH | `/api/skills/user/:skillId` | Update a tracked skill's level/label | `skills:write` |
| DELETE | `/api/skills/user/:skillId` | Remove a tracked skill | `skills:write` |
| GET | `/api/skills/assessments` | List the user's self-assessments (optional `?skillId=`) | `skills:read` |
| POST | `/api/skills/user/:skillId/assess` | Log a self-assessment score | `skills:write` |
| **POST** | **`/api/skills/forecast`** | **Run the demand forecast (calls Module A)** | `skills:read` |

**Module A's own endpoint** (called by the backend, not the browser): `POST http://localhost:8001/forecast` with body `{ user_id, skills }`.

---

## 8. What you send and what you get back (examples)

**Request** — `POST /api/skills/forecast`

```json
{ "skills": ["React", "Python"] }
```

**Successful response** (every backend success looks like `{ success, message, data }`):

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "trending": [
      { "skill": "React",  "rank": 1, "predicted_weekly_demand": 92, "current_weekly_demand": 85, "velocity": "rising", "change_pct": 8 },
      { "skill": "Python", "rank": 4, "predicted_weekly_demand": 88, "current_weekly_demand": 83, "velocity": "rising", "change_pct": 6 }
    ],
    "early_warnings": [
      { "skill": "LangChain", "weeks_ahead": 17, "correlation": 0.89, "interpretation": "Global leads local by 17w" }
    ],
    "forecast_chart": [
      { "week": "W1", "React": 80, "Python": 70 },
      { "week": "W2", "React": 82, "Python": 71 }
    ]
  }
}
```

**Error response** (e.g. token expired) — every backend error looks like `{ success: false, message }`:

```json
{ "success": false, "message": "Unauthorized" }
```

---

## 9. The database tables it uses

| Table | What it stores | Key fields |
|-------|----------------|-----------|
| `skills` | The master catalog of all skills | `id`, `name` (unique), `category`, `description` |
| `user_skills` | Skills a user is tracking | `id`, `user_id`, `skill_id`, `proficiency_level` (1–5), `proficiency_label` (Beginner/Intermediate/Advanced), `github_verified`, `confidence_score` |
| `skill_assessments` | Self-assessment scores over time | `id`, `user_id`, `skill_id`, `score` (0–100), `notes`, `assessed_at` |
| `skill_alert_history` | Which early warnings were already sent (so they aren't repeated) | `id`, `user_id`, `skill`, `weeks_ahead`, `sent_at` — **unique on `(user_id, skill)`** |

**CRUD performed:** create/read/update/delete on `user_skills`; create/read on `skill_assessments`; read on `skills`; upsert on `skill_alert_history`. The forecast results themselves are **not** stored — they're recomputed each time you ask.

> Note: `skills`, `user_skills`, `skill_assessments` are defined in `0010_skills.sql`; `skill_alert_history` in `0022_skill_alert_history.sql`.

---

## 10. Validation: what gets checked

Before the service runs, a Zod schema checks the request body (defined in `skill.validation.ts`):

- **Run forecast:** `skills` is optional and must be an array of strings.
- **Add skill:** `skill_id` must be a UUID; `proficiency_level` is an integer 1–5; `proficiency_label` is one of Beginner/Intermediate/Advanced.
- **Update skill:** all fields optional; `confidence_score` must be between 0 and 1.
- **Log assessment:** `score` must be a number 0–100.

If the body breaks a rule, the request never reaches the service — the user gets a clear validation error.

---

## 11. Error handling

| Situation | What happens | What the user sees |
|-----------|--------------|--------------------|
| Not logged in / token expired | `authenticate` blocks the request | 401, "Unauthorized" (frontend asks them to log in again) |
| No permission | `requirePermission` blocks it | 403 error |
| Invalid body | Validation blocks it | 400 with the validation message |
| Adding a duplicate skill | The service catches DB error code `23505` | 409, "Skill already added" |
| Database error | The service throws an `AppError` | 500, the message |
| **Module A is down** | `callPython` quietly returns **mock data** | The UI still works, but shows the fixed sample forecast |
| Saving an alert/notification fails | Logged, but does **not** fail the forecast | The user still gets their forecast |

All errors flow through the central `errorHandler`, which always replies with `{ success: false, message }`.

---

## 12. Security

- **Authentication:** every route runs `authenticate` first — a valid Supabase JWT (login token) is required. No token, no access.
- **Authorization:** read routes need `skills:read`, write routes need `skills:write`. These are checked by `requirePermission()`.
- **Data isolation:** every query filters by `user_id`, so one user can never see or change another user's skills or assessments.
- **Input safety:** Zod validates and trims input before it touches the database; the Supabase client uses parameterised queries (no SQL injection).

---

## 13. What happens if the AI service is off

If Module A (port 8001) isn't running, the backend can't reach it — so it quietly returns **mock (fake) data** instead. You'll see a fixed list every time: **React, TypeScript, Node.js, Python, Docker, AWS**, with early warnings for **Bun.js, LangChain, Rust**.

> If you keep seeing exactly that list, it means **Module A is switched off**. Start it (`cd python-module-a && python api/app.py`) and click *Run Forecast* again — no backend restart needed, because the backend reads the service URL fresh on every request.

The mock data lives in the `MOCK_FORECAST` constant inside the backend skill service.

---

## 14. A real example, start to finish

Nimal is tracking React and Python. He clicks **Run Forecast**.

1. Frontend → `POST /api/skills/forecast` with `{ "skills": ["React", "Python"] }`.
2. Backend checks his token + `skills:read` permission, validates the body.
3. Backend → `POST http://localhost:8001/forecast` with `{ user_id: "nimal-id", skills: ["React","Python"] }`.
4. Module A reads its CSVs and replies:

```json
{
  "trending": [
    { "skill": "React",  "rank": 1, "predicted_weekly_demand": 92, "velocity": "rising", "change_pct": 8 },
    { "skill": "Python", "rank": 4, "predicted_weekly_demand": 88, "velocity": "rising", "change_pct": 6 }
  ],
  "early_warnings": [
    { "skill": "LangChain", "weeks_ahead": 17, "correlation": 0.89, "interpretation": "Global leads local by 17w" }
  ],
  "forecast_chart": [ { "week": "W1", "React": 80, "Python": 70 } ]
}
```

5. Backend upserts the LangChain warning into `skill_alert_history`. It's new, so it creates a notification: *"LangChain is trending globally and typically reaches the Sri Lankan market ~17 weeks later."*
6. On screen Nimal sees **React #1 rising (+8%)**, a climbing 12-week chart, a yellow early-warning, and a fresh badge on his notification bell.

If Nimal clicks **Run Forecast** again a minute later, the LangChain alert is **not** re-sent (the unique rule blocks the duplicate).

---

## 15. Sequence diagram (text)

```
User        Skill Page        Backend            Module A (:8001)     Database
 │  click       │                │                     │                 │
 │─────────────►│                │                     │                 │
 │              │ POST /api/skills/forecast             │                 │
 │              │───────────────►│                      │                 │
 │              │                │ authenticate + perms │                 │
 │              │                │ validate body        │                 │
 │              │                │ POST /forecast       │                 │
 │              │                │─────────────────────►│                 │
 │              │                │                      │ read CSV files  │
 │              │                │◄─────────────────────│                 │
 │              │                │ { trending, warnings, chart }          │
 │              │                │ upsert alerts ─────────────────────────►│
 │              │                │ create notifications ──────────────────►│
 │              │◄───────────────│ { success, data }    │                 │
 │◄─────────────│ render cards + chart + alert          │                 │
```

---

## 16. Where it lives in the code

- **Web page:** [frontend/src/app/(dashboard)/skill/page.tsx](../../frontend/src/app/(dashboard)/skill/page.tsx)
- **Frontend → backend calls:** [frontend/src/services/skill.service.ts](../../frontend/src/services/skill.service.ts)
- **Backend address list (routes):** [backend/src/routes/skill.routes.ts](../../backend/src/routes/skill.routes.ts)
- **Backend request receiver (controller):** [backend/src/controllers/skill.controller.ts](../../backend/src/controllers/skill.controller.ts)
- **Backend logic (the forecast journey):** [backend/src/services/skill.service.ts](../../backend/src/services/skill.service.ts) — see `runForecast()`
- **Validation rules:** [backend/src/validations/skill.validation.ts](../../backend/src/validations/skill.validation.ts)
- **The AI brain:** [python-module-a/api/app.py](../../python-module-a/api/app.py) — the `/forecast` endpoint
- **Shared "ask a Python brain" helper:** [backend/src/services/python.service.ts](../../backend/src/services/python.service.ts)
- **Database tables:** [0010_skills.sql](../../backend/supabase/migrations/0010_skills.sql), [0022_skill_alert_history.sql](../../backend/supabase/migrations/0022_skill_alert_history.sql)
