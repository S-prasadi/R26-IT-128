# Skill Forecasting Model — Supervisor Review Report

## 1. Purpose and scope

The supervisor reviewed the Skill Forecasting component (Module A) and returned five improvement points, covering forecast scope, model selection, data source, terminology, and feature categorization. This report checks each point against the current implementation in `python-module-a`, states plainly what is already in place, identifies what the proposed improvement does and does not solve, and recommends the additional work needed to close each gap properly.

Everything below is verified against the current repository state (checked 2026-08-17), specifically:

- `python-module-a/model/forecasting.py` — the forecasting model
- `python-module-a/scraping/generate_trends_dataset.py` — the historical dataset generator
- `python-module-a/scraping/weekly_scraper.py` — the weekly update job
- `backend/supabase/migrations/0010_skills.sql` and `0025_expand_skills_catalog.sql` — the application's skills catalog
- `docs/components/skill-forecasting.md` — the existing technical documentation for Module A

Where a claim below names a function, file, or fallback path, it was read directly rather than inferred from the supervisor's summary.

## 2. Supervisor's review, recapped

| # | Area | Current state (as assessed) | Proposed improvement |
|---|---|---|---|
| 1 | Forecast Target / Scope | Forecasting total job post counts | Shift focus to forecasting trending skills directly, rather than raw job post counts |
| 2 | Model Selection | Using only a single model (ARIMA) | Experiment with alternative models (SARIMA, SARIMAX, XGBoost) and prepare a Model Comparison Report |
| 3 | Data Source | Mixed/global dataset | Prioritize fresh local market data for more relevant forecasts |
| 4 | Terminology | Using the term "Skills" broadly for all attributes | Research and refine terminology (e.g. Technologies, Tools, Competencies) |
| 5 | Feature Categorization | Uncategorized list of skills | Separate and properly categorize Technical Skills (e.g. Python, Java) from Soft Skills (e.g. Communication, Teamwork) |

## 3. Area 1 — Forecast target and scope

### Current state, verified in code

The forecasting model already produces more than a raw count. `forecasting.py` computes a `rising / stable / falling` label per skill via `classify_trend()`, and the integrated `/forecast` endpoint's `trending` field ranks skills by their average `predicted_count` over forecast steps 1–4 (see `docs/components/skill-forecasting.md`, §7.1). So the supervisor's stated "current state" — that the system only forecasts raw counts — undersells what's there; a trend signal already exists.

Two details limit how useful that signal actually is:

- `classify_trend()` runs on the **historical** series (`np.polyfit` slope over the actual weeks observed), before the forecast is generated. It does not look at where the forecast itself is heading. A skill can carry a "rising" label purely from past behavior even if its 12-week forecast is flat or declining.
- The `trending` ranking sorts by **absolute** predicted volume, not by growth rate. A large, saturated skill (e.g. Java, with a high `avg_actual_count`) will always rank above a small skill with a much steeper growth curve (e.g. LangChain), because the ranking never normalizes for size.

### What the proposed fix solves, and what it leaves open

"Forecast trending skills directly, rather than raw job post counts" correctly identifies that raw magnitude isn't the interesting number. But it doesn't define trending quantitatively. Without a definition — a growth-rate threshold, a confidence requirement, a distinction between "large and growing" versus "small and emerging" — a rebuild just relocates the same ambiguity from the data layer into the model layer, and the next reviewer will ask the same question again.

### Recommended additional work

- Define a trending score computed from the **forecast**, not the history — e.g. `(mean predicted weeks 9–12 − mean actual last 4 weeks) / mean actual last 4 weeks` — and rank by that score instead of `predicted_count`.
- Split output into two views instead of one ranked list: *established & growing* (high base, positive slope) and *emerging* (low base, steep slope). Collapsing both into a single ranking systematically hides the second group behind the first, which is precisely the group a "which skill should I learn next" tool exists to surface.
- Only apply a "rising" label when the forecast's confidence interval doesn't cross flat/zero growth — see Area 2, since this requires the same statistical infrastructure (a fitted model that reports intervals, and an evaluation framework to trust them).

## 4. Area 2 — Model selection

### Current state, verified in code

Confirmed as stated: every skill is fit with a fixed `ARIMA(1,1,1)` when at least 8 weeks of history are available (`MIN_ARIMA = 8`), falling back to Holt's Exponential Smoothing (`ExponentialSmoothing(..., trend="add")`) for 4–7 weeks, and to a flat repeat of the last observed value if both fail or fewer than 4 weeks exist. This logic lives in `fit_arima()`, `fit_es()`, and `forecast_from_result()` in `forecasting.py`.

Two things worth surfacing beyond "it's only ARIMA":

- The order `(1,1,1)` is hard-coded identically across all 57 skills, regardless of shape. The synthetic dataset itself (`generate_trends_dataset.py`) deliberately encodes different shapes per skill — steady `linear` trends, `sigmoid_rise` adoption curves for `llm` and `langchain`, and `bump_then_fall` hype cycles for `blockchain` — so a single fixed order is already a known mismatch for at least some of the skill population, independent of whether ARIMA is the right model family at all.
- There is no accuracy evaluation anywhere in the pipeline. The model fits on the entire available history and forecasts forward; there is no train/test split, no held-out weeks, and no MAE/RMSE/MAPE computed or stored. Forecast quality is currently unmeasured, not just unreported.

### What the proposed fix solves, and what it leaves open

Adding SARIMA, SARIMAX, and XGBoost widens the candidate set, which is necessary. But "prepare a Model Comparison Report" presumes there is something to compare on. Without a scoring method, running three more models produces three more unscored forecasts — a comparison report built on that would be comparing against nothing, i.e., it would not actually be a comparison. The backtest/evaluation harness is a **prerequisite**, not a separate line item alongside the new models.

### Recommended additional work

- Build a rolling-origin backtest before adding any new model: fit on weeks 1–N, forecast the next 4–12 weeks, compare against the actuals that already exist in that range, then slide the window forward and repeat. This produces the metric surface every subsequent step needs.
- Always include a naive baseline (seasonal-naive or last-value-repeat) in any comparison. It's the only way to demonstrate that ARIMA, SARIMA, or XGBoost are earning their added complexity rather than just being more elaborate ways to reproduce the same accuracy.
- Treat XGBoost as a distinct pipeline, not a drop-in replacement for ARIMA. It requires engineered features — lagged values, rolling means, calendar features, and ideally the global-lead signal already computed separately in `model/lead_lag.py` — none of which the ARIMA/ES path needs. Scope it as its own workstream with its own feature-engineering step.
- Test for seasonality (autocorrelation / seasonal decomposition) before committing to SARIMA or SARIMAX specifically. With roughly 2.5 years of weekly synthetic data, it isn't yet established that a seasonal component exists to model — adding the seasonal terms without evidence just adds parameters without adding signal.
- Expose the forecast's confidence interval in the output once a model that produces one is in place. ARIMA/SARIMA return this natively via `result.forecast()`; it directly enables the "is this trend real or noise" filter recommended in Area 1.

## 5. Area 3 — Data source

### Current state, verified in code

All four historical sources — `google_trends_global`, `linkedin_jobs`, `google_trends_lk`, `topjobs_lk` — are generated entirely by formula in `generate_trends_dataset.py`: `linear` ramps, `sigmoid_rise` adoption curves, and `bump_then_fall` hype curves, each with Gaussian noise (`noisy()`) and a fixed random seed (`np.random.seed(42)`). This is intentional and already documented as demonstration data in both the module docstring and `docs/components/skill-forecasting.md` §4.1.

The detail worth calling out explicitly, because it's easy to miss from the outside: the **weekly update job is also synthetic**. `weekly_scraper.py`'s own docstring says as much — "In a real deployment this script would scrape TopJobs.lk / LinkedIn etc." — and its actual behavior (`continue_series()`) extends each series with a damped-momentum random walk, not a real fetch. There is currently no code path anywhere in the repository that pulls a real external number into this system. "Mixed/global dataset" slightly understates the gap — there is no live data source at all yet, mixed or otherwise.

### What the proposed fix solves, and what it leaves open

"Prioritize fresh local market data" is directionally correct, but each of the three realistic real sources carries a different practical obstacle that the recommendation doesn't address:

- **LinkedIn** restricts scraping under its terms of service, and there's no accessible bulk API for job-posting density at this scale.
- **Google Trends** has no official bulk-export API; the common workaround (`pytrends`) is an unofficial, rate-limited client that can break without notice.
- **TopJobs.lk** is realistically scrapable — it's a public site — but needs a robots.txt/terms check before starting, and ongoing maintenance as the site's HTML changes.

Separately, even once real scraping starts, ARIMA/SARIMA need a meaningful amount of history before they're usable (`MIN_ARIMA = 8` weeks is the current threshold). A freshly-started real feed will run on the Exponential-Smoothing or naive-repeat fallback for its first couple of months by construction — that's not a bug, but it should be communicated as an expected transition period, not a regression.

### Recommended additional work

- Start with TopJobs.lk — the lowest legal risk, and the most directly "local market" of the three. Run it in parallel with the existing synthetic set rather than as an outright replacement, so real history begins accumulating immediately without breaking the current demo.
- Add a provenance flag (`synthetic` / `real`) per row in the dataset schema. Once a series is part-synthetic (backfill) and part-real (recent weeks), that distinction needs to be visible and reportable, not silently blended into one column.
- Treat LinkedIn and Google Trends as stretch goals pending API or partnership access, not committed scope for the current project phase.
- Set the expectation with the supervisor now: any skill with fewer than ~8 real weeks of history will visibly downgrade to Exponential Smoothing or the flat fallback. This is the existing fallback ladder working as designed, and should be labeled as such in any report rather than presented as full-strength forecasting.

## 6. Area 4 — Terminology

### Current state, verified in code

Module A's 57-skill list (`SKILL_DEFS` in `generate_trends_dataset.py`) is flat: programming languages (`python`, `java`), frameworks (`react`, `django`), cloud platforms (`aws`, `docker`), and practices (`agile`, `devops`, `cybersecurity`, `microservices`) all sit in a single untyped list, matching the supervisor's description.

What the review doesn't account for is that a **second, separate skills taxonomy already exists** in this codebase. The application's Supabase `skills` table (`backend/supabase/migrations/0010_skills.sql`, extended by `0025_expand_skills_catalog.sql`) already has a `category` column populated with values like `Frontend`, `Cloud`, `Analytics`, `Security`, and `Architecture`. This catalog and Module A's forecast list are matched at request time by a lowercase, whitespace/period-stripped string comparison (per `docs/components/skill-forecasting.md` §6, step 11) — a fragile join even before any new taxonomy is introduced.

### What the proposed fix solves, and what it leaves open

A Technology / Tool / Competency split is a reasonable direction, but the boundaries are genuinely ambiguous without a written rule: is "DevOps" a competency, or a category of tools? Is "Machine Learning" the discipline (a competency) or does it belong next to "TensorFlow" as a tool? Left undefined, whichever person or pass does the tagging will apply the split inconsistently — and it will drift from the categories that already exist in Supabase, producing a third, still-disconnected taxonomy rather than resolving the two that already disagree.

### Recommended additional work

- Reconcile with the existing Supabase `skills.category` field rather than introducing a parallel taxonomy from scratch. Add a second, independent `type` column (`technology` / `tool` / `competency`) alongside the functional category that's already populated, instead of replacing it.
- Once a shared taxonomy exists, match Module A's forecast skills to the catalog by ID, replacing the current lowercase-string matching described in §6 of the component documentation.

## 7. Area 5 — Feature categorization

### Current state, verified in code

Checked both skill lists — Module A's 57-skill forecasting set and the Supabase catalog (`0010_skills.sql` plus the additions in `0025_expand_skills_catalog.sql`) — and neither contains a single soft skill. Every entry in both is a language, framework, platform, or technical practice. In this codebase, the "uncategorized list" the review describes is, in fact, already 100% technical; there is nothing currently in the data to split.

### What the proposed fix solves, and what it leaves open

The review frames this as a categorization task — separate what's already there into two buckets. In this codebase it is not that; it's a missing data source. All four of Module A's inputs are numeric trend indices on a 0–100 scale (`trend_index`), not text. There is no job-description content, or any text field, anywhere in the pipeline to extract "communication" or "leadership" mentions from. Categorizing soft skills into the model isn't possible until soft skills are collected from somewhere first.

### Recommended additional work

- Split the existing 57 technical entries into subtypes now — Language / Framework / Platform / Practice — which is an achievable categorization with the data already on hand, and gives partial credit toward the review's intent without waiting on new data collection.
- Scope soft-skill forecasting as a distinct, later-phase feature. It requires raw job-posting text as a new input, plus an NLP tagging step to extract skill mentions from that text, before any time-series modeling on soft skills can begin. This is meaningfully larger in scope than the other four items and should be planned and communicated as such.

## 8. Cross-cutting gap

Three issues recur across multiple areas above and are worth stating once, plainly:

1. **No accuracy evaluation exists anywhere in the pipeline.** This single gap blocks or weakens three of the five review points: the model comparison in Area 2 has nothing to compare against; the "is this really rising" question in Area 1 can't be answered without a trustworthy confidence interval; and any claim about forecast quality made to the supervisor is currently unverifiable. Building the backtest harness first (see the companion improvement plan, Phase 1) makes every later phase strictly easier.
2. **Skill matching is a string heuristic**, not an ID-based join. It works today because the vocabulary is small (57 skills) and stable, but it will silently degrade as the terminology work in Area 4 expands the taxonomy.
3. **Two skill taxonomies already exist and will keep drifting** — Module A's flat list and Supabase's `skills.category` — unless the terminology work in Area 4 explicitly merges them, rather than adding a third list on top.

## 9. Summary

| # | Area | Verdict | Why |
|---|---|---|---|
| 1 | Forecast target / scope | Partly in place | Trend label and ranking already exist; both need to be re-derived from the forecast (not history) and from growth rate (not raw volume) |
| 2 | Model selection | Bigger gap than stated | Confirmed single fixed ARIMA order, and — more importantly — no accuracy metric exists to score any comparison |
| 3 | Data source | Bigger gap than stated | Not just "mixed/global" — the weekly update path is synthetic too; no real data source is wired up yet |
| 4 | Terminology | Config change, needs a rule | Achievable, but must reconcile with the Supabase `skills.category` field that already exists, or it creates a third disagreeing taxonomy |
| 5 | Feature categorization | Bigger gap than stated | Not a relabeling task — soft skills aren't present in any current data source and require new text-based collection |

For how to act on these findings, phase by phase, see the companion document: `docs/skill-forecasting-improvement-plan.md`.
