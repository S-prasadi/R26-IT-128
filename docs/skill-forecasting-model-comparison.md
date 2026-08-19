# Skill Forecasting — Model Comparison Report

Phase 2 of `docs/skill-forecasting-improvement-plan.md`. Answers the supervisor's Area 2 review point directly: ARIMA, SARIMA, Holt-Winters (Exponential Smoothing), and XGBoost, evaluated on the Phase 1 walk-forward backtest harness (`model/backtest.py`), across all 57 skills, on the current (synthetic) dataset.

## 1. Method

Every candidate is scored by the same walk-forward procedure Phase 1 built: at every training-window size from 4 weeks up to `N − horizon`, stepping by 4 weeks, each method forecasts the next 4 weeks and is scored against the actuals already present in `weekly_skill_dataset.csv`. Metrics are MAE, RMSE, and MAPE (MAPE excludes zero-actual points, which are counted separately). Full detail: `data/output/backtest_report.csv` (35,340 rows). Aggregates: `data/output/backtest_summary.csv`.

Reproduce with:
```
python model/seasonality_check.py
python model/backtest.py --candidates arima_es,holt_winters_full,sarima,xgboost,naive
python model/exog_experiment.py
```

## 2. Seasonality check, first

Before fitting SARIMA's seasonal term, `model/seasonality_check.py` checked whether any real periodic signal exists at all — the review's own Area 2 caution said not to add seasonal terms without evidence. Across all 57 skills: the strongest autocorrelation lag beyond 1 is scattered and skill-specific (no shared period across skills — see `data/output/seasonality_check.csv`), and mean |ACF| at every plausible candidate period (4, 13, 26, 52 weeks) sits at 0.067–0.077, near the ~0.175 noise threshold for this sample size. Only 14/57 skills even cross a loose "possible signal" flag, with no consistent period among them.

**Verdict: no consistent seasonal signal.** Expected — `scraping/generate_trends_dataset.py`'s `noisy()` only adds i.i.d. Gaussian noise on top of deterministic trend shapes; nothing periodic is encoded in the generator. SARIMA below is still built and run, as the review asked, using one fixed exploratory seasonal order (`(1,0,0,13)`, quarterly-ish) — not because evidence supports it, but to give the "experiment with SARIMA" ask a real answer instead of skipping it.

## 3. Main comparison — all 57 skills

| Candidate | MAE | RMSE | MAPE | Beats naive | Best-per-skill wins |
|---|---|---|---|---|---|
| **holt_winters_full** | **6.93** | 9.17 | 7.41% | 57/57 (100%) | **27** |
| sarima | 7.06 | 9.62 | 7.44% | 55/57 (96%) | 24 |
| arima_es *(current production)* | 7.15 | **9.41** | 7.58% | 57/57 (100%) | 6 |
| xgboost | 8.05 | 10.15 | 8.51% | 48/57 (84%) | 0 |
| naive | 8.72 | 10.99 | 9.17% | — | — |

`arima_es` is the production method-selection logic as it exists today (ARIMA(1,1,1) for ≥8 weeks of history, Exponential Smoothing fallback below that). `holt_winters_full` is Exponential Smoothing run as a standalone candidate on **every** fold, not only as the short-history fallback it's currently restricted to.

**Holt-Winters beats the current production default** on MAE and MAPE, ties on beat-naive rate, and is the single best-per-skill choice more than 4× as often as ARIMA (27 vs. 6, out of 57). SARIMA edges out `arima_es` too, but by a margin (0.09 MAE) that shouldn't be read as vindicating its seasonal term — see §2; it's also the slowest candidate by a wide margin (SARIMAX state-space fitting dominates the ~2m46s five-candidate run, against 11s for Phase 1's two-candidate run).

**XGBoost underperforms even the naive baseline on 16% of skills.** This tracks with a known limitation, not a tuning problem: gradient-boosted trees split on the range of values seen in training and can't extrapolate a monotonic trend beyond it — a poor structural fit for this dataset's steadily-rising or steadily-falling demand shapes. It also needs materially more history to engage at all (9 points minimum for one lagged training row, vs. 4 for Exponential Smoothing).

## 4. Breakdown by skill shape

`scraping/generate_trends_dataset.py`'s `SKILL_DEFS` already labels each skill's generated shape — reused here as ground truth rather than inventing a new category.

| Shape | Skills | arima_es | holt_winters_full | sarima | xgboost | naive |
|---|---|---|---|---|---|---|
| linear (steady trend) | 53 | 7.01 | **6.83** | 6.91 | 7.93 | 8.66 |
| sigmoid_rise (adoption curve — llm, langchain, fastapi) | 3 | 9.16 | **8.42** | 8.96 | 9.50 | 9.36 |
| bump_then_fall (hype cycle — blockchain) | 1 | 8.39 | **7.85** | 9.54 | 10.43 | 10.14 |

Holt-Winters wins the mean-MAE column in all three shape categories, including the adoption-curve and hype-cycle skills — the shapes where a fixed ARIMA(1,1,1) order was flagged as a likely mismatch in the review response report. (The bump_then_fall row is a single skill, so read it as directional, not conclusive.)

## 5. Side experiment — does the lead-lag signal improve forecasts?

`model/lead_lag.py` already computes, and the UI already surfaces, a "global leads local by N weeks" early-warning signal per skill. `model/exog_experiment.py` asked a sharper question: if that relationship is real, does feeding the global series into the local forecast as an exogenous regressor actually improve accuracy?

Tested on the 32 skills where `lead_lag_analysis.csv` found a statistically significant relationship (`granger_sig`) with enough lag to avoid needing to forecast the exogenous input itself (see the script's docstring for the alignment method):

| Candidate | MAE | RMSE | MAPE |
|---|---|---|---|
| arima_local (no exog) | **5.24** | **6.50** | 12.78% |
| arimax_local_exog (global-lead exog) | 5.32 | 6.64 | 12.58% |

The exogenous version wins on only **11/32 skills (34%)** — worse than chance. **The lead-lag correlation is real (that's what `granger_sig` already means), but it doesn't translate into better point forecasts** when added naively as a SARIMAX regressor at this horizon. This is a genuinely useful negative result: it means the existing "early warning" feature is worth keeping as a correlation-based UI signal, but the lead-lag data shouldn't be assumed to also improve the forecast numbers without further work (e.g. a longer lag-matched horizon, or a different way of incorporating it) — that further work is not in this phase's scope.

## 6. Recommendation

**Adopt Holt-Winters (Exponential Smoothing) as the primary forecasting method**, in place of ARIMA(1,1,1), for the modular pipeline (`model/forecasting.py`, run via `model/pipeline.py`). It wins on overall MAE and MAPE, matches ARIMA's 100% naive-beat rate, wins per-skill more than 4× as often, and wins in every shape category tested — a consistent result, not a narrow one.

**Not adopted:**
- **SARIMA** — its edge over Holt-Winters is marginal (7.06 vs. 6.93 MAE) and unsupported by any real seasonal signal (§2); the added runtime cost isn't worth a gain this small.
- **XGBoost** — underperforms naive on 16% of skills and is structurally unsuited to extrapolating monotonic trends.
- **The exogenous lead-lag signal** — doesn't improve point-forecast accuracy in this experiment; kept as a UI correlation signal only, not fed into the forecast.

**Caveats, stated plainly:**
- All of the above is measured on the current **synthetic** dataset. It should be re-run once Phase 3 lands real TopJobs.lk data — a method that wins on generated linear/sigmoid/bump shapes with i.i.d. noise is not guaranteed to win on real, noisier market data.
- Per Phase 1's finding, `model/forecasting.py` and top-level `train.py` still contain two separate copies of this logic; this change is applied only to `model/forecasting.py` (the modular path `model/pipeline.py` uses). `train.py`'s duplicate remains on the old ARIMA-primary logic until that consolidation happens — still a deferred cleanup item, not part of this phase.

## 7. What changed in code

- `model/forecasting.py`: primary method switched from ARIMA(1,1,1) to Exponential Smoothing; ARIMA kept as a fallback for the rare case ES itself fails to fit, only attempted when ≥8 weeks of history exist (`MIN_ARIMA`, unchanged).
- New: `model/seasonality_check.py`, `model/forecast_candidates.py`, `model/exog_experiment.py`.
- `model/backtest.py`: generalized from a hardcoded `model`/`naive` pair to a named candidate registry (`--candidates` flag); default behavior (`arima_es,naive`) unchanged from Phase 1.
- `requirements.txt`: added `xgboost`. (macOS additionally needs the OpenMP runtime — `brew install libomp` — for xgboost to import at all; installed locally as part of this work.)
