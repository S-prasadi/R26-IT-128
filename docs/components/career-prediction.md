# Career Prediction (Module B)

> *"What career paths can I take from here, and what should I learn to get there?"*
> The Career Predictor takes the skills you have today and maps out the most likely (and most achievable) career paths — drawn as an interactive graph of roles you could grow into.

New here? Read [the project overview](00-project-overview.md) first. This document zooms into just the Career module.

> ⚠️ **Important status:** Module B's Python brain isn't fully wired up yet. Right now the backend **always uses sample (mock) data** for the path prediction itself. Everything *around* it is real and already working — the database, the graph building, the market enrichment from Module A, the roadmap generation. The backend code is already written to call the real Module B; when that service is switched on (port 8002), the mock data simply stops being used.

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
13. [What happens if the AI service is off (or not wired yet)](#13-what-happens-if-the-ai-service-is-off-or-not-wired-yet)
14. [A real example, start to finish](#14-a-real-example-start-to-finish)
15. [Sequence diagram (text)](#15-sequence-diagram-text)
16. [Where it lives in the code](#16-where-it-lives-in-the-code)

---

## 1. What this module does

You tell the app your **current role** and the app already knows your **skills** (the ones you track *and* the ones pulled from your CV). Module B's job is to answer: *"Given this person, where can their career realistically go?"*

It returns a few **career paths** — for example *Student → Junior Engineer → Software Engineer → Senior Engineer* — each with:

- a **confidence** score (how likely this path is for someone with your profile),
- a **readiness** score (how ready *you* are for it right now),
- the **skills you already match**, and the **skills you still need** (the "gaps").

The backend then makes the answer smarter in three ways:

1. **It builds a graph** — turning the list of paths into nodes (roles) and edges (transitions) the page can draw.
2. **It adds market context** — it asks the **Skill Forecaster (Module A)** about every "needed" skill, so each gap shows whether it's *rising / stable / falling* in demand. Gaps are then sorted with the most valuable (rising, high-demand) skills first.
3. **It grounds the readiness** — it blends the model's readiness with your *real* proficiency levels and how much of the path's skills you already cover.

---

## 2. Feature list

| Feature | What you do | What you see |
|---------|-------------|--------------|
| **Set a career goal** | Enter a target role/industry/date | Your goal is saved and shown |
| **Predict career paths** | Click "Predict My Path" | A graph of possible future roles branching from where you are |
| **Explore a role** | Click a node in the graph | Its readiness, gate skills, market trend, and time-to-reach |
| **What-if simulation** | Toggle "add" or "remove" some skills | Paths/readiness instantly recalculated — **not saved** |
| **Generate a roadmap** | Click "Generate Roadmap" on a path | Learning tasks ("Learn AWS"), rising-demand skills first, with due dates |
| **Manage roadmap items** | Add / edit / delete / reorder tasks | A checklist of career steps with statuses |
| **Prediction history** | Open the history list | Your last 20 saved predictions with their top role + confidence |

---

## 3. The journey of your data (step by step)

When a user clicks **"Predict My Path"** on the Career page:

1. **You click the button.** The page may include your current role, months of experience, number of projects, and any "what-if" skills you toggled.

2. **The page calls the backend** at `POST /api/career/predict` with your login token.

3. **The backend checks login + permission** (`authenticate`, then `requirePermission("career:read")`) and validates the body.

4. **The backend gathers your real skills.** Inside `predictPath()` it collects: the skills you track (with their 1–5 proficiency), *plus* skills extracted from the CV attached to your goal. It then applies your what-if changes (remove first, then add) to build one clean skill list.

5. **The backend asks the Career brain (Module B)** at `http://localhost:8002/predict`, sending `{ skills, current_role, experience_months, num_projects, top_k: 3 }`. *(Today this step falls back to the mock paths.)*

6. **The backend reshapes the answer into a graph** — nodes for each role, edges for each transition, with gate skills and estimated months on each edge.

7. **The backend enriches with market data.** It collects every relevant skill across all paths and asks **Module A's `/forecast`**, then attaches a *velocity* (rising/stable/falling) and demand number to each gap skill, and a market summary to each role node.

8. **The backend blends readiness** using your real proficiency, and sorts each path's gap skills so the highest-leverage ones come first.

9. **The backend saves a snapshot** of the prediction into `career_predictions` (unless it was a what-if `simulate` run) and sends a "Career Path Prediction Ready" notification.

10. **The page draws the career graph** and lets you click into any role for details.

---

## 4. How the pieces talk (diagram)

```
You (browser)
  │  click "Predict My Path"
  ▼
Career page  ─────────►  Backend (Express :8081)
(Next.js)     POST            │ 1. authenticate + requirePermission("career:read")
              /api/career/    │ 2. validate body
                  predict     │ 3. gather your skills (tracked + from CV, apply what-if)
                              │ 4. POST http://localhost:8002/predict ──► Module B (:8002)
                              │                                  ◄── paths   (today: mock)
                              │ 5. build graph (nodes + edges)
                              │ 6. POST http://localhost:8001/forecast ─► Module A (:8001)
                              │      (market demand for gap skills) ◄── trends
                              │ 7. blend readiness + sort gaps
                              │ 8. save snapshot (DB) → notify
                              ▼
You (browser)  ◄──────────────┘  { success, data: { paths, graph_nodes, graph_edges } }
  │  interactive career graph appears
  ▼
Done
```

So Career is special: it talks to **two** brains — Module B for the paths, Module A to add market context.

---

## 5. Frontend side

- **The page:** `frontend/src/app/(dashboard)/career/page.tsx` — the goal form, the "Predict" button, the what-if controls, the prediction history, and the roadmap checklist.
- **The graph drawing:** `CareerFlowGraph.tsx` renders the nodes (roles) and edges (transitions) as an interactive tree. Clicking a node opens a detail drawer with readiness, gate skills, and the market trend.
- **State management:** React state holds the goal, the latest prediction (paths + nodes + edges), the what-if toggles, and the roadmap items.
- **Forms:** the goal form validates a target role; the what-if controls add/remove skill chips.
- **API calls:** through `frontend/src/services/career.service.ts` — get/set goal, predict path, get/delete predictions, generate/add/update/delete roadmap items.

---

## 6. Backend side

Chain: **route → controller → service → (database + Module B + Module A)**.

The service (`career.service.ts`) is the most logic-heavy in the project. Key functions:

- `getGoal()` / `upsertGoal()` — read/save the user's single career goal.
- `getRoadmap()` / `addRoadmapItem()` / `updateRoadmapItem()` / `deleteRoadmapItem()` — manage the to-do list.
- `predictPath()` — the big one (see the journey above): gather skills → Module B → build graph → enrich with Module A → blend readiness → save snapshot → notify.
- `getPredictions()` / `deletePrediction()` — the saved history.
- `generateRoadmap()` — takes the latest prediction's gap skills and turns them into `career_roadmap_items`, rising-demand skills first, each with a suggested due date (sooner for rising skills), skipping any task that already exists.

Helper logic worth knowing: `blendReadiness()` (mixes model score + your proficiency + coverage), `buildSkillInsights()` and `rankSkillInsights()` (attach + sort market context), and `normalizeModuleBResponse()` (turns paths into the graph).

---

## 7. Routes and endpoints

All under `/api/career`, all require a valid login token.

| Method | Path | What it does | Permission |
|--------|------|--------------|------------|
| GET | `/api/career/goal` | Get the user's career goal | `career:read` |
| POST | `/api/career/goal` | Create/update the goal | `career:write` |
| GET | `/api/career/roadmap` | List roadmap items | `career:read` |
| POST | `/api/career/roadmap` | Add a roadmap item | `career:write` |
| POST | `/api/career/roadmap/generate` | Auto-build roadmap from a predicted path | `career:write` |
| PATCH | `/api/career/roadmap/:id` | Update a roadmap item | `career:write` |
| DELETE | `/api/career/roadmap/:id` | Delete a roadmap item | `career:write` |
| **POST** | **`/api/career/predict`** | **Predict career paths (calls Module B + Module A)** | `career:read` |
| GET | `/api/career/predictions` | List saved predictions (latest 20) | `career:read` |
| DELETE | `/api/career/predictions/:id` | Delete a saved prediction | `career:write` |

**Module B's own endpoint** (called by the backend): `POST http://localhost:8002/predict`.

---

## 8. What you send and what you get back (examples)

**Request** — `POST /api/career/predict`

```json
{
  "current_role": "Student",
  "experience_months": 6,
  "num_projects": 3,
  "add_skills": ["Kubernetes"],
  "simulate": false
}
```

**Successful response** (shortened — the real graph has more nodes/edges):

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "paths": [
      {
        "id": "path-1",
        "probability": 0.87,
        "confidence_relative": 0.39,
        "readiness_score": 0.72,
        "career_steps": ["Student", "Junior Software Engineer", "Software Engineer", "Senior Software Engineer"],
        "skills_matched": ["React", "Node.js", "PostgreSQL"],
        "skills_needed": ["AWS", "Kubernetes", "System Design"],
        "skill_insights": [
          { "skill": "AWS", "velocity": "rising", "change_pct": 6, "demand": 78, "early_warning": 12 }
        ]
      }
    ],
    "graph_nodes": [ { "id": "n0", "label": "Student", "type": "current" } ],
    "graph_edges": [ { "source": "n0", "target": "n1", "probability": 0.87, "timeframe": "~6 months" } ]
  }
}
```

**Error response** (e.g. trying to generate a roadmap before predicting):

```json
{ "success": false, "message": "Run a prediction first" }
```

---

## 9. The database tables it uses

| Table | What it stores | Key fields |
|-------|----------------|-----------|
| `career_goals` | The user's single career goal (one per user) | `id`, `user_id` (unique), `target_role`, `target_industry`, `target_date`, `notes`, `skills_snapshot`, `cv_id` |
| `career_roadmap_items` | The user's learning to-do list | `id`, `user_id`, `title`, `description`, `status` (pending/in_progress/done), `due_date`, `order_index` |
| `career_predictions` | Saved snapshots of past predictions | `id`, `user_id`, `current_role`, `experience_months`, `result` (full JSON snapshot), `top_target_role`, `top_confidence`, `top_readiness` |

**CRUD performed:** upsert/read on `career_goals`; full CRUD on `career_roadmap_items`; create/read/delete on `career_predictions`. It also **reads** `cv_sections` (to pull skills from the attached CV) and `user_skills`.

> Defined in `0012_career.sql`, `0020_career_goal_skills_cv.sql` (adds `skills_snapshot`/`cv_id`), and `0024_career_predictions.sql`.

---

## 10. Validation: what gets checked

From `career.validation.ts`:

- **Predict:** `current_role` optional text; `experience_months` integer 0–600; `num_projects` integer 0–50; `add_skills` up to 20 strings; `remove_skills` up to 50 strings; `simulate` optional boolean.
- **Goal:** `target_role` required; `target_date` must look like `YYYY-MM-DD`; `cv_id` must be a UUID if given.
- **Roadmap item:** `title` required; `status` is one of pending/in_progress/done; `due_date` `YYYY-MM-DD`.
- **Generate roadmap:** `path_id` required.

---

## 11. Error handling

| Situation | What happens | What the user sees |
|-----------|--------------|--------------------|
| Not logged in | `authenticate` blocks | 401, "Unauthorized" |
| No permission | `requirePermission` blocks | 403 |
| Invalid body | Validation blocks | 400 with the message |
| Generate roadmap before any prediction | Service throws | 400, "Run a prediction first" |
| Path id not found | Service throws | 404, "Path not found" |
| **Module B down** | Mock paths used | UI works, shows sample paths |
| **Module A down** | Market labels fall back to "unknown" | Paths still shown, just without trend colours |
| Snapshot save fails | Logged, prediction still returned | User still sees their prediction |

All errors return `{ success: false, message }` via the central handler.

---

## 12. Security

- **Authentication:** valid login token required on every route.
- **Authorization:** `career:read` for viewing/predicting, `career:write` for changing goals/roadmaps/deleting.
- **Data isolation:** every query filters by `user_id` — your goal, roadmap, and predictions are yours alone.
- **What-if safety:** simulations (`simulate: true`) are **never persisted**, so experimenting never pollutes your saved history.
- **Input safety:** Zod validation + parameterised Supabase queries.

---

## 13. What happens if the AI service is off (or not wired yet)

Module B isn't connected yet, so **every prediction currently uses mock data** — three sample paths (*Senior Software Engineer*, *Tech Lead*, *DevOps Engineer*). This is intentional, so the rest of the app works while Module B is built.

Even so, the enrichment is real: if **Module A** is running, the gap-skill market labels (rising/falling) are genuine. If Module A is also off, those labels fall back to "unknown".

> When Module B is finished, you only need to start it on port 8002 — the backend already calls it via `pythonUrls.moduleB()`, and the mock data (`MODULE_B_MOCK`) will simply stop being used.

---

## 14. A real example, start to finish

Saman is a "Student" who knows React, Node.js and PostgreSQL. He clicks **Predict My Path**.

1. Frontend → `POST /api/career/predict` with his role + experience.
2. Backend gathers his skills (tracked + from his attached CV), calls Module B (mock today), builds the graph.
3. Backend asks Module A about the gap skills; AWS comes back *rising (+6%)*, so it's sorted to the top.
4. Backend blends readiness and saves the snapshot. His top path:

```json
{
  "target_role": "Senior Software Engineer",
  "confidence": 0.87,
  "readiness_score": 0.72,
  "skills_matched": ["React", "Node.js", "PostgreSQL"],
  "skills_needed":  ["AWS", "Kubernetes", "System Design"]
}
```

5. On screen Saman sees a branching graph with **Senior Software Engineer** as his strongest path (87% confidence, 72% ready). He clicks **"Generate Roadmap"**, which turns *AWS, Kubernetes, System Design* into dated learning tasks (AWS due soonest, since it's rising). He also gets a notification: *"Your top predicted path leads to Senior Software Engineer with 87% confidence."*

---

## 15. Sequence diagram (text)

```
User     Career Page     Backend          Module B (:8002)   Module A (:8001)   Database
 │ click     │              │                   │                  │              │
 │──────────►│ POST /predict │                   │                  │              │
 │           │─────────────►│ auth + perms       │                  │              │
 │           │              │ gather skills ◄──────────────────────────────────────│ (user_skills, cv_sections)
 │           │              │ POST /predict ────►│                  │              │
 │           │              │◄───────────────────│ paths (mock)     │              │
 │           │              │ build graph        │                  │              │
 │           │              │ POST /forecast ─────────────────────► │              │
 │           │              │◄────────────────────────────────────  │ trends       │
 │           │              │ blend + sort       │                  │              │
 │           │              │ save snapshot ─────────────────────────────────────► │ career_predictions
 │           │              │ notify ────────────────────────────────────────────► │ notifications
 │           │◄─────────────│ { success, data }  │                  │              │
 │◄──────────│ draw graph    │                   │                  │              │
```

---

## 16. Where it lives in the code

- **Web page:** [frontend/src/app/(dashboard)/career/page.tsx](../../frontend/src/app/(dashboard)/career/page.tsx)
- **The career graph drawing:** [frontend/src/app/(dashboard)/career/CareerFlowGraph.tsx](../../frontend/src/app/(dashboard)/career/CareerFlowGraph.tsx)
- **Frontend → backend calls:** [frontend/src/services/career.service.ts](../../frontend/src/services/career.service.ts)
- **Backend address list (routes):** [backend/src/routes/career.routes.ts](../../backend/src/routes/career.routes.ts)
- **Backend request receiver (controller):** [backend/src/controllers/career.controller.ts](../../backend/src/controllers/career.controller.ts)
- **Backend logic (predict, enrich, roadmap):** [backend/src/services/career.service.ts](../../backend/src/services/career.service.ts) — see `predictPath()` and `generateRoadmap()`
- **Validation rules:** [backend/src/validations/career.validation.ts](../../backend/src/validations/career.validation.ts)
- **The AI brain (when wired):** `python-module-b/` — the `/predict` endpoint
- **Database tables:** [0012_career.sql](../../backend/supabase/migrations/0012_career.sql), [0020_career_goal_skills_cv.sql](../../backend/supabase/migrations/0020_career_goal_skills_cv.sql), [0024_career_predictions.sql](../../backend/supabase/migrations/0024_career_predictions.sql)
