# Skill Forecasting Model — Phase-Wise Improvement Plan

Companion document to `docs/skill-forecasting-review-report.md`. That report explains *why* each phase below is needed; this document specifies *what to build*, in what order, and how to know each phase is done.

The five phases map onto the five supervisor review points, but not one-to-one — Phase 1 exists only because Areas 1 and 2 of the review can't be acted on without it first.

```
Phase 1 ──▶ Phase 2 ──▶ Phase 4a (trending redefinition)
   │                          ▲
   └──▶ (independent) ────────┘
Phase 3 (independent, external-access dependent)
Phase 4b (taxonomy unification) — independent, can run alongside Phase 1–2
Phase 5 (stretch, depends on Phase 3 producing real text data)
```

## Phase 1 — Backtest harness and accuracy metrics ✅ done

**Objective.** Give the model a way to measure its own error against real held-out weeks, so every later phase has a metric to optimize against instead of a guess.

**Why first.** Nothing in Phase 2 (model comparison) or the Area 1 "is this rising for real" question can be answered without this. It's the one phase every other phase either depends on or benefits from.

**Found while implementing, not in the original review:** the repo has two independent implementations of the same ARIMA(1,1,1)/ES logic. `model/pipeline.py` is the modular entry point — it imports `model/forecasting.py`, `model/lead_lag.py`, `model/clustering.py`. Separately, top-level `train.py` has its own self-contained, copy-pasted copy of the same forecasting logic plus its own dataset builder from `remoteok.csv`, and it's `train.py --skip-dataset` that the setup docs (`docs/components/skill-forecasting.md`) actually document — not `pipeline.py`. Both write to the same output paths, so whichever was run last is quietly "in production." The two are functionally equivalent today, so this didn't change any backtest numbers, but it means a Phase 2 model change could be applied to only one of the two and silently diverge. Scoped Phase 1 to `model/pipeline.py` / `model/forecasting.py` only; `train.py`'s duplicate is left as a flagged, not-yet-scheduled cleanup item.

**Tasks — as built.**
1. Added `python-module-a/model/backtest.py`: walk-forward (rolling-origin) backtest that imports `fit_arima`/`fit_es`/`MIN_ARIMA`/`MIN_ES` directly from `model/forecasting.py` (so it measures exactly what production does, not a reimplementation). At every training-window size from `MIN_ES` (4) weeks up to `N − horizon`, stepping by `--stride` (default 4), it reproduces `forecasting.py`'s own method choice and forecasts `--horizon` weeks ahead (default 4, matching the `trending` endpoint's 4-week averaging window).
2. Computes MAE, RMSE, and MAPE per (skill, origin, variant), with MAPE guarded against divide-by-zero (points where the actual is 0 are excluded from the MAPE average, counted separately).
3. Added a **naive baseline**: the last training-window value repeated across the horizon — the same value the pipeline's own fallback chain already uses on model failure, so it's not a new concept, and it doesn't assume any seasonality that hasn't been tested for.
4. Writes `data/output/backtest_report.csv` (long-format detail: one row per skill × origin × horizon-step × variant) and `data/output/backtest_summary.csv` (aggregated per skill + variant, plus an `__overall__` row) — the summary file is what Phase 2 will read to score new candidate models against. Also prints a summary (MAE/RMSE/MAPE for model vs. naive, and the top/bottom 5 skills by improvement) in the same style as `forecasting.py`'s and `pipeline.py`'s existing reports.
5. Wired a `--backtest` flag into `model/pipeline.py` (not `train.py` — see the duplication note above) as an optional fourth step; default behavior of `python model/pipeline.py` is unchanged.

**Files touched.** New: `model/backtest.py`. Modified: `model/pipeline.py` (`--backtest` flag, optional step 4).

**Result of the first real run** (57 skills, default `horizon=4`/`stride=4`, ~11s runtime on the current synthetic dataset): the ARIMA/ES pipeline beats the naive baseline on **57/57 skills** on MAE (overall MAE 7.15 vs. 8.72, MAPE 7.6% vs. 9.2%) — so the model is earning its complexity, on this dataset. The margin is smallest on exactly the skills Area 1 cares most about for "trending" detection — `llm` (+0.26), `langchain` (+0.25) — and largest on steady, near-linear skills like `agile` (+4.02) and `javascript` (+2.60). This is a first, useful, but not final answer: it's measured entirely on synthetic history, and should be re-run once Phase 3 lands real data.

**Definition of done — met.** `python model/backtest.py` runs cleanly against the current dataset, produces both CSVs with non-null metrics for all 57 skills, and the printed summary states model-vs-naive accuracy and how many skills the pipeline actually beats naive on.

**Dependencies.** None — started immediately.

---

## Phase 2 — Model Comparison Report ✅ done

**Objective.** Answer the supervisor's ask directly: evaluate SARIMA, SARIMAX, XGBoost, and Holt-Winters against the current ARIMA baseline, using Phase 1's harness, and produce the report the review asked for.

**Why this order.** A comparison report without a scoring method isn't a comparison — this phase is only meaningful once Phase 1 exists.

**Tasks — as built.**
1. `model/seasonality_check.py` ran a differenced-ACF check across all 57 skills before touching SARIMA's seasonal term. Result: no consistent seasonal signal (scattered strongest-lags, mean |ACF| at every candidate period 4/13/26/52 weeks sitting at 0.067–0.077, near the noise threshold). SARIMA was still built and run — the review asked to experiment with it — using one fixed exploratory seasonal order rather than one tuned on evidence that doesn't exist.
2. Added `model/forecast_candidates.py` (`holt_winters_full`, `sarima`) as a separate module so the production path in `forecasting.py` stayed untouched during evaluation.
3. Added an `xgboost` candidate in the same module: lag features (`t-1..t-8`) + rolling mean/std, recursive multi-step forecasting. Needed a floor below `MIN_ES` to avoid an unidentifiable fit exploding on 4-week training windows — same failure mode SARIMA hit first (see below).
4. Generalized `model/backtest.py` from a hardcoded `model`/`naive` pair to a named candidate registry (`--candidates` flag); default (`arima_es,naive`) unchanged from Phase 1, so nothing that depends on it broke.
5. Wrote `docs/skill-forecasting-model-comparison.md` with the full breakdown (overall, by skill shape, and the exogenous side-experiment), and a concrete recommendation.
6. A challenger won clearly and consistently — updated `forecasting.py`'s method-selection accordingly (see result below).

**Bug caught during implementation:** the first SARIMA run produced MAE=178 (vs ~10 for every other candidate) — not a real "SARIMA is bad" finding but `ARIMA(1,1,1)` being fit on as few as 4 training points and exploding (one fold predicted 16,500 against an actual of 225). Production `forecasting.py` never attempts ARIMA below `MIN_ARIMA=8` for exactly this reason; the SARIMA candidate was missing the same floor. Fixed by adding an equivalent minimum-history guard before re-running.

**Files touched.** New: `model/seasonality_check.py`, `model/forecast_candidates.py`, `model/exog_experiment.py`, `docs/skill-forecasting-model-comparison.md`. Modified: `model/backtest.py` (candidate registry), `model/forecasting.py` (ES promoted to primary method), `requirements.txt` (+xgboost; macOS also needed `brew install libomp` for xgboost to import at all).

**Result.** Across all 57 skills (backtest, `horizon=4`): Holt-Winters (Exponential Smoothing), evaluated as a full standalone candidate rather than only the short-history fallback it was restricted to, beat the production ARIMA default on MAE (6.93 vs. 7.15) and MAPE (7.41% vs. 7.58%), tied its 100% naive-beat rate, and was the single best-per-skill choice 27/57 times against ARIMA's 6/57 — consistent across all three generated skill shapes (linear, sigmoid-adoption, hype-cycle). SARIMA edged out plain ARIMA too (7.06 MAE) but not by enough to justify adopting it given §2's seasonality finding and its materially higher runtime. XGBoost underperformed the naive baseline on 16% of skills — a structural limitation (tree models can't extrapolate a trend past the training range), not a tuning gap. **Adopted: Exponential Smoothing is now the primary method in `model/forecasting.py`**, ARIMA kept only as a fallback if ES itself fails to fit.

The exogenous side-experiment (`model/exog_experiment.py`) tested whether the lead-lag signal `model/lead_lag.py` already computes actually improves forecasts when used as a SARIMAX exogenous input on a clean local-only series — it does not (MAE 5.32 vs. 5.24 for plain local ARIMA; wins only 11/32 qualifying skills). The correlation `lead_lag.py` reports is real (that's what its Granger test already establishes); it just doesn't translate into better point forecasts this way. Kept as a UI signal only, not wired into the forecast.

**Definition of done — met.** Every candidate has a backtested accuracy score for every skill it could fit on; the report states an explicit adopt/don't-adopt call for each candidate with the numbers behind it, and the production code now reflects the winning method.

**Caveat carried forward.** All of the above is measured on synthetic history — re-run once Phase 3 lands real data before trusting the ranking on production traffic. Also: this phase only updated `model/forecasting.py` (the `model/pipeline.py` path); `train.py`'s duplicate copy (flagged in Phase 1) still runs the old ARIMA-primary logic — the two will now visibly disagree until that consolidation happens.

**Dependencies.** Phase 1.

---

## Phase 3 — Real local data pilot ✅ done

**Objective.** Replace the synthetic weekly-update path with a real TopJobs.lk data feed, without breaking the existing synthetic demo.

**Legal/ethical check, done first (live, not assumed).** No `robots.txt` exists on topjobs.lk — requesting it 302-redirects to the site's generic error page. Their Terms & Conditions (fetched directly) is almost entirely a privacy policy with **no clause about scraping, crawling, bots, or automated access** — unlike LinkedIn, already flagged in the review report as ToS-restricted. The one relevant clause is IP protection against reproducing their content, which constrains storing job postings verbatim, not deriving aggregate statistics from them. Given no prohibition and no permission either, proceeded with a conservative scraper: honest non-spoofed User-Agent, minimal request volume, and the output never contains raw job text — only derived counts.

**Tasks — as built.**
1. Site structure checked live: TopJobs.lk has two IT categories (`FA=SDQ`, 180 listings; `FA=HNS`, 97 listings), each rendering its **entire listing on one page** — no pagination. The whole scrape is exactly 2 HTTP requests.
2. Built `scraping/topjobs_scraper.py`: fetches both category pages, matches job title + short description blurb (never opens individual posting pages) against the existing 57-skill vocabulary in `generate_trends_dataset.py`'s `SKILL_DEFS`, reusing `train.py`'s `SKILL_ALIASES` for surface-text normalization ("Node.js" → "nodejs", "C#" → "csharp", etc.). Word-boundary-safe matching, verified against edge cases (`java` doesn't match inside `javascript`, `go` doesn't match inside `google`). Score = % of listings mentioning the skill, landing naturally in the same 0–100 range the synthetic index uses.
3. Added a `provenance` column to `weekly_skill_dataset.csv` (`scraping/build_trends_dataset.py`): `synthetic` for the four generated sources, `real` for scraped rows. A real row overwriting an existing synthetic `(week, skill)` pair would be logged, not silent (doesn't happen yet — see below).
4. Ran the real scraper without touching the synthetic `weekly_scraper.py` path — confirmed the synthetic dataset's last week (`2026-W26`) sits 7 weeks behind the real scrape's week (`2026-W33`), so real and synthetic rows land on different weeks and never need reconciling for now.
5. Updated `docs/components/skill-forecasting.md` §4.1 and the "important limitations" section, and `scraping/weekly_scraper.py`'s docstring — none now claim the pipeline is synthetic-only.
6. `MIN_ARIMA`/`MIN_ES` fallback behavior needed no change — untouched.

**Bug caught during verification, not shipped:** the first end-to-end run silently corrupted forecasts for every skill the scraper *didn't* find that week. Adding `2026-W33` with real rows for only 8/57 skills meant the other 49 had no row for that week at all — and `forecasting.py`'s existing series builder treats a missing week as `count=0`, which reads as a demand cliff at the end of the series. `llm`'s predicted demand dropped from 226.87 to 98.43 purely from this artifact, not real signal. Fixed by adding a `carried_forward` provenance state in the merge step: skills the scraper didn't observe that week get their last known value carried forward instead of implicitly zeroed. Re-verified: `llm`'s prediction returned to 225.27, in line with the extra week of (unchanged) history.

**Files touched.** New: `scraping/topjobs_scraper.py`, `data/raw/local/topjobs_lk_real.csv`. Modified: `scraping/build_trends_dataset.py` (provenance + real-row merge + carried-forward backfill), `docs/components/skill-forecasting.md`, `scraping/weekly_scraper.py` (docstring).

**Result of the first real run.** 269 live listings scanned across both IT categories; 8/57 tracked skills mentioned (java 1.1%, devops/csharp/dotnet/angular/python/aws/cybersecurity 0.4% each — title+blurb-only scraping has a low hit rate against generic job titles like "Software Engineer," a known and documented scope limitation of the pilot, not a bug). `weekly_skill_dataset.csv` now has 7,524 rows: 7,467 synthetic, 8 real, 49 carried-forward. `python model/forecasting.py` completes cleanly against the merged, 132-week dataset.

**Definition of done — met.** One full real scrape cycle completed end-to-end (scrape → merge with provenance → forecast regenerates without error, and — after the fix above — without silently corrupting untouched skills either).

**Caveat carried forward.** Real coverage is currently one week and 8 skills — nowhere near enough to inform Exponential Smoothing or re-validate Phase 2's model comparison yet. Real depth can only ever accumulate one calendar week at a time (TopJobs.lk shows current live postings only — there's no way to retroactively scrape past weeks), so this needs the scraper running on an ongoing basis, not a bigger one-off run.

**Follow-up, done after Phase 4:** `scraping/topjobs_scraper.py` is now wired into `api/app.py`'s existing weekly APScheduler job (`run_weekly_scrape()`), running before the synthetic continuation every Monday — `weekly_scraper.py`'s own rebuild step already merges whatever's in `topjobs_lk_real.csv`, so no separate merge logic was needed. While making this change, found that the scheduled job's forecast-update step called `predict.py` — a separate, older incremental-update implementation with none of Phase 4a's fixes (no confidence-interval trend gating, no growth_score, no endpoint-anomaly guard). Left as-is, the scheduler would have silently reintroduced the exact corrupted-forecast bug Phase 4a fixed, every time it ran. Fixed by pointing `weekly_scraper.py`'s update step at `model/forecasting.py`'s full refit instead (under 2s for 57 skills, so no performance reason to keep the incremental path) — verified end-to-end via a direct call to `run_weekly_scrape()`: real data refreshed, synthetic advanced one week, and the regenerated `forecasts.csv` carried all of Phase 4a's columns with the anomaly guard still correctly firing for all 8 real-provenance skills. `predict.py` itself is left in place but is now unused by the automated path — the same kind of orphaned-duplicate situation as `train.py` (Phase 1), flagged rather than deleted.

**Dependencies.** None technically, but should follow Phase 1 in practice — you'll want the backtest harness ready to evaluate real-data forecast quality as soon as real history exists.

**Note.** LinkedIn and Google Trends real integration are out of scope for this phase — both have real access constraints (ToS restrictions, no bulk API) documented in the review report, Area 3. Revisit only if API/partnership access becomes available.

---

## Phase 4 — Redefine "trending" and unify the skill taxonomy ✅ done

This phase has two independent halves, both completed in this pass.

### 4a. Redefine "trending" — as built

**Checked before building:** Holt-Winters (Phase 2's production method) doesn't support `.get_prediction()`/`.conf_int()` in the installed statsmodels version — that's ARIMA-only. Confidence intervals for ES come from `.simulate()` (500 repetitions) with a percentile band instead; ARIMA (still the fallback) keeps its native interval.

**Tasks — as built.**
1. `model/forecasting.py`: added `growth_score` = `(mean predicted_count, steps 9–12) − (mean actual_count, last 4 weeks)` normalized by the historical mean, plus `ci_lower_step12`/`ci_upper_step12` (simulation-based for ES, analytic for ARIMA).
2. Added `classify_trend_ci()`: `rising` only when the confidence interval's lower bound is above today's level, `falling` only when the upper bound is below it, replacing the old pure-historical-slope classification.
3. `/forecast` in `api/app.py` now returns `trending: {established, emerging}` instead of one flat list — `established` ranked by predicted volume among skills at/above the candidate pool's median demand, `emerging` ranked by `growth_score` among skills below it. Verified directly against a live-fetched dataset via FastAPI's `TestClient` (no server round-trip): passing display-name variants (`"C#"`, `"Next.js"`, `"React Native"`, `"Large Language Models"`) all matched correctly.
4. Frontend (`frontend/src/types/index.ts`, `skill/page.tsx`) updated to the two-tier shape, reusing the page's existing card markup and `VELOCITY_COLOR`/`VELOCITY_ICON` — no new design system introduced.

**Bug caught during implementation, not shipped:** the very first regenerated `forecasts.csv` showed `aws`, `csharp`, `angular`, `devops`, and `cybersecurity` — exactly Phase 3's 8 real-provenance skills — all newly flagged `rising`. Root cause: Phase 3's real `trend_index` (a 0–100 percentage) landed as `count_series[-1]` next to a 0–300ish synthetic series; `int(0.4)` truncates to `0`, and comparing a forecast against a fake zero-demand endpoint makes every confidence interval look like guaranteed growth. This wasn't just a label bug — ES/ARIMA anchor heavily on the last observed point, so the actual forecast numbers for those 8 skills were distorted too. Fixed with a general `guard_against_endpoint_anomaly()`: if a series' final point is under 20% of its own recent trailing average, it's excluded from model fitting (though still reported honestly in `last_actual_count`, with a new `endpoint_anomaly_excluded` flag). Re-verified: all 8 affected skills now classify correctly against their pre-anomaly history; `java`/`python` remain genuinely rising.

**Found beyond the original file list, fixed in the same pass:** two more backend consumers of the flat `trending` array existed that weren't in the original scope — `backend/src/services/cv.service.ts` (CV gap-skill market annotation) and `backend/src/services/career.service.ts` (career-path market context), plus `MOCK_FORECAST` in `skill.service.ts` (the offline fallback). All three now combine `established`+`emerging` into a flat lookup where they only need skill→trend data, and their types/mocks match the new contract. Caught by grepping for `.trending` usage after the primary edit, not by re-reading the whole plan — worth remembering that a response-shape change needs a repo-wide consumer sweep, not just the file list drafted before implementation.

**Verification.** Frontend (`tsc --noEmit`) and backend (`tsc --noEmit`) both compile clean with zero errors against the new types.

### 4b. Unify the skill taxonomy — as built

**Written rule** (Technology / Tool / Competency), documented in the migration itself:
- **Technology** — a specific named language, framework, database, runtime, or platform the app is built with or runs on.
- **Tool** — a specific named product supporting build/test/deploy/operate, not part of what ships.
- **Competency** — a discipline or practice area, not a single named product.

**Tasks — as built.**
1. New migration `backend/supabase/migrations/0029_skills_type_taxonomy.sql`: adds `type text` to `public.skills` (check-constrained to the three values above) and backfills every one of the 130 existing catalog rows (from migrations 0010 + 0025), grouped into three `update ... where name in (...)` statements rather than 130 individual ones. Verified programmatically against both source migrations: all 130 real skill names covered, zero typos, zero omissions. `category` (Frontend/Backend/...) is untouched — `type` is a second, independent axis. **This migration has not been applied** — there's no local Supabase instance or credentials in this environment to run it against; it needs to be run via your own Supabase project (dashboard SQL editor or CLI).
2. `scraping/generate_trends_dataset.py`: added a `SKILL_SUBTYPES` mapping (language/framework/platform/practice) for all 57 tracked skills — kept as a separate dict rather than a key added to each of the 57 `SKILL_DEFS` entries, to avoid touching already-verified dict literals for the same result. Written out to `data/output/skill_taxonomy.csv` via a new `write_skill_taxonomy()` step. Verified: 57/57 skills covered (18 framework, 15 platform, 14 language, 10 practice), zero gaps.
3. Canonical alias table: `api/app.py`'s `_normalise()` (blanket lowercase/strip-`.js`/strip-periods) replaced with `_canonical_skill_name()`, which checks `train.py`'s `SKILL_ALIASES` first (extended with `"large language models"→"llm"` and `"ruby on rails"→"ruby"`, found missing during analysis) and only falls back to the old blanket transform if no explicit alias applies — so nothing that matched before stops matching. This is the practical fix for the fragile-string-matching finding: Module A has no database client at all (confirmed — it only reads/writes local CSV/pickle files), so a literal UUID join isn't achievable without a much larger architecture change than this phase calls for; an explicit, auditable, single-source-of-truth alias table is the equivalent fix in spirit.

**Files touched.** New: `backend/supabase/migrations/0029_skills_type_taxonomy.sql` (unapplied), `data/output/skill_taxonomy.csv` (generated). Modified: `scraping/generate_trends_dataset.py` (`SKILL_SUBTYPES`), `train.py` (2 new aliases), `api/app.py` (`_canonical_skill_name`).

**Dependencies.** None — ran independently of, and alongside, 4a.

---

## Phase 5 — Soft-skill extraction ✅ scoped and built (data source intentionally stubbed)

**Objective.** Only attempt this once Phase 3 (or an equivalent real source) produces actual job-description text — none of the current sources contain text, only numeric trend indices, so this phase cannot start on the current data.

**Checked empirically before building (live, 2026-08-17):** re-fetched TopJobs.lk's IT category listing. Of 184 listings, 154 (84%) have a placeholder blurb ("Please refer the vacancy") with zero content; the rest are one-line taglines, not descriptions. **Zero soft-skill keyword hits across all 184.** Confirms the phase's own premise — there is no soft-skill signal in the text Module A currently touches.

Getting real signal means opening each individual job posting for its full description — ~270+ requests instead of the 2 total the category pages need. That's a materially bigger footprint against TopJobs.lk than the conservative scraper Phase 3 was built as, so it wasn't assumed into scope; asked, and the answer was: **build the extraction pipeline and catalog now, stub the higher-footprint data source.**

**Tasks — as built.**
1. `backend/supabase/migrations/0030_soft_skills_catalog.sql`: seeds 12 soft skills into the Supabase catalog (`category='Soft Skills'`, `type='competency'` — fits directly into Phase 4b's taxonomy, no schema change beyond the insert). Real and immediately useful on its own: users can track these in their profile today, where previously zero soft skills existed anywhere in the app. **Needs to be applied by you**, same as 0029 — no local Supabase instance here.
2. `scraping/soft_skills.py`: a 12-skill keyword vocabulary and `extract_soft_skills(text)`, reusing the same word-boundary matching already proven in `topjobs_scraper.py` (factored out as `word_boundary_pattern()` so both share one implementation rather than two copies). Unit-tested against representative sentences, including a "creative" (adjective) vs. "creativity" (noun) gap the first test run caught and fixed, and a "lead singer" false-positive guard for "leadership".
3. `topjobs_scraper.py::fetch_full_description()`: added and explicitly stubbed — raises `NotImplementedError` with the request-volume tradeoff and this section's reference in its docstring, not a silent no-op. Confirmed nothing calls it and existing scraper behavior is byte-for-byte unchanged (re-parsed the already-fetched category HTML through the existing technical-matching path — same result as before this phase).
4. `scraping/soft_skill_pipeline.py`: `aggregate_soft_skills()` turns `(job_ref, description)` pairs into the same `week, skill, trend_index, source, provenance` shape Phase 3 already established (`source="topjobs_lk_soft"`) — verified against fabricated sample postings (not real data) to confirm the aggregation math itself is correct. Not wired into `build_trends_dataset.py` or `forecasting.py` — there's nothing to merge yet, and wiring an empty path in would misrepresent readiness as results.

**Explicitly not built:** no synthetic soft-skill data generator (would work against the project's own "label synthetic data honestly" principle from Phase 1), no new forecasting/backtest code (Phase 1's harness and `forecasting.py` are already generic enough to run on any `week, skill, count` series once real data exists — nothing to build speculatively).

**To activate later:** implement `fetch_full_description()` for real (the URL pattern and job-ref extraction point are documented in its docstring), collect `(job_ref, description)` pairs for a scrape run, call `soft_skill_pipeline.write_soft_skills()`, then extend `build_trends_dataset.py`'s merge to also pick up `soft_skills_real.csv` the same way it already does for `topjobs_lk_real.csv`.

**Files touched.** New: `backend/supabase/migrations/0030_soft_skills_catalog.sql` (unapplied), `scraping/soft_skills.py`, `scraping/soft_skill_pipeline.py`. Modified: `scraping/topjobs_scraper.py` (`word_boundary_pattern()` extracted for reuse, `fetch_full_description()` stub added; no behavior change).

**Dependencies.** None blocking — this scoped version doesn't require Phase 3's scraper to change first, since the data source stays stubbed.

---

## What to hand the supervisor now vs. later

- **In scope for this project's remaining timeline:** Phases 1, 2, and 4b are self-contained, don't depend on external access, and directly answer the review's Areas 2, 1, and 4/5 (partial).
- **Depends on external access/approval:** Phase 3 needs a ToS/robots.txt check before any scraping starts; treat as gated, not blocked outright.
- **Built, but gated on a scoping decision:** Phase 5's extraction pipeline and catalog are done and tested; only the higher-footprint data source (full job-description scraping, ~270+ requests vs. the 2 the rest of Module A uses) is stubbed pending its own explicit go-ahead — flag that specific decision to the supervisor, not the whole phase as undone.
