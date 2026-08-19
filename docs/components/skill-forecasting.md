# Skill Forecasting — Complete Technical and Functional Documentation

> ✅ **Status (2026-08-19):** this document reflects the supervisor-review improvement work — see [`docs/skill-forecasting-review-report.md`](../skill-forecasting-review-report.md) (what was reviewed), [`docs/skill-forecasting-improvement-plan.md`](../skill-forecasting-improvement-plan.md) (phase-by-phase build log, all 5 phases done), and [`docs/skill-forecasting-model-comparison.md`](../skill-forecasting-model-comparison.md) (the full model bake-off, §4.6 below summarises it). A related, separate audit of the rest of the `/skill` page (GitHub verification, catalog, assessments — not forecasting) lives in [`docs/skill-intelligence-gap-analysis.md`](../skill-intelligence-gap-analysis.md).

## 1. Purpose

The Skill Forecasting component (Module A) predicts demand for IT skills in the Sri Lankan market for the next 12 weeks. It helps a student answer:

> Which skills should I learn now, and which global skill trends are likely to reach Sri Lanka next?

The component combines:

- a personal skill profile;
- weekly global and Sri Lankan demand data (mostly synthetic today, with a small and growing real pilot — §4.1);
- **Exponential Smoothing (Holt-Winters) as the primary forecasting method**, with ARIMA kept only as a fallback (§4.3 — this flipped from the original ARIMA-primary design after the model comparison in §4.6);
- confidence-interval-gated trend classification, so "rising"/"falling" reflects the forecast's own uncertainty band, not just historical slope;
- an **established vs. emerging** two-tier trending view, so a small fast-growing skill isn't permanently buried under large flat ones (§7.1);
- global-to-local lead-lag analysis for early warnings;
- a Next.js dashboard with rankings, warnings, and charts;
- deduplicated user notifications for new early warnings.

The historical dataset is still **synthetic-dominant**: as of the last real scrape, 7,524 of 7,581 dataset rows are synthetic, 49 are `carried_forward` (a skill the real scraper didn't observe that week, backfilled from its last known value rather than read as zero), and only 8 are genuinely `real` (§4.1). `scraping/topjobs_scraper.py` is now wired into the weekly scheduler, so real coverage grows a little every Monday — but it is not yet large enough to change which forecasting method wins or to re-validate the model comparison on real data.

## 2. System architecture

```text
Raw/global and local trend data (synthetic + a small, growing real pilot)
        |
        v
Dataset builder -> weekly_skill_dataset.csv (+ provenance column) + jobs_with_skills.csv
        |
        +--> Forecasting model -> forecasts.csv + model artifacts (ES primary, ARIMA fallback)
        +--> Lead-lag model    -> lead_lag_analysis.csv
        +--> Clustering model  -> skill_clusters.csv + skill_bundles.csv
        +--> Backtest harness  -> backtest_report.csv + backtest_summary.csv (accuracy vs. naive)
                                      |
                                      v
Next.js frontend -> Express backend -> FastAPI Module A
      :3000             :8081              :8001
                           |
                           +--> Supabase: skills (+ type taxonomy, Soft Skills catalog),
                                assessments, alert history, and notifications
```

The machine-learning calculations are performed during training. A normal user request does not retrain a model. FastAPI reads the generated artifacts, selects and formats the relevant results, and returns them quickly.

## 3. Main functions available to the user

| Function | User action | Result |
|---|---|---|
| View skill catalog | Open **Skill Catalog** | Master skills grouped by category, with a Technology / Tool / Competency filter |
| Add a skill | Select a skill and proficiency | A new personal skill record |
| Update proficiency | Change Beginner, Intermediate, or Advanced | Updated profile skill |
| Remove a skill | Click remove | Skill removed from the profile |
| Verify through GitHub | Connect GitHub and click **Verify Skills** | Verification/confidence fields updated by the GitHub module |
| Log assessment | Select a skill, score, and optional notes | Assessment history entry |
| Run forecast | Open **Forecast** and click **Run Forecast** | Personalized established + emerging skill views |
| View early warnings | Run a forecast | Global trends expected to lead local demand |
| Receive warning notification | Receive a previously unseen warning | One notification per user and skill |

## 4. Data lifecycle

### 4.1 Raw inputs

The generated development dataset covers 57 skills. Four sources are represented:

| File | Scope | Meaning |
|---|---|---|
| `data/raw/global/trends_global.csv` | Global | Google Trends-style interest index |
| `data/raw/global/linkedin_jobs.csv` | Global | LinkedIn-style job demand index |
| `data/raw/local/trends_lk.csv` | Sri Lanka | Local Google Trends-style index |
| `data/raw/local/topjobs_lk.csv` | Sri Lanka | TopJobs-style job demand index (synthetic weekly continuation) |
| `data/raw/local/topjobs_lk_real.csv` | Sri Lanka | **Real** TopJobs.lk scrape output (§ below) |

`scraping/generate_trends_dataset.py` creates the reproducible synthetic demonstration data (linear ramps, sigmoid adoption curves, hype-cycle shapes, each with Gaussian noise, fixed seed). It also writes `data/output/skill_taxonomy.csv` — a Language/Framework/Platform/Practice subtype for all 57 skills (§4.7).

**Real data pilot.** `scraping/topjobs_scraper.py` scrapes TopJobs.lk's two IT job categories (`FA=SDQ`, `FA=HNS` — no pagination, the whole scrape is 2 HTTP requests) for a real weekly skill-mention score: `% of listings whose title/blurb mention the skill`, matched against the 57-skill vocabulary with word-boundary-safe alias matching (reusing `train.py`'s `SKILL_ALIASES` table). It never stores job titles, descriptions, or company names — only the aggregate `{skill: percentage}` result. Checked live before building: TopJobs.lk has no `robots.txt` entry and its Terms & Conditions contain no scraping/bot restriction (only an IP-reuse clause, which this pilot respects by never storing raw listing text).

`scraping/build_trends_dataset.py` merges real rows into `weekly_skill_dataset.csv` alongside the synthetic data, tagged with a `provenance` column: `synthetic`, `real`, or `carried_forward` (a skill the real scraper didn't observe in a given real week gets its last known value carried forward rather than implicitly read as zero demand — without this, a partial real scrape reads as a false demand cliff for every skill it didn't happen to mention that week; this exact bug was caught and fixed during Phase 3, see the improvement plan).

**Current real-data measurement** (from the live dataset file): **7,581 total rows across 133 weeks and 57 skills — 7,524 synthetic, 49 carried_forward, 8 real.** The 8 real-provenance skills (from the first live scrape, 269 listings scanned) are `java`, `devops`, `aws`, `python`, `cybersecurity`, `csharp`, `angular`, `dotnet`. This is still genuinely small — the pilot needs an ongoing weekly run to accumulate meaningfully, which is exactly what the scheduler wiring below provides. Real depth can only ever grow one calendar week at a time: TopJobs.lk shows current live postings only, so there's no way to retroactively backfill past weeks.

**Scheduler wiring.** `scraping/topjobs_scraper.py` now runs as part of `api/app.py`'s existing Monday 08:00 APScheduler job, before the synthetic continuation step — so real coverage grows automatically every week the service is left running, not just when someone manually re-runs the scraper.

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
   - `co_skills`: skills active together in that period;
   - `provenance`: `synthetic` / `real` / `carried_forward` (§4.1).

2. `data/processed/jobs_with_skills.csv`
   - weighted rows representing source-level skill frequency;
   - used by lead-lag and co-occurrence analysis.

### 4.3 Forecast training

`model/forecasting.py` builds a separate time series for every skill. **Exponential Smoothing (Holt-Winters, additive trend) is now the primary method** — it won the model comparison in §4.6 — with ARIMA kept only as a fallback if ES itself fails to fit:

| Available history | Method |
|---|---|
| 4 or more weeks | Holt Exponential Smoothing with additive trend (primary) |
| ES fit fails, and ≥ 8 weeks of history | ARIMA(1,1,1) (fallback) |
| Both fail, or fewer than 4 weeks | Skill is skipped, or repeats the most recent value |

Negative predictions are clamped to zero. The model predicts 12 future weeks.

**Endpoint-anomaly guard.** If a series' final observed point is under 20% of its own trailing 5-week average, that point is excluded from model fitting — but still reported honestly via `last_actual_count`, flagged with a new `endpoint_anomaly_excluded` column. This exists because the real pilot's `trend_index` lands on a 0–100 percentage scale right next to a synthetic series in the 0–300 range; without the guard, one low real-data point (e.g. `int(0.4)` truncating to `0`) reads as a demand cliff and every confidence interval built on it looks like guaranteed growth. Caught during Phase 4a: the first regenerated forecast flagged exactly the 8 real-provenance skills as newly "rising" for this reason, not a real signal.

**Trend classification now uses the forecast's own confidence interval**, not just historical slope:

```text
classify_trend_ci(): rising  -> the 12-week-ahead CI's lower bound is above today's level
                      falling -> the CI's upper bound is below today's level
                      otherwise -> stable
```

ARIMA gets a native confidence interval (`get_forecast().conf_int()`); ES doesn't support one in the installed `statsmodels` version, so it's estimated via a 500-repetition `.simulate()` with a 2.5th/97.5th percentile band. The old pure-historical-slope method (`relative_slope` vs. ±0.005) still exists as `classify_trend()` and is used only as a fallback when a confidence interval can't be computed.

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
| `trend` | Rising, stable, or falling (now CI-gated) |
| `method` | ARIMA or ES |
| `last_actual_count` | Latest observed demand |
| `avg_actual_count` | Historical average used by the integrated API |
| `growth_score` | `(mean predicted, steps 9–12 − mean actual, last 4 weeks) / historical mean` — the forecast's own trajectory, used to rank the "emerging" tier (§7.1) |
| `ci_lower_step12` / `ci_upper_step12` | The 12-week-ahead confidence band feeding `classify_trend_ci()` |
| `endpoint_anomaly_excluded` | `true` if the anomaly guard above excluded this skill's last point from fitting |

> **A known, flagged inconsistency:** two other scripts still contain their own independent copies of the old ARIMA-primary, slope-only forecasting logic and were **not** updated by this work — top-level `train.py` (a self-contained duplicate with its own dataset builder) and `predict.py` (now fully orphaned from the automated pipeline, since `weekly_scraper.py` was repointed at `model/forecasting.py`'s full refit instead — see §5). Both still exist on disk, unused by the scheduled path but not deleted. Whichever of `train.py` or `model/pipeline.py`/`forecasting.py` is run manually last silently becomes "what's actually in `forecasts.csv`," since both write to the same output paths — a flagged, not-yet-consolidated risk, not a bug in either individually.

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

**Does the lead-lag signal actually improve the forecast itself?** Tested directly (`model/exog_experiment.py`, §4.6) by feeding the global series into the local ARIMA forecast as an exogenous regressor, on the 32 skills with a statistically significant lead-lag relationship: it made point forecasts *worse* on 21 of those 32 skills (MAE 5.32 vs. 5.24 for the plain local-only model). **The correlation is real — that's what `granger_sig` already means — it just doesn't translate into a better point forecast this way.** Kept as a UI early-warning signal only; not fed into the forecast numbers.

### 4.5 Clusters and bundles

`model/clustering.py` creates:

- semantic groupings using BERTopic when available;
- eight KMeans clusters based on normalized skill co-occurrence;
- trending two-skill bundles based on recent versus older co-occurrence.

These outputs are available from Module A's standalone API, but the current main Skill page does not display them.

### 4.6 Model comparison — why Exponential Smoothing is now primary

Before adding new candidates, a **backtest harness** (`model/backtest.py`) was built first — a rolling-origin walk-forward evaluation that fits on an expanding training window and scores 4-week-ahead forecasts against actuals already present in the dataset, computing MAE/RMSE/MAPE per (skill, origin, method), plus a naive (last-value-repeat) baseline. Without this, "compare models" would have had nothing to score against. Full write-up: [`docs/skill-forecasting-model-comparison.md`](../skill-forecasting-model-comparison.md).

Five candidates, evaluated on all 57 skills of the current (synthetic-dominant) dataset:

| Candidate | MAE | RMSE | MAPE | Beats naive | Best-per-skill wins |
|---|---|---|---|---|---|
| **Holt-Winters (Exponential Smoothing)** | **6.93** | 9.17 | **7.41%** | 57/57 (100%) | **27 / 57** |
| SARIMA | 7.06 | 9.62 | 7.44% | 55/57 (96%) | 24 / 57 |
| ARIMA(1,1,1) *(previous production default)* | 7.15 | **9.41** | 7.58% | 57/57 (100%) | 6 / 57 |
| XGBoost | 8.05 | 10.15 | 8.51% | 48/57 (84%) | 0 / 57 |
| Naive (last-value repeat) | 8.72 | 10.99 | 9.17% | — | — |

**Adopted: Holt-Winters (Exponential Smoothing)**, now `forecasting.py`'s primary method (§4.3) — it wins on overall MAE and MAPE, ties ARIMA's 100% naive-beat rate, and is the single best-per-skill choice more than 4× as often (27 vs. 6). It also won in every one of the three generated skill shapes tested (steady linear trends, sigmoid adoption curves, hype-cycle bumps) — a consistent result, not a narrow one.

**Not adopted:**
- **SARIMA** — a seasonality check (`model/seasonality_check.py`) found no consistent periodic signal across all 57 skills before SARIMA was even built (mean |ACF| at every plausible period sat near the noise threshold) — expected, since the synthetic generator only adds i.i.d. noise, nothing periodic. SARIMA's edge over Holt-Winters (7.06 vs. 6.93 MAE) is marginal and unsupported by real seasonal evidence, and it's also the slowest candidate by a wide margin.
- **XGBoost** — underperforms even the naive baseline on 16% of skills. This is a structural limitation, not a tuning gap: gradient-boosted trees split on the range of values seen in training and can't extrapolate a monotonic trend beyond it — a poor fit for this dataset's steadily-rising or -falling demand shapes.

**Caveat, stated plainly:** all of the above is measured on the current, still synthetic-dominant dataset. A method that wins on generated linear/sigmoid/bump shapes with i.i.d. noise is not guaranteed to still win once real TopJobs.lk data (§4.1) is large enough to re-run this comparison on. It should be re-run once real coverage is substantial.

### 4.7 Skill taxonomy and soft skills

Two independent pieces of work, both scoped by the review's Areas 4 and 5:

**Technology / Tool / Competency taxonomy.** The app's Supabase `skills.category` field (Frontend/Backend/Cloud/...) already existed; migration `0029_skills_type_taxonomy.sql` adds a **second, independent** `type` column (`technology` / `tool` / `competency`) rather than replacing it, backfilled for all 130 pre-existing catalog rows against a written rule (Technology = a specific named language/framework/database/runtime/platform; Tool = a specific named product supporting build/test/deploy/operate; Competency = a discipline or practice area, not a single product). Module A's own 57-skill forecasting list separately gained a `SKILL_SUBTYPES` mapping (language/framework/platform/practice, written to `data/output/skill_taxonomy.csv`) — a parallel, lighter categorization since Module A has no database client and only reads/writes local files. The Skill Catalog tab now has a Technology/Tool/Competency filter reading the Supabase `type` column.

**Soft skills.** Neither Module A's 57-skill list nor the Supabase catalog contained a single soft skill before this — both were 100% technical, because none of Module A's four data sources are text (they're all numeric 0–100 trend indices), so there was nothing to extract "communication" or "leadership" from. Migration `0030_soft_skills_catalog.sql` seeds 12 soft skills into the catalog (`category='Soft Skills'`, `type='competency'`) so users can track them today. A keyword-extraction pipeline (`scraping/soft_skills.py`, `scraping/soft_skill_pipeline.py`) was also built and unit-tested, ready to aggregate soft-skill mentions from real job-posting text into the same `week, skill, trend_index, provenance` shape §4.1 already uses — but its data source is **deliberately stubbed**: getting real signal means fetching each individual job posting's full description (~270+ requests) rather than the 2 category-page requests the rest of Module A uses, a materially bigger footprint that wasn't assumed into scope without a separate go-ahead. (Checked empirically: of 184 live TopJobs.lk listings, 154 had a placeholder blurb with zero real content — confirming there's no soft-skill signal to extract from the category-page text Module A currently touches anyway.)

**Canonical skill-name matching.** Both the forecast endpoint's skill filter and `topjobs_scraper.py`'s text matching now go through one shared alias table (`train.py`'s `SKILL_ALIASES`, extended with entries like `"large language models"→"llm"` and `"ruby on rails"→"ruby"`) before falling back to the old blanket lowercase/strip-`.js`/strip-period transform — an explicit, auditable single source of truth for "which display names mean the same skill," replacing the old implicit string heuristic without breaking anything that matched before.

> **Not yet applied:** migrations `0029` and `0030` (like `0031`/`0032` in the CV module) exist in this repo but have not been confirmed applied to the live Supabase database in this environment — see the project-wide note that migration files here don't auto-apply. `backend/src/services/skill.service.ts` already selects the new `type` column; if the migration hasn't run yet, that select will fail against the live schema.

## 5. Training and weekly update workflow

Initial model preparation:

```bash
cd python-module-a
pip install -r requirements.txt
python scraping/generate_trends_dataset.py
python scraping/build_trends_dataset.py
python train.py --skip-dataset
```

> Note the caveat in §4.3: `train.py` is a separate, not-yet-consolidated copy of the forecasting logic that still predates the Exponential-Smoothing switch and the new columns. For the current production behavior, prefer `python model/pipeline.py` (optionally with `--backtest` to also run the accuracy harness).

Start Module A:

```bash
python api/app.py
```

FastAPI starts an APScheduler background job for Monday at 08:00 in `Asia/Colombo`. It runs `scraping/weekly_scraper.py`, which now: (1) runs the real `topjobs_scraper.py` pilot first, merging any new real-provenance rows; (2) extends the synthetic series with a damped-momentum random walk, same as before; (3) rebuilds `weekly_skill_dataset.csv`; (4) regenerates forecasts via `model/forecasting.py`'s full refit (switched from the older, separate `predict.py` — see §4.3's flagged-duplicate note; under 2 seconds for 57 skills, so there's no performance reason to have kept the incremental path, and `predict.py` had none of Phase 4a's fixes). The scheduler belongs inside the API process; running a second scheduler process can cause duplicate jobs.

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
11. Skill names are matched via the canonical alias table first, falling back to the old lowercase/period/`.js`-stripping heuristic (§4.7) — not a blanket transform alone anymore.
12. FastAPI creates the two-tier `trending` (`established`/`emerging`), `early_warnings`, and `forecast_chart`.
13. Express records unseen warnings in `skill_alert_history` and creates notifications.
14. Express wraps the result in the standard API envelope.
15. React saves it in `forecast` state and renders the established/emerging cards and charts.

## 7. How each response field is produced and displayed

### 7.1 `trending` — now two tiers, not one flat list

**This is the biggest contract change in this document.** The old design ranked all matched skills into one flat list by raw predicted volume — which systematically buried small, fast-growing skills below large, already-saturated ones (a large skill like Java will always out-rank a much faster-growing but smaller skill like LangChain on raw volume alone). `trending` is now:

```json
{ "established": [ /* up to 8 */ ], "emerging": [ /* up to 8 */ ] }
```

- **`established`** — skills at or above the candidate pool's median historical demand, ranked by **predicted volume** (same idea as the old ranking, but only among the "big" half).
- **`emerging`** — skills below that median, ranked by **`growth_score`** (the forecast's own steps-9–12-vs-recent-actual trajectory, §4.3) — this is the tier that specifically surfaces "small today, growing fast," which a single volume-sorted list would otherwise hide behind established skills forever.

Both tiers share the same per-item shape:

| Response field | Calculation/source | Frontend use |
|---|---|---|
| `skill` | `forecasts.csv.skill` | Card title and chart label |
| `rank` | Position within its tier after filtering and sorting | `#N established` or `#N emerging` |
| `predicted_weekly_demand` | Rounded mean prediction for weeks 1–4 | Large card value and forecast bar |
| `current_weekly_demand` | Rounded historical `avg_actual_count` | "now" text and current bar |
| `velocity` | CI-gated trend classification (§4.3) | Arrow and color |
| `change_pct` | `(avg prediction − avg actual) / avg actual * 100` | Percentage beside arrow |
| `growth_score` | The forecast-trajectory score used to rank the emerging tier | Available to the frontend; primarily drives sort order, not separately labelled on the card |

If at least one requested skill matches, `established`/`emerging` are built only from the matched skills; otherwise (or if none match) both tiers reflect the overall market.

### 7.2 `early_warnings`

| Response field | Source | Frontend use |
|---|---|---|
| `skill` | Lead-lag CSV | Warning name |
| `weeks_ahead` | `best_lag_weeks` | Approximate global lead label |
| `correlation` | Rounded CCF correlation | Confidence context in warning text |
| `interpretation` | Lead-lag CSV | Available to consumers; not separately rendered by the current page |

Remember (§4.4): this correlation is a genuine, tested signal for "global trends usually arrive here N weeks later," but it's intentionally **not** fed into the forecast numbers themselves — testing it as a SARIMAX exogenous input made point forecasts worse on the majority of qualifying skills.

### 7.3 `forecast_chart`

The API selects a **representative mix from both tiers** — the top 2 established skills plus the top 1 emerging skill — rather than simply "the top 3 overall" as before, so the chart doesn't just repeat the established list. For each forecast step 1–12 it creates a dynamic object:

```json
{
  "week": "2026-W27",
  "python": 304,
  "react": 278,
  "langchain": 41
}
```

The frontend uses the first property (`week`) as the X axis and creates one Recharts line for every other property. Skill names remain dynamic JSON keys.

### 7.4 Personalization metadata

| Field | Meaning | UI behavior |
|---|---|---|
| `matched` | At least one tracked skill matched forecast data | Chooses personalized versus market wording |
| `matched_skills` | Original display names that matched | Shows "Forecast for N of your skills" |

If the user has no skills, or none match, `matched` is false and the frontend shows an amber message explaining that overall market skills are displayed. Matching itself now goes through the canonical alias table before falling back to the old blanket-lowercase heuristic (§4.7, §6 step 11) — this fixed cases like `"C#"` or `"Large Language Models"` that the old blanket transform alone wouldn't reliably line up with their forecast keys.

## 8. Frontend structure and behavior

Main page: `frontend/src/app/(dashboard)/skill/page.tsx`

API wrapper: `frontend/src/services/skill.service.ts`

Types: `frontend/src/types/index.ts` (`TrendingTiers` for the established/emerging shape)

### Initial page loading

The page runs four requests, each with its **own** error handling (`Promise.allSettled`, not one shared `Promise.all`) so one flaky endpoint no longer blanks out the other three's data with a single generic "failed to load" toast:

- `GET /skills/user` for personal skills;
- `GET /skills` for the master catalog (now including each skill's `type`);
- `GET /skills/assessments` for assessment history;
- GitHub status from the GitHub service.

The standard response is read from `response.data.data` and stored in React state.

### Tab: My Skills

- Displays tracked skill name and category.
- Displays and edits proficiency.
- Shows GitHub verification (now correctly reset if you disconnect GitHub or a skill no longer matches on re-verification — see the gap-analysis doc §1.2).
- Adds skills from the master catalog.
- Removes personal skill records (behind a confirmation dialog now, not an instant destructive click).

The route parameter for update/delete is `user_skills.id`, named `:userSkillId` in the route itself (renamed from the ambiguous `:skillId` both this route and the assessment route used to share — see §13).

### Tab: Forecast

- Calls the forecast only when the user clicks the button.
- Sends tracked skill names, not IDs.
- Shows up to eight **established** cards and up to eight **emerging** cards, in two visually separated groups.
- Shows early-warning rows.
- Shows a current-versus-predicted bar chart.
- Shows a 12-week line chart for the representative established+emerging mix (§7.3).

### Tab: Assessments

- Displays prior scores, paginated.
- Sends the master `skill_id`, score 0–100, and optional notes when logging an assessment — the backend now also verifies you actually track that skill first (§13).

### Tab: Skill Catalog

- Displays all rows from the `skills` table, grouped by category, with a Technology/Tool/Competency filter and a search box.
- Catalog data is separate from forecasting data. Matching occurs by skill name (via the canonical alias table) only when a forecast is run.

## 9. Backend layers and functions

### Routes

`backend/src/routes/skill.routes.ts` defines the addresses and attaches authentication, permission, and validation middleware. Update/delete now use `:userSkillId` as the path parameter name (was the ambiguous `:skillId`, shared in name — though not in meaning — with the assessment route's master-skill id parameter).

### Controller

`backend/src/controllers/skill.controller.ts` translates HTTP input into service calls and uses `sendSuccess()` to create a consistent response.

### Service

`backend/src/services/skill.service.ts` contains:

| Function | Responsibility |
|---|---|
| `listMasterSkills()` | Read the master catalog, including each skill's `type` (Technology/Tool/Competency) |
| `getUserSkills(userId)` | Read one user's tracked skills and joined skill information |
| `addUserSkill(userId, dto)` | Create a tracked skill |
| `updateUserSkill(userId, userSkillId, dto)` | Update proficiency fields — `github_verified`/`confidence_score` are no longer client-settable through this endpoint (closed a self-assertion gap, see §13); now checks the row actually existed/belonged to the user and returns a real 404 instead of silently "succeeding" on a no-op |
| `deleteUserSkill(userId, userSkillId)` | Remove a tracked skill — same real-404-on-no-op fix as above |
| `getAssessments(userId, skillId?)` | Read all or skill-filtered assessments |
| `logAssessment(userId, skillId, dto)` | Create an assessment — now verifies the skill is actually in the caller's `user_skills` first |
| `runForecast(userId, skills)` | Call Module A, deduplicate alerts, create notifications, return the established/emerging forecast |

### Python bridge

`backend/src/services/python.service.ts` posts JSON with a default 60-second timeout. `PYTHON_MODULE_A_URL` defaults to `http://localhost:8001`.

- An HTTP 4xx/5xx from FastAPI is propagated as an error.
- A connection error or timeout uses `MOCK_FORECAST` for this module — already updated to the two-tier `{ established, emerging }` shape, so a mock response and a real one are structurally identical to every consumer.

This distinction is important: invalid/missing model artifacts do not silently use mock data, but an unreachable Module A does.

**Other backend consumers of Module A's forecast**, also already updated to the two-tier shape (confirmed by grep, no lingering flat-array assumption anywhere): `career.service.ts`'s market-enrichment step and `cv.service.ts`'s CV gap-skill demand annotation both simply combine `established`+`emerging` into one flat skill→trend lookup, since neither needs the established/emerging ranking itself — they only need "what's the trend for skill X."

## 10. API reference

All integrated endpoints require a valid JWT.

| Method | Integrated path | Permission | Body/query |
|---|---|---|---|
| GET | `/api/skills` | `skills:read` | — |
| GET | `/api/skills/user` | `skills:read` | — |
| POST | `/api/skills/user` | `skills:write` | `skill_id`, proficiency fields |
| PATCH | `/api/skills/user/:userSkillId` | `skills:write` | Fields to update (verification fields no longer accepted here) |
| DELETE | `/api/skills/user/:userSkillId` | `skills:write` | — |
| GET | `/api/skills/assessments?skill_id=...` | `skills:read` | Optional master skill ID |
| POST | `/api/skills/user/:skillId/assess` | `skills:write` | `score`, optional `notes` — `:skillId` here is the **master** `skills.id`, a different id than the `:userSkillId` above (kept distinct on purpose after the rename, see §13) |
| POST | `/api/skills/forecast` | `skills:read` | Optional `skills: string[]` |

Module A also provides standalone endpoints:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/status` | Dataset, models, scrape, and scheduler status |
| GET | `/api/forecasts/top?n=20` | Top 1–57 skills by four-week demand (still a flat ranking — this standalone endpoint wasn't part of the established/emerging redesign) |
| GET | `/api/forecasts/chart/{skill}` | Historical and forecast series |
| GET | `/api/forecasts/all` | One-step summary for every skill |
| POST | `/forecast` | Integrated personalized response (established/emerging) |
| GET | `/api/lead-lag?significant_only=true` | Lead-lag results |
| GET | `/api/bundles` | Trending skill pairs |
| GET | `/api/clusters` | Cluster assignments |
| GET | `/api/history/{skill}` | Historical weekly series |

`data/output/skill_taxonomy.csv` and the backtest/seasonality/exog-experiment CSVs (§4.6, §4.7) are generated but **not yet exposed by any endpoint** — useful artifacts for the reports/docs, not (yet) live API data.

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

Integrated success response — note `trending` is now `{ established, emerging }`:

```json
{
  "success": true,
  "message": "Forecast generated",
  "data": {
    "trending": {
      "established": [
        {
          "skill": "react",
          "rank": 1,
          "predicted_weekly_demand": 278,
          "current_weekly_demand": 251,
          "velocity": "rising",
          "change_pct": 11,
          "growth_score": 0.14
        }
      ],
      "emerging": [
        {
          "skill": "langchain",
          "rank": 1,
          "predicted_weekly_demand": 41,
          "current_weekly_demand": 22,
          "velocity": "rising",
          "change_pct": 86,
          "growth_score": 0.79
        }
      ]
    },
    "early_warnings": [
      {
        "skill": "langchain",
        "weeks_ahead": 4,
        "correlation": 0.89,
        "interpretation": "Global leads local by 4w"
      }
    ],
    "forecast_chart": [
      { "week": "2026-W27", "react": 272, "python": 298, "langchain": 38 },
      { "week": "2026-W28", "react": 276, "python": 301, "langchain": 40 }
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
| `skills` | `id`, `name`, `category`, `type` (Technology/Tool/Competency, migration 0029), `description` | Master catalog |
| `user_skills` | `user_id`, `skill_id`, proficiency, GitHub verification, confidence | Personal skill profile |
| `skill_assessments` | `user_id`, `skill_id`, `score`, `notes`, `assessed_at` | Score history |
| `skill_alert_history` | `user_id`, `skill`, `weeks_ahead`, `sent_at` | Warning deduplication |
| `notifications` | notification title, message, type, user | User-facing alert created by the notification service |

Key constraints:

- `(user_id, skill_id)` is unique in `user_skills`;
- proficiency level must be 1–5;
- assessment score must be 0–100;
- `(user_id, skill)` is unique in `skill_alert_history`;
- `skills.type` is check-constrained to `technology` / `tool` / `competency` (migration 0029).

Forecast results are not stored in Supabase. They remain in Module A artifact files and are formatted on every request.

For each warning, the backend performs an upsert with `ignoreDuplicates: true`. Only inserted rows are returned. Notifications are created only for those returned rows, preventing repeated alerts when the same user reruns a forecast.

> Catalog migrations, newest first: `0030_soft_skills_catalog.sql` (12 soft-skill catalog rows), `0029_skills_type_taxonomy.sql` (`type` column + backfill for all 130 pre-existing rows), `0025_expand_skills_catalog.sql`, `0010_skills.sql`. As with other migrations in this project, **confirm 0029/0030 have actually been applied to your live database before relying on the `type` column or seeing the Soft Skills catalog** — they aren't applied automatically.

## 13. Validation, security, and errors

### Validation

- Add skill: UUID, integer proficiency 1–5, approved proficiency label.
- Update: optional valid proficiency, boolean verification, confidence 0–1. **`github_verified`/`confidence_score` are no longer accepted on this schema** — they're now written only by the internal GitHub-verification service path, not by any client-facing request, closing a gap where a raw API call could previously self-assert `"github_verified": true` on any of your own skills without any real GitHub check.
- Assessment: score 0–100 and optional trimmed notes; the skill must actually be one you track (server-enforced now, not just a frontend dropdown restriction).
- Forecast: optional array of strings.

### Security

- Every integrated skill route requires authentication.
- Read and write permissions are separated.
- Service queries include the authenticated `user_id`.
- Supabase Row Level Security policies restrict users to their own records (though in practice the backend uses the RLS-bypassing service-role client throughout, so per-row ownership is actually enforced by the explicit `user_id` filters in the service layer, not by RLS itself).
- The browser never calls Module A directly in the integrated flow.
- The backend uses the service-role client and must keep that key server-side.
- **GitHub verification is now reset, not just additive.** Disconnecting GitHub clears `github_verified`/`confidence_score` back to false/null for every one of your skills instead of leaving stale "✓ GitHub" badges behind forever; re-verifying now computes your full desired state first and applies it as a reset-then-reapply, so a skill that no longer matches loses its old (now-stale) verification instead of just never being touched again.
- **Route parameter naming fixed.** `PATCH`/`DELETE /skills/user/:userSkillId` and `POST /skills/:skillId/assess` used to share an ambiguous `:skillId` name for two different ids (a `user_skills` row id vs. a master `skills` id) — the current frontend always got this right, but the shared name invited the exact mix-up it happened to avoid. Renamed for clarity; URL shapes are otherwise unchanged.

### Common failure behavior

| Failure | Result |
|---|---|
| Missing/expired token | 401; Axios clears local session and redirects to login |
| Missing permission | 403 |
| Invalid request | Validation error before controller logic |
| Duplicate personal skill | 409 `Skill already added` |
| Deleting/updating a skill that isn't yours or doesn't exist | 404 (previously silently "succeeded" on a no-op — fixed) |
| Module A returns 404/500 | Backend reports the Python service error |
| Module A unreachable/timeout | Backend returns mock forecast data (already in the established/emerging shape) |
| Alert-history write fails | Logged; forecast still returns |
| Notification creation fails | Ignored for forecast availability |

The mock result contains React, TypeScript, Node.js, Python, Docker, and AWS (as `established`), plus warnings for Bun.js, LangChain, and Rust. Repeatedly seeing those exact skills is a useful indication that Module A is unreachable.

## 14. Testing checklist

1. Confirm Module A status at `http://localhost:8001/api/status`.
2. Confirm `forecasts.csv` contains 12 steps for every trained skill, including `growth_score`/`ci_lower_step12`/`ci_upper_step12`/`endpoint_anomaly_excluded`.
3. Run a forecast with no personal skills and verify the market fallback message.
4. Add a matching skill and verify `matched: true`.
5. Add a nonmatching catalog skill and verify it does not break the request.
6. Verify established/emerging cards equal the API's `trending.established`/`trending.emerging` values.
7. Verify the bar chart uses current and predicted fields.
8. Verify the line chart has 12 points and reflects the established+emerging representative mix, not just the top 3 overall.
9. Verify only statistically filtered warnings appear.
10. Run the same forecast twice and verify no duplicate notification is created.
11. Stop Module A and confirm the mock fallback appears (already in the two-tier shape).
12. Restart Module A and confirm artifact-based results return without restarting Express.
13. Run `python model/backtest.py` and confirm it still beats the naive baseline on the vast majority of skills — a regression here would mean a code change broke forecast quality, not just a cosmetic bug.

## 15. Important limitations and improvement points

Most of the items in the original review are now addressed (§4.6, §4.7, §7.1) — what's left:

- **The historical dataset is still synthetic-dominant.** Real coverage (§4.1) is 8 of 7,581 rows as of the last scrape — growing weekly via the scheduler, but nowhere near enough yet to re-validate the §4.6 model comparison or the ES-vs-ARIMA choice on real market data. Research conclusions should keep labelling the dataset synthetic-dominant until real coverage grows substantially.
- **Two orphaned duplicate implementations exist**: `train.py` (its own copy of the old ARIMA-primary, slope-only logic, not updated by this work) and `predict.py` (no longer called by the scheduled path, replaced by `model/forecasting.py`'s full refit). Neither is deleted; whichever is run manually last silently determines what's actually in `forecasts.csv`. Flagged, not yet consolidated.
- **`current_weekly_demand` still uses historical average demand**, despite UI wording that says "now." Use `last_actual_count` if the intended definition is the most recent week.
- **Personalization filters/ranks tracked skills**; it does not yet use proficiency, assessments, or learning goals to adjust recommendations.
- **Forecast accuracy is now measured** (§4.6's backtest harness) but not yet exposed to the integrated frontend as a confidence/accuracy indicator.
- **Cluster and bundle outputs, and the new `skill_taxonomy.csv`, are computed but not shown** anywhere in the main Skill page or exposed via an endpoint.
- **CORS in Module A currently allows all origins** and should be restricted for production.
- **Soft-skill forecasting's real data source is deliberately stubbed** (§4.7) — the catalog and extraction pipeline exist and are tested, but no real soft-skill demand numbers flow through the system yet; activating it means a materially larger scrape footprint that needs its own explicit go-ahead.
- **Migrations 0029/0030 (skill taxonomy, soft-skills catalog) are not confirmed applied to the live database** — same "migrations aren't auto-applied" risk already known from the CV module; verify before relying on the `type` column or seeing Soft Skills in the catalog.
- Dynamic skill names are still used as `forecast_chart` object keys; a structured `{week, values:[...]}` contract would be safer for unusual names.

## 16. Code map

| Area | File |
|---|---|
| Main frontend page | `frontend/src/app/(dashboard)/skill/page.tsx` |
| Frontend API calls | `frontend/src/services/skill.service.ts` |
| Frontend forecast types | `frontend/src/types/index.ts` (`TrendingTiers`) |
| Shared authenticated Axios client | `frontend/src/lib/axios.ts` |
| Express routes | `backend/src/routes/skill.routes.ts` |
| Controller | `backend/src/controllers/skill.controller.ts` |
| Business/database service | `backend/src/services/skill.service.ts` |
| Python HTTP bridge | `backend/src/services/python.service.ts` |
| Request validation | `backend/src/validations/skill.validation.ts` |
| Module A FastAPI | `python-module-a/api/app.py` — see `/forecast`, `_canonical_skill_name()`, `_build_trending_tier()` |
| Forecast model | `python-module-a/model/forecasting.py` — see `classify_trend_ci()`, `guard_against_endpoint_anomaly()` |
| Lead-lag model | `python-module-a/model/lead_lag.py` |
| Clustering/bundles | `python-module-a/model/clustering.py` |
| Modular pipeline runner | `python-module-a/model/pipeline.py` (imports `forecasting.py`/`lead_lag.py`/`clustering.py`; `--backtest` flag) |
| Backtest harness | `python-module-a/model/backtest.py` |
| Model-comparison candidates | `python-module-a/model/forecast_candidates.py` (Holt-Winters-full, SARIMA, XGBoost) |
| Seasonality check | `python-module-a/model/seasonality_check.py` |
| Lead-lag-as-exogenous-input experiment | `python-module-a/model/exog_experiment.py` |
| Training orchestrator (stale duplicate — §4.3) | `python-module-a/train.py` |
| Orphaned incremental predictor (unused by the scheduled path — §4.3) | `python-module-a/predict.py` |
| Weekly update (now runs the real scraper first) | `python-module-a/scraping/weekly_scraper.py` |
| Real TopJobs.lk pilot scraper | `python-module-a/scraping/topjobs_scraper.py` |
| Dataset builder (adds `provenance`) | `python-module-a/scraping/build_trends_dataset.py` |
| Synthetic dataset + taxonomy generator | `python-module-a/scraping/generate_trends_dataset.py` |
| Soft-skill extraction (data source stubbed) | `python-module-a/scraping/soft_skills.py`, `soft_skill_pipeline.py` |
| Skills database migration | `backend/supabase/migrations/0010_skills.sql`, `0025_expand_skills_catalog.sql` |
| Skill type-taxonomy migration | `backend/supabase/migrations/0029_skills_type_taxonomy.sql` |
| Soft-skills catalog migration | `backend/supabase/migrations/0030_soft_skills_catalog.sql` |
| Alert history migration | `backend/supabase/migrations/0022_skill_alert_history.sql` |
| Supervisor review, phase plan, model comparison, gap analysis | `docs/skill-forecasting-review-report.md`, `docs/skill-forecasting-improvement-plan.md`, `docs/skill-forecasting-model-comparison.md`, `docs/skill-intelligence-gap-analysis.md` |

## 17. One-sentence summary

Module A transforms weekly global and Sri Lankan skill-demand observations — increasingly a mix of synthetic and real TopJobs.lk data — into confidence-interval-gated 12-week forecasts (Exponential Smoothing primary, ARIMA fallback) split into established and emerging skill tiers, plus early-warning signals, which travel through FastAPI and the authenticated Express API to personalized React cards, warnings, notifications, and charts.
