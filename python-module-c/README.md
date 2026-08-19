# Module C — CV Job Analyzer

| | |
|---|---|
| **Project** | PathwayIQ (R26-IT-128) |
| **Stack** | Python · Flask · scikit-learn · pandas · pypdf/python-docx · EasyOCR/pdf2image (own OCR) · local Ollama (own LLM structuring) |
| **Port** | `8003` |
| **Folders** | `backend/` (Flask API) · `frontend/` (standalone Vite demo, port 5173) |

## What this component does

Module C analyses a CV against the IT job market: it extracts skills from the CV text, scores the CV's ATS quality, ranks the candidate's readiness against **24 curated job-role blueprints** with a trained ML model, shows how that readiness **compares to other applicants for the same role**, and compares the CV against a **real pasted job posting**.

## Features

- **Skill extraction** — regex alias matching over 50+ canonical skills (~200 alias variants), e.g. "ReactJS", "react.js" → `react`. See `backend/utils/cv_parser.py` (`SKILL_ALIASES`).
- **ATS quality score (0–100)** — heuristic structural check of the CV text: sections present, contact details, bullet usage, length (`estimate_ats_quality_score`).
- **Role readiness prediction** — a pickled scikit-learn pipeline (`backend/models/cv_job_score_model_v2.pkl`, a tuned `HistGradientBoostingRegressor` — see [Training & Evaluation](#training--evaluation) below — 18 features: skill-match ratios, experience months, project/certificate counts, ATS score) predicts a 0–100 readiness score per role; mapped to Beginner / Intermediate / Advanced.
- **Relative evaluation** — alongside the absolute score, a `percentile`/`percentile_label` (e.g. "Scored higher than 72% of candidates for this role") shows how the candidate compares to other historical applicants for the same role, looked up from `backend/models/role_score_distributions.json`. `None` when a role has too few historical CVs for a meaningful percentile (see `IMPROVEMENT_PLAN.md` Phase 4).
- **Role blueprints** — `backend/models/job_role_profiles.json` holds 24 roles with required / preferred skills and common tools, derived from job-posting analysis. Matches against these are labelled **"Market blueprint"** in the app (they are not live job ads).
- **Job-post comparison** — extracts skills from a real job advertisement and diffs them against the CV: match %, matched/missing skills, closest blueprint role, and the ML readiness score (with percentile) for it.
- **Experience estimation** — date-range parsing (`dateparser` + regex) to estimate total experience months → Entry / Mid / Senior.
- **Own OCR pipeline** — text-based PDF/DOCX/TXT extraction (`pypdf`, `python-docx`), plus a self-contained OCR fallback (`EasyOCR` + `pdf2image`) for scanned PDFs and PNG/JPG CVs — no dependency on Module D. Per-page quality gating decides text-layer vs. OCR; see `backend/utils/ocr.py`.
- **LLM-assisted section splitting** — a local Ollama call (`backend/utils/llm_structurer.py`) structures raw CV text into sections before the regex-based estimators run, with an automatic fallback to the regex splitter if Ollama is unreachable.

## Endpoints

| Method | Path | Used by | Description |
|---|---|---|---|
| GET | `/` | — | Health check |
| GET | `/roles` | demo UI | List the 24 blueprint role names |
| POST | `/analyze-cv` | standalone Vite demo | Multipart `cv_file` + `target_role` → detailed match breakdown for ONE role, including `percentile`/`percentile_label` |
| POST | `/analyze` | Express backend | JSON `{ cv_id, cv_text?, file_url?, github_url }` → ranks the CV against ALL roles, returns the backend contract (`extracted_skills`, `ats_score`, `job_matches`, `suggestions`) — each `job_matches` entry also carries `percentile`/`percentile_label` |
| POST | `/compare-job` | Express backend | JSON `{ cv_text, job_text }` → `{ match_pct, matched_skills, missing_skills, closest_role, predicted_score, predicted_level, percentile, percentile_label, recommendations }` |

## How `/analyze` works

1. **Text resolution** — prefers the `cv_text` field, which is the text already extracted upstream (by Module D at upload time, if that ran). When it's missing, falls back to downloading `file_url` and running Module C's **own** extraction pipeline: `pypdf`/`python-docx` for text-based files, with a self-contained OCR fallback (`EasyOCR` + `pdf2image`, `backend/utils/ocr.py`) for scanned PDFs and PNG/JPG — no dependency on Module D either way. The response includes an `extraction: { method, quality }` block reporting what actually happened (`"text-layer"` / `"ocr"` / `"mixed"` / `"direct"` for the `file_url` path, `"upstream"` when `cv_text` arrived pre-extracted).
2. **Parse** — `build_cv_data_from_text` extracts skills, experience months, project/certificate counts, and the ATS quality score.
3. **Score every role** — for each of the 24 blueprints, build the 18-feature row and run the ML model; sort by predicted score.
4. **Map to the backend contract** — top 5 roles become `job_matches` (company = "Market blueprint"), missing required skills become `skill_gaps`, recommendations become `suggestions`; each match also carries `percentile`/`percentile_label` from `role_score_distributions.json`.

## How `/compare-job` works

1. Extract skills from both the CV text and the job-post text with the same alias extractor.
2. `match_pct` = matched ÷ job-post skills; `missing_skills` = in the job post but not the CV.
3. Pick the blueprint role with the largest skill overlap with the job post (`closest_role`) and run the ML model against it for `predicted_score` / `predicted_level`.
4. Recommendations = per-gap advice ("Add or strengthen X — required by this job post") + blueprint recommendations.

In the full app, the Express backend enriches this result with **Module A** market-demand data for each missing skill and **Module D** LLM tailoring suggestions, then stores everything in `cv_job_posts`.

## Training & Evaluation

The model, role-blueprint aggregation, and demo dataset were originally built in `backend/models/CV_Job_Model (3).ipynb` (Colab notebook). That pipeline has since been converted into reproducible local scripts, and extended with a proper algorithm comparison, relative evaluation, and role-specific demo — see **[`IMPROVEMENT_PLAN.md`](IMPROVEMENT_PLAN.md)** for the full phase-by-phase history and **[`EVALUATION_SUMMARY.md`](EVALUATION_SUMMARY.md)** for the results writeup:

| Script | Produces |
|---|---|
| `backend/train.py` | `Dataset/scored_training_dataset.csv` (labeled dataset) + a baseline model |
| `backend/compare_models.py` | Model comparison (Random Forest / Gradient Boosting / Extra Trees / Voting Ensemble), tunes the winner, saves `models/cv_job_score_model_v2.pkl` + `models/model_registry.json` |
| `backend/build_score_distributions.py` | `models/role_score_distributions.json` — the relative-evaluation percentile lookup |
| `backend/visualize_dataset.py`, `backend/visualize_relative_eval.py` | Dataset and percentile charts |
| `backend/build_demo.py` | The 5-role demo (`reports/phase5-model-testing-demo/`) |

All generated reports/charts live under `reports/phase{2,3,4,5}-*/`. `models/model_registry.json` tracks which model version is currently deployed (`v2`, a tuned `HistGradientBoostingRegressor` — CV MAE 0.75 vs. `v1`'s 1.41, tuned held-out test MAE 0.61 / R² 0.997; `v1`, the original notebook's Random Forest, is retired but kept on disk for rollback).

## Configuration (environment variables)

All optional — every one has a working default for local dev.

| Variable | Default | Purpose |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama server used for LLM section structuring. Same name Module D uses, for consistency — each module still reads it independently. |
| `OLLAMA_MODEL` | `gemma4:e2b` | Model tag to call. Falls back to the regex splitter if unset/unreachable/not pulled. |
| `OCR_USE_GPU` | `false` | Pass `true` only on a CUDA-capable machine — EasyOCR's GPU path is CUDA-only, no effect (or an error) without it. |

## Determinism

Extraction and scoring are deterministic (regex extraction + a fixed ML model) **except** for the LLM section-structuring step (`utils/llm_structurer.py`, Phase 2): when Ollama is reachable, the same CV text can produce a slightly different section split from one run to the next (normal LLM sampling variance), which can in turn shift downstream counts (experience months, project/certificate counts) that depend on exactly how the text got bucketed. When Ollama is unreachable, extraction falls back to the purely deterministic regex splitter.

## Known limitations

- **OCR is slow on CPU.** A single scanned page (3 preprocessing variants × EasyOCR inference) takes roughly 45-80s on a CPU-only machine; a multi-page scanned CV scales close to linearly (a 3-page scan measured ~200s end-to-end). Text-based PDF/DOCX/TXT stay fast (~1-3s) since they never touch OCR. Set `OCR_USE_GPU=true` on a CUDA-capable machine to speed this up — there's no GPU acceleration path on Apple Silicon (this dev machine), so it stays CPU-only here.
- **OCR accuracy is imperfect**, especially exact line/word ordering on multi-column layouts — expected for CPU-based EasyOCR, not a bug. Section content is still generally recoverable.
- **Some PDF export pipelines position every glyph individually**, which `pypdf` then extracts as a space between every letter (`"D U L I N A"`). Detected and collapsed automatically (`cv_parser._collapse_letter_spacing`) — found via a real CV during Phase 5 testing, not a hypothetical case.
- **Multi-column PDF layouts can extract out of visual reading order.** `pypdf`'s `extraction_mode="layout"` (designed to preserve column order) returns empty for some PDFs — when that happens, the fallback `"plain"` mode's raw content-stream order is used instead, which doesn't always match the visual left-to-right, top-to-bottom reading order for genuinely multi-column sections. Skill extraction is unaffected (it's order-independent, scans the whole text), but a section header can end up detected correctly while its actual content is attributed to a different, later-active section. No general fix implemented — found via the real 2-column-layout sample CV in `tests/samplecv/`.
- **The project/certificate line-counting heuristics assume a specific format** (a bulleted line, a title line containing the word "project", or a `"|"`-separated title) that not every resume follows — a CV whose project titles are bare names with no bullet/keyword/separator will undercount. Pre-existing scoring-heuristic behavior, not something the OCR/extraction work changed.
- **`estimate_experience_months` sums every date range it finds** rather than merging overlaps — two concurrent/overlapping jobs (common for freelance + full-time, or an internship overlapping a new role) will inflate the total above the CV's true tenure. Pre-existing behavior, surfaced by a real CV with two overlapping employment ranges.
- **The Flask dev server (`python app.py`) is synchronous** — one long OCR request blocks others on the same process. Fine for local dev; a production deployment should run behind a WSGI server (e.g. `gunicorn -w <N> --timeout <large>`) with a worker count and timeout sized for OCR's latency — not implemented here, flagged so it isn't silently forgotten.
- Skill extraction is exact-alias based; unusual spellings or very new tools are missed unless added to `SKILL_ALIASES`.
- Role blueprints are static JSON; updating them requires editing `job_role_profiles.json` (and ideally retraining).
- `github_url` is accepted but unused — GitHub verification lives in the Express backend (`github.service.ts`), not here.
- The training dataset has near-duplicate role labels for 6 of the 24 roles (e.g. `Mobile Developer` vs. `Mobile Application Developer` vs. `Mobile App Developer`) — each has only 1–2 CVs, so `percentile`/`percentile_label` come back `None` for those roles until the labels are consolidated and the dataset re-scored. See `IMPROVEMENT_PLAN.md` Phase 4 findings.
- No CV in the current training dataset reaches "Advanced" level (`final_score ≥ 80`) — the label formula's five components don't happen to max out simultaneously for any of the 2,066 CVs. See `IMPROVEMENT_PLAN.md` Phase 3 findings.

## Running

```bash
cd python-module-c/backend
./venv/bin/python app.py          # Flask on :8003
# or via the repo root: ./run-all.sh
```

The standalone demo UI: `cd python-module-c/frontend && npm run dev` (Vite, :5173) — it duplicates `/analyze-cv` for direct testing and is not part of the main app flow.

> Startup loads the EasyOCR reader and warms the local Ollama model before the server starts accepting requests (a few seconds if Ollama's already warm from recent use; longer on a cold Ollama load) — so the first real upload isn't the one that pays that cost. Best-effort: if either fails to warm up, the first real request retries and just pays the cost itself instead of crashing startup.

> ⚠️ Flask runs without auto-reload in the run-all setup — restart the process after code changes.

## Testing

```bash
cd python-module-c
./backend/venv/bin/python -m unittest discover -s tests          # fast — a few seconds to ~30s
RUN_SLOW_TESTS=1 ./backend/venv/bin/python -m unittest discover -s tests   # + real OCR/Ollama calls, several minutes
```

`tests/test_cv_parser.py`, `test_ocr.py`, and `test_llm_structurer.py` cover the extraction pipeline directly; real OCR/Ollama calls are gated behind `RUN_SLOW_TESTS=1` (`unittest.skipUnless`) so the default run stays fast — everything else (fixture generation, JSON parsing/validation, the fallback paths) is tested with fast, deterministic inputs instead. `tests/fixture_builders.py` generates every fixture (corrupt files, encrypted PDFs, table-layout DOCX, encoding variants, a synthetic scanned-CV image) from libraries already in `requirements.txt` — no `cupsfilter`/`reportlab`, so it builds identically in CI. `tests/samplecv/dulina-indrawansha-cv-2025.pdf` is a real 2-page CV used as a fixture precisely because its 2-column skills layout and letter-spaced PDF export are harder than any synthetic fixture — it's what found the letter-spacing bug documented above.
