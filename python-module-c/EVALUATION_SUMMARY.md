# Module C — CV Job Analyzer: Evaluation Summary

This is the single-document summary of the improvement work done in response to the supervisor's feedback on the CV analyze model. Full detail for each item lives in the linked phase reports; this page is the standalone version for the evaluation itself.

Working plan and phase-by-phase log: [`IMPROVEMENT_PLAN.md`](IMPROVEMENT_PLAN.md).

## The feedback, and what was done

| # | Area | What was asked | What was built |
|---|---|---|---|
| 1 | **Algorithm Selection** | Random Forest alone is insufficient — try ensemble/hybrid models, hyperparameter optimization, a model comparison | 4-candidate comparison (Random Forest, Gradient Boosting, Extra Trees, Voting Ensemble), 5-fold cross-validated, winner tuned with `RandomizedSearchCV`, deployed |
| 2 | **Model Testing & Demo** | Replace the single ~58% average with pre-categorized sample CVs showing role-specific accuracy | 5 real CVs, one per role, each scored and broken down individually |
| 3 | **Relative Evaluation** | Show how a candidate compares to other applicants for the same role, not just an isolated score | Live `percentile`/`percentile_label` on every scoring endpoint, backed by the historical score distribution per role |
| 4 | **Data Visualization** | Basic numbers → graphs and charts for matching performance and evaluation results | 8 charts across model comparison, dataset distribution, and relative evaluation |

## 1. Algorithm Selection — model comparison

*Full report: [`reports/phase2-model-comparison/report.md`](reports/phase2-model-comparison/report.md)*

Before comparing algorithms, it's worth being explicit about something the [training guide](TRAINING_GUIDE.md) explains: the training label (`final_score`) is a hand-written formula of the same features the model receives, not a real recruiter decision — so any reasonably flexible model reaches R² ≈ 0.98 almost by construction. This comparison is about finding the most **robust** model with a **legitimate, evidence-backed comparison table**, not chasing the last fraction of R².

| Model | CV MAE (mean ± std) | CV R² (mean ± std) |
|---|---|---|
| **Gradient Boosting** | **0.748 ± 0.065** | **0.9929 ± 0.0012** |
| Voting Ensemble | 1.015 ± 0.042 | 0.9876 ± 0.0010 |
| Extra Trees | 1.309 ± 0.045 | 0.9793 ± 0.0015 |
| Random Forest (original) | 1.406 ± 0.074 | 0.9775 ± 0.0021 |

Gradient Boosting (`HistGradientBoostingRegressor`) won decisively and consistently across folds — **47% lower error than the original Random Forest**. After tuning (`max_iter=300, learning_rate=0.1, max_depth=3, min_samples_leaf=30`), held-out test performance: **MAE 0.61, R² 0.997** — beating even the original notebook's reported 1.22/0.9851.

**This model is now deployed.** `backend/app.py` loads `cv_job_score_model_v2.pkl`; the original (`v1`, Random Forest) is retired but kept on disk for rollback. Tracked in `backend/models/model_registry.json`.

## 2. Model Testing & Demo — 5 role-specific breakdowns

*Full report: [`reports/phase5-model-testing-demo/report.md`](reports/phase5-model-testing-demo/report.md)*

Five real CVs, one per role, each scored individually — an honest, un-cherry-picked spread from the 9th to the 81st percentile, not five similar-looking "good" results:

| Role | Score | Level | Percentile |
|---|---|---|---|
| Full Stack Developer | 57.5 | Intermediate | **81st** |
| AI ML | 38.7 | Beginner | 17th |
| Data Analyst | 32.9 | Beginner | 33rd |
| Frontend Developer | 20.1 | Beginner | 22nd |
| DevOps Engineer | 15.4 | Beginner | **9th** |

Each comes with its own matched/missing required & preferred skills and concrete recommendations (see the full report) — this is what replaces the single ~58% average.

## 3. Relative Evaluation — percentile against historical applicants

*Full report: [`reports/phase4-relative-evaluation/report.md`](reports/phase4-relative-evaluation/report.md)*

Every scoring endpoint (`/analyze`, `/analyze-cv`, `/compare-job`) now returns a percentile alongside the absolute score, e.g. *"Scored higher than 72% of candidates for this role."* Computed by comparing the live predicted score against the historical distribution of ground-truth scores for that role (2,066 CVs across 24 roles), so it stays valid independent of which model version is deployed.

**Honest finding surfaced while building this**: 18 of the 24 roles have solid sample sizes (93–174 CVs), but 6 have only 1–2 CVs each — near-duplicate labels (e.g. `Mobile Developer` vs. `Mobile Application Developer` vs. `Mobile App Developer`, almost certainly the same role, mislabeled). The percentile feature correctly returns `None` for those roles rather than guessing — worth consolidating these labels before the next retrain, flagged in `README.md`'s Known Limitations.

## 4. Data Visualization — 8 charts

*Reports: [`phase2-model-comparison`](reports/phase2-model-comparison/report.md) · [`phase3-data-visualization`](reports/phase3-data-visualization/report.md) · [`phase4-relative-evaluation`](reports/phase4-relative-evaluation/report.md) · [`phase5-model-testing-demo`](reports/phase5-model-testing-demo/report.md)*

- **Model comparison**: MAE/R² bar chart, permutation-importance chart, predicted-vs-actual scatter.
- **Dataset evaluation results**: score distribution histogram, level breakdown, average score by role.
- **Relative evaluation**: two percentile-distribution charts (a role's score histogram with a candidate marked).
- **Demo**: a summary bar chart of the 5 demo candidates' scores and percentiles.

**Honest finding surfaced by the level-breakdown chart**: 0 of the 2,066 CVs reach "Advanced" level (`final_score ≥ 80`) — the label formula's five components don't happen to max out simultaneously for any CV in this dataset. Not a bug; an observation about the formula's practical range.

## Engineering notes worth mentioning

- **Recovered lost work** (Phase 0): a more advanced, evidence-based CV analysis module (`utils/advanced_analysis.py`) existed only as compiled bytecode with no source — recovered from dangling git objects before they could be garbage-collected. Restored and tested (5 passing tests); not wired into the live API (would change the response contract), kept as a documented option for future work.
- **Reproducible pipeline** (Phase 1): the original Colab notebook is now a set of local scripts (`train.py`, `compare_models.py`, `build_score_distributions.py`, `build_demo.py`, `visualize_*.py`) that read local files and produce versioned, trackable artifacts — no more manual Colab uploads.
- **Test coverage**: 28 automated tests across `tests/test_scoring.py`, `tests/test_relative_eval.py`, `tests/test_advanced_analysis.py`, `tests/test_app.py` — including a regression guard confirming the `v2` model swap took effect and stays in effect.
- Every change that could affect the live API was additive (new JSON fields only) and verified against the actual Flask routes before being considered done.
