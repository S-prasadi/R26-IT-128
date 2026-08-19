# Career Prediction (Module B)

> *"What career paths can I take from here, and what should I learn to get there?"*
> The Career Predictor takes the skills you have today and maps out the most likely (and most achievable) career paths — drawn as an interactive graph of roles you could grow into.

New here? Read [the project overview](00-project-overview.md) first. This document zooms into just the Career module.

> ✅ **Status:** Module B is a real, trained model, not a stand-in. `python-module-b/dashboard.py` is a FastAPI service (port 8002) serving a tuned **Logistic Regression** classifier over **153 target-role classes**, trained on **22,951 records** (synthetic profiles generated from 493 real IT job postings — `python-module-b/train_all.py`, `generate_balanced_data.py`). Reported accuracy: **93.19% test accuracy, 96.95% top-3 accuracy** (`python-module-b/saved_models/model_info.json`). `run-all.sh` starts it by default alongside Modules A, C, and D.
>
> The backend no longer silently substitutes mock paths when Module B is unreachable — `career.service.ts`'s `predictPath()` calls it with `throwOnUnreachable: true`, so a down Module B now surfaces as a clean **"The career model is offline"** error and the Career page shows an offline badge and pauses the Predict button, rather than quietly serving fake paths that look real. A `MODULE_B_MOCK` object still exists in the backend source but is effectively dead code on this path — see §13.
>
> The training dataset (`python-module-b/cleaned_data/training_data.csv`) was regenerated very recently — treat the exact role/record counts above as "as of the last training run," not permanently fixed numbers.

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
13. [What happens if Module B is off](#13-what-happens-if-module-b-is-off)
14. [The model, in plain terms](#14-the-model-in-plain-terms)
15. [A real example, start to finish](#15-a-real-example-start-to-finish)
16. [Sequence diagram (text)](#16-sequence-diagram-text)
17. [Where it lives in the code](#17-where-it-lives-in-the-code)

---

## 1. What this module does

You tell the app your **current role** and the app already knows your **skills** (the ones you track *and* the ones pulled from your CV). Module B's job is to answer: *"Given this person, where can their career realistically go?"*

It returns a few **career paths** — for example *Student → Junior Engineer → Software Engineer → Senior Engineer* — each with:

- a **confidence** score (how likely this path is for someone with your profile, relative to your other returned options — see §6's note on why it's normalised),
- a **readiness** score (how ready *you* are for it right now),
- the **skills you already match**, and the **skills you still need** (the "gaps").

If you've set a **career goal** (a specific target role), Module B *also* returns a fourth, separate **goal-directed path** — one guaranteed to end at your chosen role, shown alongside (never replacing) the top-3 model-predicted paths.

The backend then makes the answer smarter in three ways:

1. **It builds a graph** — turning the list of paths into nodes (roles) and edges (transitions) the page can draw.
2. **It adds market context** — it asks the **Skill Forecaster (Module A)** about every "needed" skill, so each gap shows whether it's *rising / stable / falling* in demand. Gaps are then sorted with the most valuable (rising, high-demand) skills first.
3. **It grounds the readiness** — it blends the model's readiness with your *real* proficiency levels and how much of the path's skills you already cover.

---

## 2. Feature list

| Feature | What you do | What you see |
|---------|-------------|--------------|
| **Set a career goal** | Enter a target role/industry/date | Your goal is saved and shown |
| **Predict career paths** | Click "Generate My Path" | A graph of possible future roles branching from where you are, including a **goal-directed path** if you've set one |
| **Explore a role** | Click a node in the graph | Its readiness, gate skills, market trend, and time-to-reach |
| **What-if simulation** | Toggle "add" or "remove" some skills | Paths/readiness instantly recalculated — **not saved** |
| **Generate a roadmap** | Click "Generate Roadmap" on a path | Learning tasks ("Learn AWS"), rising-demand skills first, with due dates |
| **Manage roadmap items** | Add / edit / delete / reorder tasks | A checklist of career steps with statuses |
| **Prediction history** | Open the history list | Your last 20 saved predictions with their top role + confidence |
| **Model status badge** | Just load the page | A live green/red dot showing whether Module B is online, which model it's serving, and how many roles it covers — Predict is disabled while it's offline |

---

## 3. The journey of your data (step by step)

When a user clicks **"Generate My Path"** on the Career page:

1. **You click the button.** The page may include your current role, months of experience, number of projects, and any "what-if" skills you toggled.

2. **The page calls the backend** at `POST /api/career/predict` with your login token.

3. **The backend checks login + permission** (`authenticate`, then `requirePermission("career:write")`) and validates the body.

4. **The backend gathers your real skills.** Inside `predictPath()` it collects: the skills you track (with their 1–5 proficiency), *plus* skills extracted from the CV attached to your goal. It then applies your what-if changes (remove first, then add) to build one clean skill list.

5. **The backend calls Module B twice, concurrently** (`Promise.allSettled`, so neither call waits on the other):
   - `POST http://localhost:8002/predict` — the main call, with `{ skills, current_role, experience_months, num_projects, top_k: 3 }`. This one is treated as essential: if Module B is unreachable, the request fails cleanly with a 503 rather than silently substituting mock paths (see §13).
   - `POST http://localhost:8002/predict-to-target` — only if you've set a career goal, asking for one path that specifically reaches your `target_role`. This one is best-effort: if it fails (Module B down, or it doesn't recognise the target role), the main prediction still succeeds without a goal path, logged server-side.

6. **The backend reshapes the answer into a graph** — nodes for each role, edges for each transition, with gate skills and estimated months on each edge. The goal-directed path (if any) is folded into the same graph as an extra branch, then split back out into its own `goal_path` field afterward.

7. **The backend normalises confidence across your returned paths.** Because the model spreads probability mass across 153 possible roles, a raw top-1 probability is naturally tiny (often ~4%). The backend re-normalises confidence *across just the paths actually returned* (excluding the goal path) into a "share of your options" number — this is `confidence_relative` in the response, and it's what the UI actually shows as "confidence."

8. **The backend enriches with market data.** It collects every relevant skill across all paths and asks **Module A's `/forecast`**, then attaches a *velocity* (rising/stable/falling) and demand number to each gap skill, and a market summary to each role node. (Module A now returns `trending` as two tiers, `established`/`emerging` — the backend simply combines both into one skill→trend lookup here, since this step only needs "what's the trend for skill X," not the ranking.)

9. **The backend blends readiness** using your real proficiency, and sorts each path's gap skills so the highest-leverage ones come first.

10. **The backend saves a snapshot** of the prediction into `career_predictions` (unless it was a what-if `simulate` run) and sends a "Career Path Prediction Ready" notification.

11. **The page draws the career graph** and lets you click into any role for details, including the goal-directed branch if present.

---

## 4. How the pieces talk (diagram)

```
You (browser)
  │  click "Generate My Path"
  ▼
Career page  ─────────►  Backend (Express :8081)
(Next.js)     POST            │ 1. authenticate + requirePermission("career:write")
              /api/career/    │ 2. validate body
                  predict     │ 3. gather your skills (tracked + from CV, apply what-if)
                              │ 4. POST http://localhost:8002/predict ──► Module B (:8002)
                              │        (essential — throws a clean 503 if down)   ◄── top-3 paths
                              │    POST .../predict-to-target ────────► Module B (goal path,
                              │        (best-effort, runs concurrently)            best-effort)
                              │ 5. build graph (nodes + edges), fold goal path in
                              │ 6. normalise confidence across returned paths
                              │ 7. POST http://localhost:8001/forecast ─► Module A (:8001)
                              │      (market demand for gap skills) ◄── established/emerging trends
                              │ 8. blend readiness + sort gaps
                              │ 9. split goal path back out, save snapshot (DB) → notify
                              ▼
You (browser)  ◄──────────────┘  { success, data: { paths, goal_path, graph_nodes, graph_edges } }
  │  interactive career graph appears
  ▼
Done
```

Career talks to **two** brains: Module B for the paths (both the top-3 and the goal-directed one), Module A to add market context. A third, lightweight call — `GET /api/career/model-status` — pings Module B's `/model-info` and Module A's `/api/status` independently to drive the online/offline badge; it's not part of the prediction flow itself.

---

## 5. Frontend side

- **The page:** `frontend/src/app/(dashboard)/career/page.tsx` — the goal form, the model status badge, the "Generate My Path" button, the what-if controls, the prediction history, and the roadmap checklist.
- **The graph drawing:** `CareerFlowGraph.tsx` renders the nodes (roles) and edges (transitions) as an interactive tree, including the goal-directed branch when present. Clicking a node opens a detail drawer with readiness, gate skills, and the market trend.
- **Model status badge:** on load (and after every failed predict/simulate call), the page calls `careerService.getModelStatus()` and shows a small dot — teal "Model online · Logistic Regression · 153 roles" or red "Model offline." When Module B is offline, the Predict button is disabled (`modelStatus?.module_b.online === false`) rather than letting you submit into a guaranteed failure.
- **State management:** React state holds the goal, the latest prediction (paths + goal_path + nodes + edges), the what-if toggles, the roadmap items, and the model status.
- **Forms:** the goal form validates a target role; the what-if controls add/remove skill chips.
- **Auto-preview on load, without polluting history:** when your goal and skills are already known, the page runs a silent preview prediction automatically (so you see something without clicking). This preview call passes `simulate: true` so it behaves like a what-if run and is **never saved** as a new history row — a fix for an earlier bug where visiting the Career page on every page load quietly inserted a fresh near-duplicate snapshot, which made a deleted history card look like it had "come back" (a new lookalike row replacing the one you'd just deleted).
- **API calls:** through `frontend/src/services/career.service.ts` — get/set/delete goal, predict path, get model status, get/delete predictions, generate/add/update/delete roadmap items.

---

## 6. Backend side

Chain: **route → controller → service → (database + Module B + Module A)**.

The service (`career.service.ts`) is the most logic-heavy in the project. Key functions:

- `getGoal()` / `upsertGoal()` / `deleteGoal()` — read/save/clear the user's single career goal.
- `getRoadmap()` / `addRoadmapItem()` / `updateRoadmapItem()` / `deleteRoadmapItem()` — manage the to-do list.
- `predictPath()` — the big one (see the journey above): gather skills → call Module B's `/predict` (essential, throws a clean offline error) and `/predict-to-target` (best-effort, concurrent) → build graph → normalise confidence → enrich with Module A → blend readiness → split the goal path back out → save snapshot → notify.
- `getModelStatus()` — a lightweight health check the Career page polls: pings Module B's `/model-info` and Module A's `/api/status` (3s timeout each, `Promise.all`), returns `{ module_b: { online, best_model, num_roles }, module_a: { online } }`. Used purely for the UI badge; it doesn't gate the predict call itself (that's still enforced by `throwOnUnreachable` inside `predictPath()`).
- `getPredictions()` / `deletePrediction()` — the saved history, including the goal-path fields (`goal_target_role`, `goal_confidence`, `goal_readiness`, `goal_total_months`).
- `generateRoadmap()` — takes a chosen prediction's gap skills and turns them into `career_roadmap_items`, rising-demand skills first, each with a suggested due date (sooner for rising skills), skipping any task that already exists. Prefers the exact prediction snapshot the caller viewed (via a `prediction_id` the frontend now passes back) over "whatever the latest row happens to be," since path ids are positional (`path-1`, `path-2`, ...) and could otherwise point at a different role's gaps if a newer prediction ran in between.

Helper logic worth knowing: `normalizeModuleBResponse()` (turns raw paths into the graph, and — see §3 step 7 — re-normalises confidence across your *returned* paths, since Module B's raw top-1 probability is small by construction with 153 possible classes), `blendReadiness()` (mixes model score + your proficiency + coverage), and `enrichWithMarketData()` (attaches Module A's per-gap-skill trend/demand and mutates each node's market summary — it flattens Module A's `established`/`emerging` tiers into one lookup since this step only needs skill→trend, not a ranking).

---

## 7. Routes and endpoints

All under `/api/career`, all require a valid login token.

| Method | Path | What it does | Permission |
|--------|------|--------------|------------|
| GET | `/api/career/goal` | Get the user's career goal | `career:read` |
| POST | `/api/career/goal` | Create/update the goal | `career:write` |
| DELETE | `/api/career/goal` | Clear the goal | `career:write` |
| GET | `/api/career/roadmap` | List roadmap items | `career:read` |
| POST | `/api/career/roadmap` | Add a roadmap item | `career:write` |
| POST | `/api/career/roadmap/generate` | Auto-build roadmap from a predicted path | `career:write` |
| PATCH | `/api/career/roadmap/:id` | Update a roadmap item | `career:write` |
| DELETE | `/api/career/roadmap/:id` | Delete a roadmap item | `career:write` |
| **POST** | **`/api/career/predict`** | **Predict career paths (calls Module B + Module A)** | `career:write` |
| **GET** | **`/api/career/model-status`** | **Health check: is Module B (and A) online, and what model is serving?** | `career:read` |
| GET | `/api/career/predictions` | List saved predictions (latest 20) | `career:read` |
| DELETE | `/api/career/predictions/:id` | Delete a saved prediction | `career:write` |

**Module B's own endpoints** (called by the backend): `POST http://localhost:8002/predict`, `POST http://localhost:8002/predict-to-target`, `GET http://localhost:8002/model-info`. Module B also serves a standalone demo UI at `http://localhost:8002/` (`static/index.html`) for direct testing outside the main app.

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

**Successful response** (shortened — the real graph has more nodes/edges, and `goal_path` is only present if a goal is set):

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
    "goal_path": {
      "target_role": "Senior Software Engineer",
      "confidence_relative": null,
      "readiness_score": 0.65,
      "career_steps": ["Student", "Software Engineer", "Senior Software Engineer"],
      "skills_needed": ["System Design", "Leadership"],
      "eta_months": 24
    },
    "graph_nodes": [ { "id": "n0", "label": "Student", "type": "current" } ],
    "graph_edges": [ { "source": "n0", "target": "n1", "probability": 0.87, "timeframe": "~6 months" } ]
  }
}
```

**Model status response** — `GET /api/career/model-status`:

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "module_b": { "online": true, "best_model": "Logistic Regression", "num_roles": 153 },
    "module_a": { "online": true }
  }
}
```

**Error response** (Module B unreachable):

```json
{ "success": false, "message": "The career model is offline. Please try again later." }
```

---

## 9. The database tables it uses

| Table | What it stores | Key fields |
|-------|----------------|-----------|
| `career_goals` | The user's single career goal (one per user) | `id`, `user_id` (unique), `target_role`, `target_industry`, `target_date`, `notes`, `skills_snapshot`, `cv_id` |
| `career_roadmap_items` | The user's learning to-do list | `id`, `user_id`, `title`, `description`, `status` (pending/in_progress/done), `due_date`, `order_index` |
| `career_predictions` | Saved snapshots of past predictions | `id`, `user_id`, `current_role`, `experience_months`, `result` (full JSON snapshot), `top_target_role`, `top_confidence`, `top_readiness`, `goal_target_role`, `goal_confidence`, `goal_readiness`, `goal_total_months` |

**CRUD performed:** upsert/read/delete on `career_goals`; full CRUD on `career_roadmap_items`; create/read/delete on `career_predictions`. It also **reads** `cv_sections` (to pull skills from the attached CV) and `user_skills`.

> Defined in `0012_career.sql`, `0020_career_goal_skills_cv.sql` (adds `skills_snapshot`/`cv_id`), `0024_career_predictions.sql`, and `0028_career_predictions_goal_fields.sql` (adds the four `goal_*` columns for the goal-directed path).

---

## 10. Validation: what gets checked

From `career.validation.ts`:

- **Predict:** `current_role` optional text; `experience_months` integer 0–600; `num_projects` integer 0–50; `add_skills` up to 20 strings; `remove_skills` up to 50 strings; `simulate` optional boolean.
- **Goal:** `target_role` required; `target_date` must look like `YYYY-MM-DD`; `cv_id` must be a UUID if given.
- **Roadmap item:** `title` required; `status` is one of pending/in_progress/done; `due_date` `YYYY-MM-DD`.
- **Generate roadmap:** `path_id` required; an optional `prediction_id` pins the roadmap to the exact snapshot you viewed rather than "whatever's newest."

---

## 11. Error handling

| Situation | What happens | What the user sees |
|-----------|--------------|--------------------|
| Not logged in | `authenticate` blocks | 401, "Unauthorized" |
| No permission | `requirePermission` blocks | 403 |
| Invalid body | Validation blocks | 400 with the message |
| Generate roadmap before any prediction | Service throws | 400, "Run a prediction first" |
| Path id not found | Service throws | 404, "Path not found" |
| **Module B unreachable (main `/predict` call)** | No mock substitute — a clean error is thrown | 503, "The career model is offline. Please try again later." — the model-status badge flips red and Predict is disabled |
| **Module B unreachable / rejects the goal (`/predict-to-target`)** | Best-effort — logged server-side, main prediction still returns | You get your top-3 paths without a goal branch; no error surfaced |
| **Module A down** | Market labels fall back to "unknown" | Paths still shown, just without trend colours |
| Snapshot save fails | Logged, prediction still returned | User still sees their prediction |

All errors return `{ success: false, message }` via the central handler.

---

## 12. Security

- **Authentication:** valid login token required on every route.
- **Authorization:** `career:read` for viewing/predicting status, `career:write` for predicting/changing goals/roadmaps/deleting.
- **Data isolation:** every query filters by `user_id` — your goal, roadmap, and predictions are yours alone.
- **What-if safety:** simulations (`simulate: true`) are **never persisted**, so experimenting — and the automatic goal-path preview on page load — never pollutes your saved history.
- **Input safety:** Zod validation + parameterised Supabase queries.

---

## 13. What happens if Module B is off

Unlike most other modules in this app, Career's main prediction path **does not fall back to mock data**. If Module B (port 8002) can't be reached, `predictPath()` throws immediately and the backend returns a 503 with a clear "offline" message — the frontend reflects this as a red status dot and disables the Predict button, rather than quietly showing fake paths that look identical to real ones.

A `MODULE_B_MOCK` constant (three sample paths — *Senior Software Engineer*, *Tech Lead*, *DevOps Engineer*) still exists in `career.service.ts` and is passed as the `fallback` argument to the underlying `callPython()` helper, but because that call also sets `throwOnUnreachable: true`, the fallback is never actually returned on this path — an unreachable Module B always throws instead. In effect the mock object is vestigial for `/predict`; it's kept in the source as the function signature's fallback argument, not as active behavior.

The **goal-directed** `/predict-to-target` call is the one place that still degrades gracefully: if Module B is down or doesn't recognise your target role, that call fails silently (logged server-side) and you simply don't get a `goal_path` — your top-3 predicted paths still return normally.

Market enrichment (Module A) still degrades the old way: if Module A is unreachable, gap-skill trend labels fall back to "unknown" rather than failing the whole prediction.

> To start Module B yourself: `cd python-module-b && python dashboard.py` (or `./run-all.sh` from the repo root, which starts it automatically). The standalone demo UI at `http://localhost:8002/` is useful for testing predictions directly against the model without going through the full app.

---

## 14. The model, in plain terms

`python-module-b/train_all.py` builds a `CareerPathwayModel`: given a candidate's skills, current role, months of experience, and project count, it predicts the most likely **next target roles** out of 153 possible classes, plus a per-path readiness score and the skill gap to close.

- **Training data:** `IT_Job_Roles_Skills.csv` (493 real IT job postings, each mapped to a role + its required skills) is expanded by `generate_balanced_data.py` into `cleaned_data/training_data.csv` — 150 synthetic candidate records generated per role (22,951 rows total across 153 roles), so every role class has enough examples to train on even if the real postings for it were sparse.
- **Algorithm:** Logistic Regression won the internal model comparison (`python-module-b/charts/` has the learning-curve, confusion-matrix, per-class-F1, and model-comparison charts from that evaluation) — **93.19% test accuracy, 96.95% top-3 accuracy** (`saved_models/model_info.json`).
- **Artifacts:** `saved_models/classifier.pkl` (the trained model), `label_encoder.pkl` (role name ↔ class index), `mlb.pkl` (multi-label skill binarizer), `scaler.pkl` (feature scaling), `role_skill_profiles.pkl` (per-role skill requirements, used for the gap/readiness calculation), `model_info.json` (the metadata `/model-info` serves).
- **Confidence, honestly:** because the model spreads probability mass across 153 classes, a raw top-1 probability is small by construction (often only a few percent) — that's normal for a many-class classifier, not a sign the model is unsure. See §6/§3 for how the backend re-normalises this into the "confidence" you actually see.

---

## 15. A real example, start to finish

Saman is a "Student" who knows React, Node.js and PostgreSQL, with a career goal of "Senior Software Engineer" already set. He clicks **Generate My Path**.

1. Frontend → `POST /api/career/predict` with his role + experience.
2. Backend gathers his skills (tracked + from his attached CV), calls Module B's `/predict` (top-3 paths) and `/predict-to-target` (his goal) concurrently, builds the graph, and folds the goal branch in.
3. Backend asks Module A about the gap skills; AWS comes back *rising (+6%)*, so it's sorted to the top.
4. Backend blends readiness, normalises confidence across his 3 returned paths, and saves the snapshot. His top path:

```json
{
  "target_role": "Senior Software Engineer",
  "confidence_relative": 0.39,
  "readiness_score": 0.72,
  "skills_matched": ["React", "Node.js", "PostgreSQL"],
  "skills_needed":  ["AWS", "Kubernetes", "System Design"]
}
```

5. On screen Saman sees a branching graph with **Senior Software Engineer** as his strongest path, plus a distinctly-marked goal branch confirming the same target is reachable directly. He clicks **"Generate Roadmap"**, which turns *AWS, Kubernetes, System Design* into dated learning tasks (AWS due soonest, since it's rising). He also gets a notification: *"Your top predicted path leads to Senior Software Engineer."*

---

## 16. Sequence diagram (text)

```
User     Career Page     Backend          Module B (:8002)   Module A (:8001)   Database
 │ click     │              │                   │                  │              │
 │──────────►│ POST /predict │                   │                  │              │
 │           │─────────────►│ auth + perms       │                  │              │
 │           │              │ gather skills ◄──────────────────────────────────────│ (user_skills, cv_sections)
 │           │              │ POST /predict ────►│                  │              │
 │           │              │ POST /predict-to-target ─►│ (concurrent, best-effort) │
 │           │              │◄───────────────────│ top-3 paths      │              │
 │           │              │◄───────────────────│ goal path (or fails silently)   │
 │           │              │ build graph, normalise confidence     │              │
 │           │              │ POST /forecast ─────────────────────► │              │
 │           │              │◄────────────────────────────────────  │ trends       │
 │           │              │ blend + sort       │                  │              │
 │           │              │ save snapshot ─────────────────────────────────────► │ career_predictions
 │           │              │ notify ────────────────────────────────────────────► │ notifications
 │           │◄─────────────│ { success, data }  │                  │              │
 │◄──────────│ draw graph    │                   │                  │              │
```

---

## 17. Where it lives in the code

- **Web page:** [frontend/src/app/(dashboard)/career/page.tsx](../../frontend/src/app/(dashboard)/career/page.tsx)
- **The career graph drawing:** [frontend/src/app/(dashboard)/career/CareerFlowGraph.tsx](../../frontend/src/app/(dashboard)/career/CareerFlowGraph.tsx)
- **Frontend → backend calls:** [frontend/src/services/career.service.ts](../../frontend/src/services/career.service.ts) — incl. `getModelStatus()`
- **Backend address list (routes):** [backend/src/routes/career.routes.ts](../../backend/src/routes/career.routes.ts) — incl. `GET /model-status`
- **Backend request receiver (controller):** [backend/src/controllers/career.controller.ts](../../backend/src/controllers/career.controller.ts)
- **Backend logic (predict, enrich, roadmap):** [backend/src/services/career.service.ts](../../backend/src/services/career.service.ts) — see `predictPath()`, `getModelStatus()`, `normalizeModuleBResponse()`, `generateRoadmap()`
- **Validation rules:** [backend/src/validations/career.validation.ts](../../backend/src/validations/career.validation.ts)
- **The AI brain:** `python-module-b/dashboard.py` — `/predict`, `/predict-to-target`, `/model-info`; `python-module-b/train_all.py` — `CareerPathwayModel`, training pipeline; `python-module-b/generate_balanced_data.py` — synthetic training-record generation from `IT_Job_Roles_Skills.csv`
- **Model artifacts:** `python-module-b/saved_models/` (`classifier.pkl`, `label_encoder.pkl`, `mlb.pkl`, `scaler.pkl`, `role_skill_profiles.pkl`, `model_info.json`) and `python-module-b/charts/` (learning curves, confusion matrix, per-class F1, model comparison from the training evaluation)
- **Database tables:** [0012_career.sql](../../backend/supabase/migrations/0012_career.sql), [0020_career_goal_skills_cv.sql](../../backend/supabase/migrations/0020_career_goal_skills_cv.sql), [0024_career_predictions.sql](../../backend/supabase/migrations/0024_career_predictions.sql), [0028_career_predictions_goal_fields.sql](../../backend/supabase/migrations/0028_career_predictions_goal_fields.sql)
