# Skill Forecasting — Complete Technical and Functional Documentation

## 1. Purpose

The Skill Forecasting component (Module A) predicts demand for IT skills in the Sri Lankan market for the next 12 weeks. It helps a student answer:

> Which skills should I learn now, and which global skill trends are likely to reach Sri Lanka next?

The component combines:

- a personal skill profile;
- weekly global and Sri Lankan demand data;
- ARIMA or Holt Exponential Smoothing forecasts;
- global-to-local lead-lag analysis;
- a Next.js dashboard with rankings, warnings, and charts;
- deduplicated user notifications for new early warnings.

The current repository uses a generated, synthetic-but-realistic historical dataset for model development and demonstration. `scraping/topjobs_scraper.py` (§4.1) is a real-data pilot that has begun appending real observations alongside it, on a small scale so far.

## 2. System architecture

```text
Raw/global and local trend data
        |
        v
Dataset builder -> weekly_skill_dataset.csv + jobs_with_skills.csv
        |
        +--> Forecasting model -> forecasts.csv + model artifacts
        +--> Lead-lag model    -> lead_lag_analysis.csv
        +--> Clustering model  -> skill_clusters.csv + skill_bundles.csv
                                      |
                                      v
Next.js frontend -> Express backend -> FastAPI Module A
      :3000             :8081              :8001
                           |
                           +--> Supabase: skills, assessments, alert history,
                                and notifications
```

The machine-learning calculations are performed during training. A normal user request does not retrain a model. FastAPI reads the generated artifacts, selects and formats the relevant results, and returns them quickly.

## 3. Main functions available to the user

| Function | User action | Result |
|---|---|---|
| View skill catalog | Open **Skill Catalog** | Master skills grouped by category |
| Add a skill | Select a skill and proficiency | A new personal skill record |
| Update proficiency | Change Beginner, Intermediate, or Advanced | Updated profile skill |
| Remove a skill | Click remove | Skill removed from the profile |
| Verify through GitHub | Connect GitHub and click **Verify Skills** | Verification/confidence fields updated by the GitHub module |
| Log assessment | Select a skill, score, and optional notes | Assessment history entry |
| Run forecast | Open **Forecast** and click **Run Forecast** | Personalized or overall market forecast |
| View early warnings | Run a forecast | Global trends expected to lead local demand |
| Receive warning notification | Receive a previously unseen warning | One notification per user and skill |

## 4. Data lifecycle

### 4.1 Raw inputs

The generated development dataset covers 57 skills and 131 weekly periods. Four sources are represented:

| File | Scope | Meaning |
|---|---|---|
| `data/raw/global/trends_global.csv` | Global | Google Trends-style interest index |
| `data/raw/global/linkedin_jobs.csv` | Global | LinkedIn-style job demand index |
| `data/raw/local/trends_lk.csv` | Sri Lanka | Local Google Trends-style index |
| `data/raw/local/topjobs_lk.csv` | Sri Lanka | TopJobs-style job demand index |

`scraping/generate_trends_dataset.py` creates this reproducible demonstration data. Trend shapes include steady growth/decline, sigmoid adoption, and hype-cycle behavior. Noise and a 1–4 week global lead are added to make model testing realistic.

**Real data pilot.** `scraping/topjobs_scraper.py` (added in the Phase 3 improvement work — see `docs/skill-forecasting-improvement-plan.md`) scrapes TopJobs.lk's two IT job categories for a real weekly skill-mention score, written to `data/raw/local/topjobs_lk_real.csv`. It never stores job titles, descriptions, or company names — only the aggregate `{skill: percentage of listings mentioning it}` result. `scraping/build_trends_dataset.py` merges these real rows into `weekly_skill_dataset.csv` alongside the synthetic data, adding a `provenance` column (`synthetic`, `real`, or `carried_forward` for skills the pilot scraper didn't observe in a given real week, so a partial scrape can't read as a false demand cliff for the rest). The dataset is therefore no longer purely synthetic, though real coverage starts small (one week, a handful of skills) and grows only as the scraper is re-run.

### 4.2 Dataset construction

Run:

```bash
cd python-module-a
python scraping/build_trends_dataset.py
```

The builder creates:

1. `data/dataset/weekly_skill_dataset.csv`
   - one row for each skill and week;
   - `week`: ISO-like week label;
   - `skill`: normalized skill name;
   - `count`: aggregated demand across sources;
   - `co_skills`: skills active together in that period.

2. `data/processed/jobs_with_skills.csv`
   - weighted rows representing source-level skill frequency;
   - used by lead-lag and co-occurrence analysis.

### 4.3 Forecast training

`model/forecasting.py` builds a separate time series for every skill:

| Available history | Method |
|---|---|
| 8 or more weeks | ARIMA(1,1,1) |
| 4–7 weeks | Holt Exponential Smoothing with additive trend |
| Fewer than 4 weeks | Skill is skipped |

If ARIMA fitting fails, the code tries Exponential Smoothing. If fitting still fails, it repeats the most recent demand value. Negative predictions are clamped to zero.

The model predicts 12 future weeks. Trend classification is calculated from the historical linear-regression slope:

```text
relative_slope = slope / historical_mean

relative_slope >  0.005 -> rising
relative_slope < -0.005 -> falling
otherwise               -> stable
```

Outputs:

- `data/output/forecasts.csv`: 12 rows per forecasted skill;
- `data/models/skill_series.pkl`: historical weeks and counts;
- `data/models/model_registry.json`: method, history length, last week, and trend.

Important `forecasts.csv` columns:

| Column | Used for |
|---|---|
| `skill` | Skill identity |
| `forecast_week` | X-axis label in the 12-week chart |
| `forecast_step` | Week 1 through week 12 |
| `predicted_count` | Forecast demand |
| `trend` | Rising, stable, or falling |
| `method` | ARIMA or ES |
| `last_actual_count` | Latest observed demand |
| `avg_actual_count` | Historical average used by the integrated API |

### 4.4 Global-to-local early-warning analysis

`model/lead_lag.py` compares global and local weekly skill series using:

- cross-correlation (CCF) to find the strongest lead in weeks;
- Granger causality with significance threshold `p < 0.05`.

The analysis checks at most eight weeks of lag and needs at least six active weeks in each source. It writes `data/output/lead_lag_analysis.csv`.

The integrated forecast endpoint exposes a warning only when all are true:

```text
granger_sig == true
ccf_correlation >= 0.5
best_lag_weeks >= 1
```

It returns at most five warnings, ordered by correlation.

### 4.5 Clusters and bundles

`model/clustering.py` creates:

- semantic groupings using BERTopic when available;
- eight KMeans clusters based on normalized skill co-occurrence;
- trending two-skill bundles based on recent versus older co-occurrence.

These outputs are available from Module A’s standalone API, but the current main Skill page does not display them.

## 5. Training and weekly update workflow

Initial model preparation:

```bash
cd python-module-a
pip install -r requirements.txt
python scraping/generate_trends_dataset.py
python scraping/build_trends_dataset.py
python train.py --skip-dataset
```

Start Module A:

```bash
python api/app.py
```

FastAPI starts an APScheduler background job for Monday at 08:00 in `Asia/Colombo`. It runs `scraping/weekly_scraper.py`. The scheduler belongs inside the API process; running a second scheduler process can cause duplicate jobs.

The complete project can be started from the repository root with:

```bash
./run-all.sh
```

Main local addresses:

| Service | URL |
|---|---|
| Frontend | `http://localhost:3000` |
| Express backend | `http://localhost:8081` |
| Module A dashboard | `http://localhost:8001` |
| Module A API docs | `http://localhost:8001/docs` |

## 6. End-to-end forecast request

When the user clicks **Run Forecast**:

1. The frontend obtains the names of all tracked skills from `userSkills`.
2. `skillService.runForecast(skillNames)` sends `POST /skills/forecast`.
3. The shared Axios client adds `Authorization: Bearer <token>`.
4. Express resolves the full route as `POST /api/skills/forecast`.
5. Authentication checks the Supabase JWT.
6. Authorization requires `skills:read`.
7. Zod validates that `skills` is an optional string array.
8. The controller extracts the authenticated user ID and the skill names.
9. The backend service calls `POST {PYTHON_MODULE_A_URL}/forecast`.
10. FastAPI reads `forecasts.csv` and `lead_lag_analysis.csv`.
11. Skill names are matched leniently: lowercase, spaces, periods, and `.js` are ignored.
12. FastAPI creates `trending`, `early_warnings`, and `forecast_chart`.
13. Express records unseen warnings in `skill_alert_history` and creates notifications.
14. Express wraps the result in the standard API envelope.
15. React saves it in `forecast` state and renders cards and charts.

## 7. How each response field is produced and displayed

### 7.1 `trending`

FastAPI averages each skill’s `predicted_count` over forecast steps 1–4 and sorts descending. If at least one requested skill matches, only matched skills are retained; otherwise, it shows the overall market. At most eight skills are returned.

| Response field | Calculation/source | Frontend use |
|---|---|---|
| `skill` | `forecasts.csv.skill` | Card title and chart label |
| `rank` | Position after filtering and sorting | `#N of your skills` or `#N in market` |
| `predicted_weekly_demand` | Rounded mean prediction for weeks 1–4 | Large card value and forecast bar |
| `current_weekly_demand` | Rounded historical `avg_actual_count` | “now” text and current bar |
| `velocity` | Historical trend classification | Arrow and color |
| `change_pct` | `(avg prediction - avg actual) / avg actual * 100` | Percentage beside arrow |

### 7.2 `early_warnings`

| Response field | Source | Frontend use |
|---|---|---|
| `skill` | Lead-lag CSV | Warning name |
| `weeks_ahead` | `best_lag_weeks` | Approximate global lead label |
| `correlation` | Rounded CCF correlation | Confidence context in warning text |
| `interpretation` | Lead-lag CSV | Available to consumers; not separately rendered by the current page |

### 7.3 `forecast_chart`

The API selects the first three trending skills. For each forecast step 1–12 it creates a dynamic object:

```json
{
  "week": "2026-W27",
  "python": 304,
  "react": 278,
  "docker": 221
}
```

The frontend uses the first property (`week`) as the X axis and creates one Recharts line for every other property. Therefore skill names become dynamic JSON keys.

### 7.4 Personalization metadata

| Field | Meaning | UI behavior |
|---|---|---|
| `matched` | At least one tracked skill matched forecast data | Chooses personalized versus market wording |
| `matched_skills` | Original display names that matched | Shows “Forecast for N of your skills” |

If the user has no skills, or none match, `matched` is false and the frontend shows an amber message explaining that overall market skills are displayed.

## 8. Frontend structure and behavior

Main page: `frontend/src/app/(dashboard)/skill/page.tsx`

API wrapper: `frontend/src/services/skill.service.ts`

Types: `frontend/src/types/index.ts`

### Initial page loading

The page runs four requests in parallel:

- `GET /skills/user` for personal skills;
- `GET /skills` for the master catalog;
- `GET /skills/assessments` for assessment history;
- GitHub status from the GitHub service.

The standard response is read from `response.data.data` and stored in React state.

### Tab: My Skills

- Displays tracked skill name and category.
- Displays and edits proficiency.
- Shows GitHub verification.
- Adds skills from the master catalog.
- Removes personal skill records.

The route parameter for update/delete is the `user_skills.id`, not the master `skills.id`.

### Tab: Forecast

- Calls the forecast only when the user clicks the button.
- Sends tracked skill names, not IDs.
- Shows up to eight forecast cards.
- Shows early-warning rows.
- Shows a current-versus-predicted bar chart.
- Shows a 12-week line chart for up to three skills.

### Tab: Assessments

- Displays prior scores.
- Sends the master `skill_id`, score 0–100, and optional notes when logging an assessment.

### Tab: Skill Catalog

- Displays all rows from the `skills` table, grouped by category.
- Catalog data is separate from forecasting data. Matching occurs by skill name only when a forecast is run.

## 9. Backend layers and functions

### Routes

`backend/src/routes/skill.routes.ts` defines the addresses and attaches authentication, permission, and validation middleware.

### Controller

`backend/src/controllers/skill.controller.ts` translates HTTP input into service calls and uses `sendSuccess()` to create a consistent response.

### Service

`backend/src/services/skill.service.ts` contains:

| Function | Responsibility |
|---|---|
| `listMasterSkills()` | Read the master catalog |
| `getUserSkills(userId)` | Read one user’s tracked skills and joined skill information |
| `addUserSkill(userId, dto)` | Create a tracked skill |
| `updateUserSkill(userId, userSkillId, dto)` | Update proficiency/verification fields |
| `deleteUserSkill(userId, userSkillId)` | Remove a tracked skill |
| `getAssessments(userId, skillId?)` | Read all or skill-filtered assessments |
| `logAssessment(userId, skillId, dto)` | Create an assessment |
| `runForecast(userId, skills)` | Call Module A, deduplicate alerts, create notifications, return forecast |

### Python bridge

`backend/src/services/python.service.ts` posts JSON with a default 60-second timeout. `PYTHON_MODULE_A_URL` defaults to `http://localhost:8001`.

- An HTTP 4xx/5xx from FastAPI is propagated as an error.
- A connection error or timeout uses `MOCK_FORECAST` for this module.

This distinction is important: invalid/missing model artifacts do not silently use mock data, but an unreachable Module A does.

## 10. API reference

All integrated endpoints require a valid JWT.

| Method | Integrated path | Permission | Body/query |
|---|---|---|---|
| GET | `/api/skills` | `skills:read` | — |
| GET | `/api/skills/user` | `skills:read` | — |
| POST | `/api/skills/user` | `skills:write` | `skill_id`, proficiency fields |
| PATCH | `/api/skills/user/:userSkillId` | `skills:write` | Fields to update |
| DELETE | `/api/skills/user/:userSkillId` | `skills:write` | — |
| GET | `/api/skills/assessments?skill_id=...` | `skills:read` | Optional master skill ID |
| POST | `/api/skills/user/:skillId/assess` | `skills:write` | `score`, optional `notes` |
| POST | `/api/skills/forecast` | `skills:read` | Optional `skills: string[]` |

Module A also provides standalone endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/status` | Dataset, models, scrape, and scheduler status |
| GET | `/api/forecasts/top?n=20` | Top 1–57 skills by four-week demand |
| GET | `/api/forecasts/chart/{skill}` | Historical and forecast series |
| GET | `/api/forecasts/all` | One-step summary for every skill |
| POST | `/forecast` | Integrated personalized response |
| GET | `/api/lead-lag?significant_only=true` | Lead-lag results |
| GET | `/api/bundles` | Trending skill pairs |
| GET | `/api/clusters` | Cluster assignments |
| GET | `/api/history/{skill}` | Historical weekly series |

## 11. Forecast request and response contract

Request from frontend to Express:

```http
POST /api/skills/forecast
Authorization: Bearer <supabase-jwt>
Content-Type: application/json
```

```json
{
  "skills": ["React", "Python", "Node.js"]
}
```

Express adds the authenticated user ID when calling FastAPI:

```json
{
  "user_id": "authenticated-user-uuid",
  "skills": ["React", "Python", "Node.js"]
}
```

Integrated success response:

```json
{
  "success": true,
  "message": "Forecast generated",
  "data": {
    "trending": [
      {
        "skill": "react",
        "rank": 1,
        "predicted_weekly_demand": 278,
        "current_weekly_demand": 251,
        "velocity": "rising",
        "change_pct": 11
      }
    ],
    "early_warnings": [
      {
        "skill": "langchain",
        "weeks_ahead": 4,
        "correlation": 0.89,
        "interpretation": "Global leads local by 4w"
      }
    ],
    "forecast_chart": [
      { "week": "2026-W27", "react": 272 },
      { "week": "2026-W28", "react": 276 }
    ],
    "matched": true,
    "matched_skills": ["React"]
  }
}
```

The numeric values above illustrate the contract; actual values come from the current artifacts.

## 12. Database design

| Table | Important fields | Purpose |
|---|---|---|
| `skills` | `id`, `name`, `category`, `description` | Master catalog |
| `user_skills` | `user_id`, `skill_id`, proficiency, GitHub verification, confidence | Personal skill profile |
| `skill_assessments` | `user_id`, `skill_id`, `score`, `notes`, `assessed_at` | Score history |
| `skill_alert_history` | `user_id`, `skill`, `weeks_ahead`, `sent_at` | Warning deduplication |
| `notifications` | notification title, message, type, user | User-facing alert created by the notification service |

Key constraints:

- `(user_id, skill_id)` is unique in `user_skills`;
- proficiency level must be 1–5;
- assessment score must be 0–100;
- `(user_id, skill)` is unique in `skill_alert_history`.

Forecast results are not stored in Supabase. They remain in Module A artifact files and are formatted on every request.

For each warning, the backend performs an upsert with `ignoreDuplicates: true`. Only inserted rows are returned. Notifications are created only for those returned rows, preventing repeated alerts when the same user reruns a forecast.

## 13. Validation, security, and errors

### Validation

- Add skill: UUID, integer proficiency 1–5, approved proficiency label.
- Update: optional valid proficiency, boolean verification, confidence 0–1.
- Assessment: score 0–100 and optional trimmed notes.
- Forecast: optional array of strings.

### Security

- Every integrated skill route requires authentication.
- Read and write permissions are separated.
- Service queries include the authenticated `user_id`.
- Supabase Row Level Security policies restrict users to their own records.
- The browser never calls Module A directly in the integrated flow.
- The backend uses the service-role client and must keep that key server-side.

### Common failure behavior

| Failure | Result |
|---|---|
| Missing/expired token | 401; Axios clears local session and redirects to login |
| Missing permission | 403 |
| Invalid request | Validation error before controller logic |
| Duplicate personal skill | 409 `Skill already added` |
| Module A returns 404/500 | Backend reports the Python service error |
| Module A unreachable/timeout | Backend returns mock forecast data |
| Alert-history write fails | Logged; forecast still returns |
| Notification creation fails | Ignored for forecast availability |

The mock result contains React, TypeScript, Node.js, Python, Docker, and AWS, plus warnings for Bun.js, LangChain, and Rust. Repeatedly seeing those exact skills is a useful indication that Module A is unreachable.

## 14. Testing checklist

1. Confirm Module A status at `http://localhost:8001/api/status`.
2. Confirm `forecasts.csv` contains 12 steps for every trained skill.
3. Run a forecast with no personal skills and verify the market fallback message.
4. Add a matching skill and verify `matched: true`.
5. Add a nonmatching catalog skill and verify it does not break the request.
6. Verify forecast cards equal the API’s `trending` values.
7. Verify the bar chart uses current and predicted fields.
8. Verify the line chart has 12 points and up to three skill lines.
9. Verify only statistically filtered warnings appear.
10. Run the same forecast twice and verify no duplicate notification is created.
11. Stop Module A and confirm the mock fallback appears.
12. Restart Module A and confirm artifact-based results return without restarting Express.

## 15. Important limitations and improvement points

- The development history is almost entirely synthetic; a small real-data pilot (`scraping/topjobs_scraper.py`, `provenance` column) has started but currently covers a single week and a handful of skills. Research conclusions should clearly label the dataset as synthetic-dominant until real coverage grows substantially.
- `current_weekly_demand` currently uses historical average demand, despite UI wording that says “now.” Use `last_actual_count` if the intended definition is the most recent week.
- Personalization filters/ranks tracked skills; it does not yet use proficiency, assessments, or learning goals to adjust recommendations.
- Forecast accuracy metrics and confidence intervals are not exposed to the integrated frontend.
- Cluster and bundle outputs are not shown in the main Skill page.
- CORS in Module A currently allows all origins and should be restricted for production.
- The mock fallback keeps demonstrations available but should be visibly labelled to avoid confusing sample data with live model output.
- Dynamic skill names are used as chart object keys; a structured `{week, values:[...]}` contract would be safer for unusual names.

## 16. Code map

| Area | File |
|---|---|
| Main frontend page | `frontend/src/app/(dashboard)/skill/page.tsx` |
| Frontend API calls | `frontend/src/services/skill.service.ts` |
| Frontend forecast types | `frontend/src/types/index.ts` |
| Shared authenticated Axios client | `frontend/src/lib/axios.ts` |
| Express routes | `backend/src/routes/skill.routes.ts` |
| Controller | `backend/src/controllers/skill.controller.ts` |
| Business/database service | `backend/src/services/skill.service.ts` |
| Python HTTP bridge | `backend/src/services/python.service.ts` |
| Request validation | `backend/src/validations/skill.validation.ts` |
| Module A FastAPI | `python-module-a/api/app.py` |
| Forecast model | `python-module-a/model/forecasting.py` |
| Lead-lag model | `python-module-a/model/lead_lag.py` |
| Clustering/bundles | `python-module-a/model/clustering.py` |
| Training orchestrator | `python-module-a/train.py` |
| Weekly update | `python-module-a/scraping/weekly_scraper.py` |
| Skills database migration | `backend/supabase/migrations/0010_skills.sql` |
| Alert history migration | `backend/supabase/migrations/0022_skill_alert_history.sql` |

## 17. One-sentence summary

Module A transforms weekly global and Sri Lankan skill-demand observations into precomputed 12-week forecasts and early-warning signals, which travel through FastAPI and the authenticated Express API to personalized React cards, warnings, notifications, and charts.
