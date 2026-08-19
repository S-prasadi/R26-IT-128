# Improvement Plan — CV Job Analyzer (Module C)

This is the phase-wise execution plan for acting on the supervisor's feedback before the next evaluation. It builds on the concepts already explained in [`TRAINING_GUIDE.md`](./TRAINING_GUIDE.md) and is grounded in what's actually in this repo today (verified 2026-08-18), not just the notebook.

## The feedback

| # | Area | Current state | What's being asked for |
|---|---|---|---|
| 1 | Algorithm Selection | Only `RandomForestRegressor`, untuned | Try ensemble/hybrid models, apply hyperparameter optimization, produce a model comparison |
| 2 | Model Testing & Demo | One overall average match score (~58%) | Pre-categorized sample CVs (Data Analyst, Front-End Developer, …) showing role-specific matching accuracy |
| 3 | Relative Evaluation | Each candidate scored in isolation | Show how a candidate compares against *other applicants for the same role* |
| 4 | Data Visualization | Raw numbers only | Graphs/charts for matching performance and evaluation results |

## Important framing before diving in

The model's label (`final_score`) is **not** a real-world outcome — it's a hand-written formula computed from the same features the model is trained on (skill match ratio, project count, experience months, etc. — see `TRAINING_GUIDE.md` §2). That's why the current model already reports MAE 1.22 / R² 0.985: it's reverse-engineering arithmetic, not learning recruiter judgment, so swapping algorithms alone won't move that number much. This isn't a flaw — it's a normal way to bootstrap a scoring model without labelled outcomes yet — but it means **"Algorithm Selection" here is really about robustness, interpretability, and having a legitimate comparison table to show**, not chasing a higher R². Every phase below is scoped with that in mind.

## What's already true about the codebase (so this plan doesn't duplicate existing work)

- The live Flask app (`backend/app.py`) already ranks a CV against all 24 role blueprints (`/analyze`) and diffs a CV against a pasted job post (`/compare-job`) — so "relative to roles" already exists. What's missing is relative-to-*other-candidates*.
- A new CV dataset landed in the repo today: `backend/Dataset/combined_resumes.json` (2,066 records — matches the CV count `TRAINING_GUIDE.md` expected, just under a different filename). No raw job-postings dataset exists, but that's *not* a blocker: `backend/models/job_role_profiles.json` already holds the aggregated 24-role blueprint output that training needs.
- The deployed model (`backend/models/cv_job_score_model.pkl`) is dated **before** this new dataset arrived — it has not been retrained on it yet.
- `backend/utils/scoring.py` already implements the feature/formula logic (`compare_cv_with_role`, `FEATURE_COLUMNS`) — reuse it, don't reimplement it, so training-time and inference-time scoring never drift apart.
- `backend/requirements.txt` has `scikit-learn==1.6.1` (covers all the ensemble/tuning tools needed) but **no `matplotlib`/`seaborn`** yet.
- There's evidence of a more advanced analysis module (`utils/advanced_analysis.py`, with a richer quality scorer and `compare_job_advanced`) that no longer has source in the repo — only compiled `.pyc` bytecode remains in `__pycache__/`. It may be recoverable from git history and could shortcut several phases below, so it's checked first.

---

## Phase 0 — Groundwork ✅ done (2026-08-18)

- [x] Search git history for the missing `utils/advanced_analysis.py` and `tests/test_advanced_analysis.py`. **Recovered and restored** — see findings below.
- [x] Confirm `Dataset/combined_resumes.json` is the CV set to train on; it already carries per-candidate `evaluation_score`/`skill_score`, which Phase 4 depends on.
- [x] Confirm `job_role_profiles.json` (24 roles) is sufficient as the role-blueprint source — no raw job-posts file needs to be sourced.

### Phase 0 findings

`git log --all` (every local + already-fetched remote branch, plus reflog) has **zero commits** touching `advanced_analysis.py` or `test_advanced_analysis.py` — they were never committed anywhere reachable. But `git fsck --unreachable` found dangling blob objects (content that was `git add`-staged locally, then orphaned by a `git reset` — the reflog shows several "reset: moving to HEAD" entries — never garbage-collected) holding the full original source. Two files were restored verbatim from those blobs:

- **`backend/utils/advanced_analysis.py`** — a deterministic, evidence-based CV quality analyzer, deliberately separate from ATS logic. Provides `extract_skill_evidence` (per-skill evidence + confidence + proficiency, with negation handling — "No experience with Kubernetes" correctly doesn't count as a claim), `analyze_quality`, `rank_blueprints`, `parse_job_requirements`, `compare_job_advanced` (job comparison with "mandatory blockers" for missing required skills), and `SCHEMA_VERSION`/`SCORING_VERSION`/`MODEL_VERSION` constants. It only depends on symbols still present in the live `cv_parser.py` (`SKILL_ALIASES`, `SECTION_HEADERS`) and `scoring.py` (`normalize_skill`, `display_skill`).
- **`tests/test_advanced_analysis.py`** — 5 unittest cases. **All 5 pass** against the restored module and the current live `cv_parser.py`/`scoring.py` (verified with `./backend/venv/bin/python -m unittest tests.test_advanced_analysis -v`).

Two more artifacts were recovered but **kept as reference only, not restored as live files** — see the appendix at the bottom of this doc:

- A newer `app.py` variant that wires `analyze_quality`/`rank_blueprints`/`compare_job_advanced` into `/analyze` and `/compare-job`, replacing the current inline logic. **Not a safe drop-in**: diffing shows the live `app.py` actually descends from an *older* sibling snapshot that predates this refactor — the refactor branch was abandoned and development continued from the pre-refactor version, which then gained real features this snapshot lacks (`ats_quality_score` field, `github_verified` passthrough, "Market blueprint" labelling). Wiring the recovered functions in is legitimate future work (Phase 6), but naively restoring this file would regress the current Node backend contract.
- A Supabase SQL migration for a `cv_analysis_runs` history/cache table (per-CV runs keyed by `content_hash` + `scoring_version`, with a status machine and RLS policies) plus new `cv_suggestions` columns. This belongs to the **Node/Express backend** (`backend/supabase/migrations/` exists at the repo root and is its real home), not python-module-c — a bigger, cross-module change. Notable because a persisted analysis-history table is exactly what Phase 4 (Relative Evaluation) could eventually build on, but reviving it is a future option, not something Phase 0 executed.

A third candidate blob (an alternate `scoring.py`) turned out to be a byte-identical CRLF-line-ending duplicate of the current file — confirmed not meaningful, no action taken.

**Implication for later phases:** `analyze_quality`, `rank_blueprints`, and `compare_job_advanced` are now available in the codebase (`backend/utils/advanced_analysis.py`) and worth considering for Phase 5's demo (richer, evidence-based narrative per CV) and Phase 6's integration — but that decision belongs to whoever executes those phases, not forced here.

## Phase 1 — Reproducible training script ✅ done (2026-08-18)

- [x] Convert `backend/models/CV_Job_Model (3).ipynb` into a plain `.py` script under `backend/` that reads `Dataset/combined_resumes.json` + `models/job_role_profiles.json` directly (no manual Colab upload). Mirrors the `python-module-a/train.py` pattern (module docstring, `BASE`-relative paths, one function per step, `--step` CLI flag).
- [x] Reuse `backend/utils/scoring.py`'s existing feature/matching logic rather than re-deriving it in the script.

### Phase 1 findings

**`backend/train.py`** now exists with four steps (`load` → `label` → `train` → `save`), each reading/writing files independently so any step can be re-run on its own. Ran end to end (`./venv/bin/python train.py`):

- `Dataset/combined_resumes.json`'s schema doesn't match what `utils.scoring` expects out of the box — an adapter was needed:

  | `scoring.py` expects | `combined_resumes.json` has | Adapter |
  |---|---|---|
  | `cleaned_all_skills` | `all_skills` | direct rename |
  | `project_technologies` | `projects_and_technologies_involved[].technologies_used` | flattened across all projects |
  | `has_projects` | *(absent)* | `1 if num_projects > 0 else 0` |
  | `num_certificates` | `certificates_or_qualifications` (a list) | `len(...)` |
  | `has_certificates` | *(absent)* | `1 if num_certificates > 0 else 0` |

- The `final_score` label formula (notebook Step 7) doesn't live in `scoring.py` — it's genuinely training-only (see "Important framing" above), so it was written fresh in `train.py` as `compute_final_score`, not imported.
- **Results**: 2,066 CVs scored (matches the notebook's row count). `scored_training_dataset.csv` has 21 columns, not the notebook's 30 — deliberately leaner: it keeps `candidate_id` + the 18 model features + `final_score` + `level`, and drops the notebook's extra diagnostic columns (per-component score breakdown, matched/missing skill lists) since `step_train` only ever reads the 18 feature columns. MAE **1.31** / R² **0.9839**, vs. the notebook's original MAE 1.22 / R² 0.9851 — close, small drift as expected from `scoring.py`'s updated `normalize_skill` (see Phase 0/1 context above) producing slightly different match ratios than the notebook's stale mapping.
- **Spot-check**: candidate `CAND_920D187A` (`AI Engineer`) — notebook Step 7 got `final_score: 32.07, level: Beginner`; this script got `final_score: 32.31, level: Beginner`. Same level, score within 0.24 — confirms the adapter and formula are correct, not silently broken.
- Output artifacts: `Dataset/scored_training_dataset.csv` (labeled training data) and `models/cv_job_score_model_baseline.pkl` (baseline RF pipeline, same hyperparameters as the notebook). **The live deployed `models/cv_job_score_model.pkl` was not touched** — swapping it out is Phase 2's job, once there's an actual comparison table to justify which model wins.

## Phase 2 — Algorithm Selection & Model Comparison ✅ done (2026-08-18) *(feedback #1)*

- [x] Build a candidate model set: `RandomForestRegressor` (baseline), `HistGradientBoostingRegressor`, `ExtraTreesRegressor`, `VotingRegressor`.
- [x] Evaluate each with 5-fold cross-validated MAE and R² (not a single 80/20 split) through the same preprocessing pipeline.
- [x] Tune the best candidate with `RandomizedSearchCV`.
- [x] Produce the model comparison table — this directly answers the supervisor's ask.
- [x] Save the retrained pipeline as a new versioned `.pkl` via a `model_registry.json` (own schema, keyed by version — see findings) instead of silently overwriting the current file.

### Phase 2 findings

**`backend/compare_models.py`** reads Phase 1's `scored_training_dataset.csv`, cross-validates the four candidates, tunes the winner, and saves everything — full write-up with charts in **[`reports/phase2-model-comparison/report.md`](reports/phase2-model-comparison/report.md)**. Headline result: **Gradient Boosting (`HistGradientBoostingRegressor`) wins decisively** — CV MAE 0.75 vs. the current Random Forest's 1.41 (47% lower error), and after `RandomizedSearchCV` tuning, held-out test MAE **0.61** / R² **0.997**, beating even the originally deployed model's 1.22/0.9851.

Saved as `backend/models/cv_job_score_model_v2.pkl` (refit on all 2,066 rows) and tracked in `backend/models/model_registry.json` (`v1` = current deployed Random Forest, `v2` = this candidate, status `"candidate, not yet deployed"`). **`app.py` and the live `cv_job_score_model.pkl` were not touched** — deploying `v2` is a Phase 6 decision, kept separate so this comparison stays an unbiased evaluation rather than a foregone conclusion.

## Phase 3 — Data Visualization ✅ done (2026-08-18) *(feedback #4)*

- [x] Add `matplotlib`/`seaborn` to `backend/requirements.txt`.
- [x] Generate (a) bar chart of MAE/R² across Phase 2's candidates, (b) feature-importance chart for the winning model, (c) predicted-vs-actual scatter plot on the held-out test set — done as part of Phase 2 above (`compare_models.py`), saved to `reports/phase2-model-comparison/*.png`, embedded in the report.
- [x] Dataset-level evaluation-result charts (score distribution, level breakdown, average score by role) — the model-comparison charts above only covered algorithm performance, not the underlying evaluation results themselves.

### Phase 3 findings

**`backend/visualize_dataset.py`** → **`reports/phase3-data-visualization/`** (`score_distribution.png`, `level_breakdown.png`, `avg_score_by_role.png`, `report.md`). Notable finding surfaced by the level-breakdown chart: **0 CVs reach Advanced level** (`final_score ≥ 80`) anywhere in the 2,066-row dataset — the highest observed score is ≈70, because `final_score`'s five components only sum to 100 if a CV maxes out all five simultaneously, which none do. Shown honestly as an empty bar rather than hidden — worth mentioning to the supervisor as an observation about the label formula's practical range. Full interpretation of all three charts in `reports/phase3-data-visualization/report.md`.

Also produced **`reports/phase4-relative-evaluation/`** — a percentile-distribution chart (see Phase 4 findings below), since visualizing "relative evaluation" is itself a data-visualization deliverable.

## Phase 4 — Relative Evaluation ✅ done (2026-08-18) *(feedback #3)*

- [x] No retraining required. Precomputed a per-role score distribution and saved it as a JSON lookup, same pattern as `job_role_profiles.json`.
- [x] Extended `/analyze`, `/analyze-cv`, **and** `/compare-job` to report a percentile alongside the absolute score, e.g. "Scored higher than 72% of candidates for this role."

### Phase 4 findings

**Correction to this checklist's original wording**: it said to use `combined_resumes.json`'s `evaluation_score`/`skill_score` fields. Those are the wrong reference — different scale/semantics than what the model actually predicts. Used **`Dataset/scored_training_dataset.csv`'s `final_score`** (Phase 1's ground-truth labels, grouped by `target_role`) instead — the exact scale `predicted_score` is estimating, and model-agnostic (stays correct if `app.py` is later switched to Phase 2's `v2` model).

- **`backend/build_score_distributions.py`** → **`backend/models/role_score_distributions.json`**: all 24 roles, 2,066 candidates total, full sorted score array per role (exact percentiles via `bisect`, no bucket interpolation loss) plus a human-readable p10/p25/p50/p75/p90 summary.
- **`backend/utils/relative_eval.py`**: `percentile_for_score(role, score, distributions)` + `percentile_label(percentile)`. Returns `None` gracefully for an unknown role or one with under 5 samples. 6 unit tests in `tests/test_relative_eval.py`, all passing.
- **`app.py`**: additive-only changes — `percentile` + `percentile_label` added to `/analyze-cv`'s top level, each `/analyze` `job_matches` entry, and `/compare-job`'s top level (a small extension beyond "`/analyze` and/or `/analyze-cv`" — same helper, zero added risk, keeps all three score-returning endpoints consistent). No existing field renamed or removed. Verified via Flask's test client against all three routes — e.g. `/analyze-cv` for a sample Data Analyst CV returned `predicted_score: 38.26, percentile: 38, percentile_label: "Scored higher than 38% of candidates for this role"`.
- Confirmed safe for the Node/Express backend: `backend/src/services/cv.service.ts` (repo root) reads the `/analyze` response as untyped (`result: any`), pulling only specific known fields — new fields are silently ignored there, no breakage, no migration needed.

**Addendum — percentile chart**: `backend/visualize_relative_eval.py` → `reports/phase4-relative-evaluation/` adds the missing visual (a histogram of a role's score distribution with the candidate's score/percentile marked). Illustrated with two real candidates from well-populated roles: `CAND_B208BBBB` (Data Analyst, 174 CVs, 33rd percentile — landed just below a visible bimodal gap in that role's distribution) and `CAND_99FD4846` (AI ML, 138 CVs, 17th percentile). A third planned example, `CAND_920D187A` (AI Engineer — this project's recurring worked example, from the notebook itself), was dropped after discovering `AI Engineer` has only **1** CV in the whole dataset — `percentile_for_score` correctly returned `None` for it (the `MIN_SAMPLES_FOR_PERCENTILE = 5` guard working as intended). Checking further: **18 of 24 roles have 93–174 CVs, but 6 have only 1–2** (`AI Engineer`, `Software Developer`, `Web Developer / Software Quality Assurance`, `Quality Engineer`, `Mobile Application Developer`, `Mobile App Developer`) — these look like near-duplicate role labels (e.g. `Mobile Developer` has 103 CVs while `Mobile Application Developer`/`Mobile App Developer` have 1 each, almost certainly the same role mislabeled). Flagged as a data-cleaning opportunity for a future retrain, not something fixed in this pass.

## Phase 5 — Model Testing & Demo ✅ done (2026-08-18) *(feedback #2)*

- [x] Pick 4–5 representative CVs, one per role, and show a per-role breakdown instead of one averaged number — directly addressing the supervisor's "~58% average" example.
- [x] Considered using Phase 0's recovered `advanced_analysis.py` for a richer narrative — not used, see findings.

### Phase 5 findings

**`backend/build_demo.py`** → **[`reports/phase5-model-testing-demo/report.md`](reports/phase5-model-testing-demo/report.md)**: 5 real CVs, one per role (`Data Analyst`, `Frontend Developer`, `Full Stack Developer`, `AI ML`, `DevOps Engineer` — all drawn from Phase 4's 18 well-populated roles, deliberately avoiding `AI Engineer` and the other 5 broken tiny-sample roles), each the first record in file order (no cherry-picking). Scored with the **live deployed model** (matches what `/analyze-cv` actually serves) and Phase 4's percentile lookup. Result: an honest, un-engineered spread from the **9th to the 81st percentile** across the five candidates — exactly the differentiated, role-specific breakdown the supervisor's feedback asked for, replacing the single ~58% average.

- **Scoring path**: since `combined_resumes.json` has no raw CV prose text (unlike the notebook's original dataset), candidates were scored via the same `build_feature_row` → `model.predict` logic `/analyze-cv`'s route handler calls internally, rather than round-tripping through the file-upload endpoint — same result, no synthetic CV text needed. Same approach Phase 1 and Phase 4 already used.
- **`advanced_analysis.py` not used here**: its functions all operate on raw prose text, which these structured records don't have; synthesizing plausible CV paragraphs just to use it would add fidelity risk to an otherwise clean demo. Explicitly decided against, not overlooked.
- One summary chart (`demo_scores_chart.png`) plus the full raw breakdown per candidate (matched/missing skills, recommendations) in `demo_results.json`/`report.md`.

## Phase 6 — Integration & write-up ✅ done (2026-08-18)

- [x] Wire Phases 2–4 into `app.py` behind the existing endpoints.
- [x] Restore/write test coverage for the new logic.
- [x] Update `README.md` / `TRAINING_GUIDE.md` to reflect the new pipeline.
- [x] Assemble the comparison table + charts + demo CVs into a short results summary for the evaluation.

### Phase 6 findings

**The integration decision**: Phase 4's percentile feature was already live (done in Phase 4 itself); Phase 3 has no API surface. The one real integration action was deploying Phase 2's winner — **`app.py` now loads `cv_job_score_model_v2.pkl`** (tuned Gradient Boosting) instead of the original `v1` Random Forest. `v1` is retired but kept on disk, not deleted, so the swap is trivially reversible by repointing `MODEL_PATH`. `model_registry.json` updated accordingly. Verified: the real Flask server boots cleanly and serves correctly with the new model (`/roles`, `/` both return 200).

**Test coverage**: `scoring.py` — the most heavily reused module in the project — had zero direct unit tests despite everything (`train.py`, `compare_models.py`, `build_demo.py`, `app.py`) depending on it. Added `tests/test_scoring.py` (10 tests: `normalize_skill`, `compare_cv_with_role`, `build_feature_row`, `get_level`, `generate_recommendations`) and `tests/test_app.py` (7 Flask-route integration tests covering `/roles`, `/analyze-cv`, `/analyze`, `/compare-job`, including a regression guard asserting `app.MODEL_PATH` resolves to `cv_job_score_model_v2.pkl`). One test's original assumption about `/analyze`'s graceful-degradation path was wrong (that branch is only reachable via a `file_url` download that extracts to empty text, not a bare empty `cv_text`) — fixed the test rather than the app, since `app.py`'s actual behavior (400 for a genuinely missing `cv_text`/`file_url`) was already correct. Full suite: **28/28 tests passing** across all four test files.

**Docs**: `README.md` updated — the deployed model, the new relative-evaluation feature, percentile fields on all three endpoints, a new "Training & Evaluation" section pointing at every script and report, and two new Known Limitations entries (the 6 near-duplicate role labels; zero Advanced-level CVs). `TRAINING_GUIDE.md` given a light-touch status note (not a rewrite — it's a still-accurate learning document) pointing at this plan and `EVALUATION_SUMMARY.md`.

**Final write-up**: [`EVALUATION_SUMMARY.md`](EVALUATION_SUMMARY.md) — the standalone capstone document for the evaluation, tying all four feedback items to their results and reports without requiring five separate documents to be opened.

---

## Dependency order

```
Phase 0 (groundwork)
   │
   ▼
Phase 1 (training script) ──▶ Phase 2 (model comparison) ──▶ Phase 3 (charts)
   │                                                              │
   ▼                                                              │
Phase 5 (demo CVs)  ◀──────────────────────────────────────────┘
                                                                   
Phase 4 (relative evaluation) — independent, run anytime after Phase 0

Phase 6 (integration & write-up) — last, depends on everything above
```

Phase 0 should happen first since it may reduce the work needed in Phases 3 and 5.

---

## Appendix — recovered reference artifacts (Phase 0, not currently wired in)

These two files were recovered from dangling git blobs alongside `advanced_analysis.py` (see Phase 0 findings above). They are **not** restored as live files — kept here as reference for whoever works on Phase 6 integration or a future analysis-history feature.

### A. `app.py` variant using `advanced_analysis.py` (reference only — do not drop in as-is)

Wires `analyze_quality` / `rank_blueprints` / `compare_job_advanced` into `/analyze` and `/compare-job`. Missing fields the live `app.py` has since gained (`ats_quality_score`, `github_verified` details, "Market blueprint" labelling) — treat as inspiration for Phase 6, not a replacement.

```python
import os
import json
import tempfile
import urllib.parse
import joblib
import pandas as pd
import requests

from flask import Flask, request, jsonify
from flask_cors import CORS

from utils.cv_parser import (
    extract_text_from_file,
    build_cv_data_from_text
)

from utils.cv_parser import extract_skills_from_text

from utils.scoring import (
    build_feature_row,
    get_level,
    generate_recommendations,
    normalize_skill,
    display_skill
)
from utils.advanced_analysis import analyze_quality, rank_blueprints, compare_job_advanced


app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
MODEL_FOLDER = os.path.join(BASE_DIR, "models")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

MODEL_PATH = os.path.join(MODEL_FOLDER, "cv_job_score_model.pkl")
PROFILE_PATH = os.path.join(MODEL_FOLDER, "job_role_profiles.json")


score_model = joblib.load(MODEL_PATH)

with open(PROFILE_PATH, "r", encoding="utf-8") as file:
    job_role_profiles = json.load(file)


@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "message": "CV Job Analyzer Flask API is running"
    })


@app.route("/roles", methods=["GET"])
def get_roles():
    roles = sorted(list(job_role_profiles.keys()))

    return jsonify({
        "roles": roles
    })


@app.route("/analyze-cv", methods=["POST"])
def analyze_cv():
    if "cv_file" not in request.files:
        return jsonify({
            "error": "CV file is required"
        }), 400

    selected_role = request.form.get("target_role", "").strip()

    if selected_role == "":
        return jsonify({
            "error": "Target role is required"
        }), 400

    if selected_role not in job_role_profiles:
        return jsonify({
            "error": "Selected role does not exist in job role profiles"
        }), 400

    uploaded_file = request.files["cv_file"]

    allowed_extensions = [".pdf", ".docx", ".txt"]
    file_extension = os.path.splitext(uploaded_file.filename)[1].lower()

    if file_extension not in allowed_extensions:
        return jsonify({
            "error": "Only PDF, DOCX, and TXT files are allowed"
        }), 400

    file_path = os.path.join(UPLOAD_FOLDER, uploaded_file.filename)
    uploaded_file.save(file_path)

    cv_text = extract_text_from_file(file_path)

    if cv_text.strip() == "":
        return jsonify({
            "error": "Could not extract text from the uploaded CV"
        }), 400

    cv_data = build_cv_data_from_text(cv_text)
    cv_data["candidate_id"] = "LIVE_USER"
    cv_data["target_role"] = selected_role

    feature_row, comparison = build_feature_row(
        cv_data,
        selected_role,
        job_role_profiles
    )

    feature_df = pd.DataFrame([feature_row])

    predicted_score = score_model.predict(feature_df)[0]
    predicted_score = round(float(predicted_score), 2)

    predicted_level = get_level(predicted_score)

    recommendations = generate_recommendations(comparison)

    return jsonify({
        "selected_role": selected_role,
        "predicted_score": predicted_score,
        "predicted_level": predicted_level,

        "extracted_skills": cv_data["cleaned_all_skills"],

        "matched_required_skills": comparison["matched_required_skills"],
        "matched_preferred_skills": comparison["matched_preferred_skills"],
        "missing_required_skills": comparison["missing_required_skills"],
        "missing_preferred_skills": comparison["missing_preferred_skills"],

        "required_match_ratio": round(comparison["required_match_ratio"], 2),
        "preferred_match_ratio": round(comparison["preferred_match_ratio"], 2),
        "project_match_ratio": round(comparison["project_match_ratio"], 2),

        "experience_months": cv_data["experience_months"],
        "experience_level": cv_data["experience_level"],
        "num_projects": cv_data["num_projects"],
        "num_certificates": cv_data["num_certificates"],

        "recommendations": recommendations
    })


# ── Adapter endpoint for the Node backend ─────────────────────────────────────
# The backend sends JSON { cv_id, file_url, github_url } and expects a different
# response shape than /analyze-cv. This route downloads the CV from the signed
# URL, reuses the existing parsing + scoring, auto-ranks ALL roles (the backend
# sends no target_role), and returns the shape the backend/frontend expect.

# experience_level (Senior/Mid/Entry) -> frontend proficiency label
_LEVEL_LABEL = {"Senior": "Advanced", "Mid": "Intermediate", "Entry": "Beginner"}


def download_cv(file_url):
    """Download the CV from a (signed) URL to a temp file. Returns (path, ext)."""
    resp = requests.get(file_url, timeout=30)
    resp.raise_for_status()
    # extension from the URL path (ignore query string), default .pdf
    path_part = urllib.parse.urlparse(file_url).path.lower()
    ext = os.path.splitext(path_part)[1] or ".pdf"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    tmp.write(resp.content)
    tmp.close()
    return tmp.name, ext


def _resolve_cv_text(body):
    """Resolve the CV text for /analyze.

    Prefers `cv_text` (already extracted by Module D's OCR pipeline at upload
    time — this module's own extractor, PyPDF2, cannot read scanned/image CVs).
    Falls back to downloading `file_url` and extracting text-based files.
    Returns (cv_text, error_response_or_None).
    """
    cv_text = (body.get("cv_text") or "").strip()
    if cv_text:
        return cv_text, None

    file_url = body.get("file_url")
    if not file_url:
        return "", (jsonify({"error": "cv_text or file_url is required"}), 400)

    try:
        path, ext = download_cv(file_url)
    except Exception as error:
        return "", (jsonify({"error": f"Could not download CV: {error}"}), 400)

    try:
        return (extract_text_from_file(path) if ext in (".pdf", ".docx", ".txt") else ""), None
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


@app.route("/analyze", methods=["POST"])
def analyze_for_backend():
    """Adapter called by the Node backend. Input: { cv_id, cv_text?, file_url?, github_url }."""
    body = request.get_json(silent=True) or {}
    cv_text, error = _resolve_cv_text(body)
    if error:
        return error

    # Unreadable files -> graceful minimal response
    if cv_text.strip() == "":
        return jsonify({
            "extracted_skills": [],
            "github_verified": [],
            "job_matches": [],
            "suggestions": [{
                "section": "general",
                "issue": "Could not read text from this CV.",
                "fix_example": "Upload a text-based PDF, DOCX, or TXT CV for full analysis.",
            }],
        })

    result = analyze_quality(cv_text)
    result["job_matches"] = rank_blueprints(cv_text, job_role_profiles)
    return jsonify(result)


# ── Job-post comparison ───────────────────────────────────────────────────────

def _closest_role(job_skill_set):
    """Pick the role blueprint with the largest skill overlap with the job post."""
    best_role, best_overlap = None, 0
    for role, profile in job_role_profiles.items():
        profile_skills = {
            normalize_skill(s)
            for s in profile.get("required_skills", []) + profile.get("preferred_skills", [])
        }
        overlap = len(job_skill_set & profile_skills)
        if overlap > best_overlap:
            best_role, best_overlap = role, overlap
    return best_role


@app.route("/compare-job", methods=["POST"])
def compare_job():
    """Compare a CV against a real job posting.

    Input:  { cv_text, job_text }
    Output: matched/missing skills, match %, closest role blueprint, and the
            ML model's predicted readiness score for that role.
    """
    body = request.get_json(silent=True) or {}
    cv_text = (body.get("cv_text") or "").strip()
    job_text = (body.get("job_text") or "").strip()

    if not cv_text or not job_text:
        return jsonify({"error": "cv_text and job_text are required"}), 400

    result = compare_job_advanced(cv_text, job_text)
    if not result["job_skills"]:
        return jsonify({"error": "No recognisable skills found in the job post text."}), 422
    result["closest_role"] = _closest_role({normalize_skill(s) for s in result["requirements"]["required_skills"]})
    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True, port=8003)
```

### B. SQL migration for `cv_analysis_runs` (reference only — belongs in the Node backend's `backend/supabase/migrations/`, not python-module-c)

A history/cache table keyed by `content_hash` + `scoring_version`, designed to store `analyze_quality`-style results per CV over time — the natural foundation for Phase 4's relative-evaluation percentiles if ever revived at the database level instead of a static JSON lookup.

```sql
-- Evidence-based CV quality analysis history. No ATS fields are introduced.
create table if not exists public.cv_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  cv_id uuid not null references public.cvs(id) on delete cascade,
  job_post_id uuid references public.cv_job_posts(id) on delete set null,
  content_hash text not null,
  status text not null default 'queued'
    check (status in ('queued','extracting','analysing','completed','completed_degraded','failed')),
  analysis_mode text,
  component_scores jsonb not null default '{}'::jsonb,
  overall_score int check (overall_score between 0 and 100),
  result jsonb,
  model_version text,
  scoring_version text,
  failure_code text,
  failure_message text,
  attempt_count int not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists cv_analysis_runs_cv_created_idx on public.cv_analysis_runs(cv_id, created_at desc);
create index if not exists cv_analysis_runs_cache_idx on public.cv_analysis_runs(cv_id, content_hash, scoring_version, status);
alter table public.cv_analysis_runs enable row level security;

create policy "cv_analysis_runs_select" on public.cv_analysis_runs for select
  using (exists (select 1 from public.cvs where cvs.id = cv_id and cvs.user_id = auth.uid()));
create policy "cv_analysis_runs_insert" on public.cv_analysis_runs for insert
  with check (exists (select 1 from public.cvs where cvs.id = cv_id and cvs.user_id = auth.uid()));
create policy "cv_analysis_runs_update" on public.cv_analysis_runs for update
  using (exists (select 1 from public.cvs where cvs.id = cv_id and cvs.user_id = auth.uid()));

alter table public.cv_suggestions add column if not exists recommendation_id text;
alter table public.cv_suggestions add column if not exists entry_reference text;
alter table public.cv_suggestions add column if not exists original_text text;
alter table public.cv_suggestions add column if not exists explanation text;
alter table public.cv_suggestions add column if not exists estimated_impact int;
alter table public.cv_suggestions add column if not exists source text default 'deterministic';
alter table public.cv_suggestions add column if not exists status text default 'pending'
  check (status in ('pending','applied','rejected','edited','undone'));
alter table public.cv_suggestions add column if not exists updated_at timestamptz default now();
```
