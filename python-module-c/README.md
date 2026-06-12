# Module C — CV Job Analyzer

| | |
|---|---|
| **Project** | PathwayIQ (R26-IT-128) |
| **Stack** | Python · Flask · scikit-learn · pandas |
| **Port** | `8003` |
| **Folders** | `backend/` (Flask API) · `frontend/` (standalone Vite demo, port 5173) |

## What this component does

Module C analyses a CV against the IT job market: it extracts skills from the CV text, scores the CV's ATS quality, ranks the candidate's readiness against **24 curated job-role blueprints** with a trained ML model, and (new) compares the CV against a **real pasted job posting**.

## Features

- **Skill extraction** — regex alias matching over 50+ canonical skills (~200 alias variants), e.g. "ReactJS", "react.js" → `react`. See `backend/utils/cv_parser.py` (`SKILL_ALIASES`).
- **ATS quality score (0–100)** — heuristic structural check of the CV text: sections present, contact details, bullet usage, length (`estimate_ats_quality_score`).
- **Role readiness prediction** — a pickled scikit-learn model (`backend/models/cv_job_score_model.pkl`, 18 features: skill-match ratios, experience months, project/certificate counts, ATS score) predicts a 0–100 readiness score per role; mapped to Beginner / Intermediate / Advanced.
- **Role blueprints** — `backend/models/job_role_profiles.json` holds 24 roles with required / preferred skills and common tools, derived from job-posting analysis. Matches against these are labelled **"Market blueprint"** in the app (they are not live job ads).
- **Job-post comparison** *(new)* — extracts skills from a real job advertisement and diffs them against the CV: match %, matched/missing skills, closest blueprint role, and the ML readiness score for it.
- **Experience estimation** — date-range parsing (`dateparser` + regex) to estimate total experience months → Entry / Mid / Senior.

## Endpoints

| Method | Path | Used by | Description |
|---|---|---|---|
| GET | `/` | — | Health check |
| GET | `/roles` | demo UI | List the 24 blueprint role names |
| POST | `/analyze-cv` | standalone Vite demo | Multipart `cv_file` + `target_role` → detailed match breakdown for ONE role |
| POST | `/analyze` | Express backend | JSON `{ cv_id, cv_text?, file_url?, github_url }` → ranks the CV against ALL roles, returns the backend contract (`extracted_skills`, `ats_score`, `job_matches`, `suggestions`) |
| POST | `/compare-job` | Express backend | JSON `{ cv_text, job_text }` → `{ match_pct, matched_skills, missing_skills, closest_role, predicted_score, predicted_level, recommendations }` |

## How `/analyze` works

1. **Text resolution** — prefers the `cv_text` field, which is the text already OCR'd by **Module D** at upload time. This matters because Module C's own extractor (PyPDF2 / python-docx) **cannot read scanned or image CVs**; before this change, image CVs analysed as empty. `file_url` download is kept only as a fallback for text-based files.
2. **Parse** — `build_cv_data_from_text` extracts skills, experience months, project/certificate counts, and the ATS quality score.
3. **Score every role** — for each of the 24 blueprints, build the 18-feature row and run the ML model; sort by predicted score.
4. **Map to the backend contract** — top 5 roles become `job_matches` (company = "Market blueprint"), missing required skills become `skill_gaps`, recommendations become `suggestions`.

## How `/compare-job` works

1. Extract skills from both the CV text and the job-post text with the same alias extractor.
2. `match_pct` = matched ÷ job-post skills; `missing_skills` = in the job post but not the CV.
3. Pick the blueprint role with the largest skill overlap with the job post (`closest_role`) and run the ML model against it for `predicted_score` / `predicted_level`.
4. Recommendations = per-gap advice ("Add or strengthen X — required by this job post") + blueprint recommendations.

In the full app, the Express backend enriches this result with **Module A** market-demand data for each missing skill and **Module D** LLM tailoring suggestions, then stores everything in `cv_job_posts`.

## Determinism

There is **no randomness** in this module: the same CV text always produces the same scores (regex extraction + a fixed ML model). A score only changes when the CV content changes.

## Known limitations

- No OCR of its own — depends on Module D's extraction for scanned/image CVs.
- Skill extraction is exact-alias based; unusual spellings or very new tools are missed unless added to `SKILL_ALIASES`.
- Role blueprints are static JSON; updating them requires editing `job_role_profiles.json` (and ideally retraining).
- `github_url` is accepted but unused — GitHub verification lives in the Express backend (`github.service.ts`), not here.

## Running

```bash
cd python-module-c/backend
./venv/bin/python app.py          # Flask on :8003
# or via the repo root: ./run-all.sh
```

The standalone demo UI: `cd python-module-c/frontend && npm run dev` (Vite, :5173) — it duplicates `/analyze-cv` for direct testing and is not part of the main app flow.

> ⚠️ Flask runs without auto-reload in the run-all setup — restart the process after code changes.
