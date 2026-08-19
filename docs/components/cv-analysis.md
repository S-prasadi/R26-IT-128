# CV Analysis (Module C)

> *"How good is my CV, and which jobs am I a match for?"*
> The CV Analyser reads an uploaded CV, gives it an **ATS quality score** out of 100, finds the **skills** in it, and ranks how well it matches **24 job roles** — telling you which skills you're missing for each.

New here? Read [the project overview](00-project-overview.md) first. This document zooms into just the CV module.

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
9. [Understanding the results: what each number and chart means](#9-understanding-the-results-what-each-number-and-chart-means)
10. [The database tables it uses](#10-the-database-tables-it-uses)
11. [Validation: what gets checked](#11-validation-what-gets-checked)
12. [Error handling](#12-error-handling)
13. [Security](#13-security)
14. [What happens if the AI service is off](#14-what-happens-if-the-ai-service-is-off)
15. [A real example, start to finish](#15-a-real-example-start-to-finish)
16. [Sequence diagram (text)](#16-sequence-diagram-text)
17. [Where it lives in the code](#17-where-it-lives-in-the-code)

---

## 1. What this module does

A user uploads their CV (PDF, image, or text file). The app then:

- **reads the text** out of the file,
- **pulls out the skills** mentioned and labels each with a proficiency guess,
- gives an **ATS score** (how well a real applicant-tracking system would rate the CV's quality),
- **scores the CV against 24 job-role profiles** using a pre-trained machine-learning model, ranking the best matches and listing the **skills you're missing** for each,
- and produces **improvement suggestions** ("your action verbs are weak", "add measurable outcomes").

Two AI brains cooperate here:

- **Module D** reads the file and extracts structured text at upload time (it has OCR, so it can read images and scanned PDFs).
- **Module C** does the scoring at analyse time. It now has its **own independent OCR + LLM pipeline** too — `pypdf`/`python-docx` for text-based files, with a self-contained `EasyOCR` + `pdf2image` fallback for scanned PDFs and PNG/JPG, plus a local-Ollama LLM structuring step — entirely separate from Module D's, sharing no code or HTTP calls with it. In the normal app flow Module D's upload-time extraction still runs first and Module C simply scores the resulting `cv_text`; Module C's own pipeline kicks in as a fallback (the `file_url` path, when `cv_text` wasn't supplied) and in its standalone demo UI's direct-upload endpoint. See [`docs/cv-ocr-gap-analysis.md`](../cv-ocr-gap-analysis.md) and [`docs/cv-ocr-pipeline-implementation-plan.md`](../cv-ocr-pipeline-implementation-plan.md) for the full build-out.

Two bonus features compare a CV against the real world: a **job-post comparison** (paste a real job ad) and **GitHub project verification** (check your listed projects exist in your repos).

---

## 2. Feature list

| Feature | What you do | What you see |
|---------|-------------|--------------|
| **Create a CV** | Click "New CV", give it a title | An empty CV record |
| **Upload a file** | Upload PDF/PNG/JPG/TXT (max 10 MB) | Auto-filled sections (summary, experience, education, skills, projects) |
| **Edit sections** | Fix or add any section by hand | Saved structured sections |
| **Analyse the CV** | Click "Analyse CV" | ATS score, extracted skills, ranked job matches, suggestions |
| **Compare to a job post** | Paste a real job description | Match %, missing skills (with market demand), AI tailoring tips |
| **Verify projects on GitHub** | Click "Verify Projects" | Which listed projects were found in your repos, and confidence |
| **Manage CVs** | List / update / delete CVs | Your CV library |

---

## 3. The journey of your data (step by step)

There are **two main moments**: uploading and analysing.

**When you upload a CV file** (`POST /api/cv/:id/upload`):

1. **You pick a file** (PDF/PNG/JPG/TXT) on the CV page.
2. **The page sends the file to the backend** using a multipart upload. The `uploadSingle` middleware (Multer) holds the file in memory and rejects anything that isn't an allowed type or is over 10 MB.
3. **The backend checks ownership** — the CV must belong to you.
4. **The backend saves the file** into Supabase Storage (a private bucket called `cv-files`), at a path like `userId/cvId.pdf`.
5. **The backend asks Module D to read it** — it base64-encodes the file and sends it to `http://localhost:8004/extract-cv`, which uses OCR + an AI model to extract the text and split it into sections.
6. **The backend saves those sections** to `cv_sections` (so you don't type them) and stores the raw text + any GitHub/LinkedIn links it found on the `cvs` row. It nudges your progress up.

**When you click "Analyse CV"** (`POST /api/cv/:id/analyze`):

7. **The backend gathers the CV text** via `getCvText()` — it prefers your current saved sections (so your edits affect the score), falling back to the raw uploaded text if sections are too sparse.
8. **The backend creates a 1-hour signed link** to the stored file and asks **Module C** at `http://localhost:8003/analyze`, sending `{ cv_id, cv_text, file_url, github_url }`.
9. **Module C does the scoring** — extracts skills, computes the ATS score, ranks the CV against all 24 role profiles, and returns matches + suggestions.
10. **The backend saves the results** — ATS score and skills onto the `cvs` row, the ranked matches into `cv_job_matches`, the suggestions into `cv_suggestions` — and computes an overall `match_score` (average of the top-3 matches).
11. **The backend sends a "CV Analysis Complete" notification** and returns everything.
12. **The page shows it all**: an ATS gauge, your skills, ranked role matches, and fix-it suggestions.

---

## 4. How the pieces talk (diagram)

```
UPLOAD:
You ─ pick file ─► CV page ─ POST /api/cv/:id/upload ─► Backend
                                                          │ Multer: type + 10MB check
                                                          │ save file → Supabase Storage (cv-files)
                                                          │ POST :8004/extract-cv ─► Module D (reads text via OCR)
                                                          │ save sections + raw text + links → DB
                                                          ▼
You ◄──────────────────────────────────────── extracted sections shown

ANALYSE:
You ─ click "Analyse" ─► CV page ─ POST /api/cv/:id/analyze ─► Backend
                                                                 │ gather CV text (saved sections)
                                                                 │ make 1-hour signed file link
                                                                 │ POST :8003/analyze ─► Module C (scores CV)
                                                                 │ save score+skills+matches+suggestions → DB
                                                                 │ notify
                                                                 ▼
You ◄────────────────────── ATS gauge + skills + job matches + suggestions
```

---

## 5. Frontend side

- **The page:** `frontend/src/app/(dashboard)/cv/page.tsx` — a step-based flow: create/select a CV → upload → review/edit sections → analyse → view results. Also hosts the job-post comparison and GitHub verification panels.
- **State management:** React state for the CV list, the selected CV (with its sections, matches, suggestions, job posts), the upload progress, and the analysis result.
- **Forms & uploads:** the file picker posts multipart data; section editors are normal forms; the job-post panel takes pasted text.
- **API calls:** through `frontend/src/services/cv.service.ts` — list/get/create/update/delete CV, upsert sections, upload, analyse, verify projects, attach/delete job posts.
- **Result UI:** an ATS gauge, skill chips with proficiency, ranked job-match cards (each showing missing skills), and a suggestions list.

---

## 6. Backend side

Chain: **route → controller → service → (Storage + DB + Modules C / D / A)**.

The service (`cv.service.ts`) functions:

- `listCVs()`, `getCV()`, `createCV()`, `updateCV()`, `deleteCV()` — manage CV records. `getCV()` also generates a fresh signed file URL and bundles sections, matches, suggestions, and job posts.
- `upsertSections()` — replace the structured sections with edited ones.
- `uploadCV()` — save the file to Storage, call **Module D** `/extract-cv`, persist sections + raw text + links.
- `getCvText()` — assemble the best available CV text for analysis (saved sections, else raw OCR text).
- `analyzeCV()` — call **Module C** `/analyze`, then save score, skills, matches, suggestions, and notify.
- `verifyProjects()` — cross-check the CV's projects against the user's GitHub repos (via `githubService`).
- `attachJobPost()` — compare the CV against a pasted job ad using **Module C** `/compare-job`, annotate gaps with **Module A** demand, and get tailoring tips from **Module D** `/tailor-cv`.

---

## 7. Routes and endpoints

All under `/api/cv`, all require a valid login token.

| Method | Path | What it does | Permission |
|--------|------|--------------|------------|
| GET | `/api/cv` | List the user's CVs | `cv:read` |
| GET | `/api/cv/:id` | Get one CV with sections, matches, suggestions, job posts | `cv:read` |
| POST | `/api/cv` | Create a CV | `cv:write` |
| PATCH | `/api/cv/:id` | Update CV metadata | `cv:write` |
| DELETE | `/api/cv/:id` | Delete a CV | `cv:write` |
| PUT | `/api/cv/:id/sections` | Replace structured sections | `cv:write` |
| **POST** | **`/api/cv/:id/upload`** | **Upload a file → Module D extracts text** | `cv:write` |
| **POST** | **`/api/cv/:id/analyze`** | **Run ATS analysis → Module C scores it** | `cv:write` |
| POST | `/api/cv/:id/verify-projects` | Check projects against GitHub | `cv:write` |
| POST | `/api/cv/:id/job-post` | Compare against a pasted job ad | `cv:write` |
| DELETE | `/api/cv/:id/job-post/:jobPostId` | Remove an attached job post | `cv:write` |

**Module endpoints called by the backend:** Module C `POST :8003/analyze` and `/compare-job`; Module D `POST :8004/extract-cv` and `/tailor-cv`; Module A `POST :8001/forecast`.

---

## 8. What you send and what you get back (examples)

**Request** — `POST /api/cv/:id/analyze` (body can be empty; the backend resolves the file itself)

```json
{ "github_url": "https://github.com/ishara" }
```

**Successful response** (shortened — this is Module C's raw `/analyze` output, passed straight through by `analyzeCV()`; see §9 for what each field means):

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "ats_score": 74,
    "extracted_skills": [
      { "name": "python", "proficiency_label": "Advanced", "confidence": 0.9 },
      { "name": "css",    "proficiency_label": "Advanced", "confidence": 0.6 }
    ],
    "job_matches": [
      { "title": "AI ML", "company": "Market blueprint", "match_pct": 60,
        "skill_gaps": ["Computer Vision", "NLP", "TensorFlow"],
        "percentile": 90, "percentile_label": "Scored higher than 90% of candidates for this role" }
    ],
    "suggestions": [
      { "section": "skills", "issue": "Improve Computer Vision because it is important for this role.",
        "fix_example": "Computer Vision" }
    ],
    "github_verified": [],
    "extraction": { "method": "upstream", "quality": 0.87 }
  }
}
```

Note: `confidence` only ever comes back as exactly **0.9, 0.75, or 0.6** (§9.2) — never an arbitrary value. `suggestions[].section` only ever comes back as `"skills"` from `/analyze` — Module C doesn't generate experience/summary/project suggestions itself (those only appear from the separate job-post tailoring feature, §9.5).

`extraction` is a diagnostic block (not currently rendered anywhere in the UI) reporting how Module C actually got the text it scored: `method` is one of `"upstream"` (the `cv_text` field arrived pre-extracted — the normal case, since Module D already extracted it at upload time), `"text-layer"` (Module C's own `pypdf` extraction), `"ocr"` (Module C's own OCR fallback kicked in — see §1), `"direct"` (DOCX), `"mixed"`, or `"none"`/`"unsupported"`. `quality` is a rough 0–1 confidence heuristic on the extracted text itself.

**Error response** (e.g. uploading an unsupported file type):

```json
{ "success": false, "message": "Unsupported file type. Upload a PDF, PNG, JPG, or TXT file." }
```

---

## 9. Understanding the results: what each number and chart means

The Analysis page and the "Compare With a Real Job Post" panel both show percentages, but they come from **different engines that don't mean the same thing** — this is the part that trips people up, so read this before comparing numbers across sections.

### 9.1 Job Matches (the bar chart + ranked cards)

Module C scores your CV against **24 curated role blueprints** (skill/experience profiles built from training data — not live scraped job ads) using a tuned Gradient Boosting regression model, and returns the top 5.

**Why Gradient Boosting, not the original Random Forest.** In response to a supervisor review, four candidate algorithms were cross-validated (5-fold) on the same 2,066-CV training set — full write-up in [`python-module-c/EVALUATION_SUMMARY.md`](../../python-module-c/EVALUATION_SUMMARY.md) and [`IMPROVEMENT_PLAN.md`](../../python-module-c/IMPROVEMENT_PLAN.md):

| Model | CV MAE (mean ± std) | CV R² (mean ± std) |
|---|---|---|
| **Gradient Boosting (`HistGradientBoostingRegressor`)** | **0.748 ± 0.065** | **0.9929 ± 0.0012** |
| Voting Ensemble | 1.015 ± 0.042 | 0.9876 ± 0.0010 |
| Extra Trees | 1.309 ± 0.045 | 0.9793 ± 0.0015 |
| Random Forest (original, `v1`) | 1.406 ± 0.074 | 0.9775 ± 0.0021 |

Gradient Boosting won decisively — **47% lower cross-validated error than the original Random Forest**. After tuning (`RandomizedSearchCV`: `max_iter=300, learning_rate=0.1, max_depth=3, min_samples_leaf=30`), held-out test performance was **MAE 0.61, R² 0.997**. This is what's actually deployed: `backend/app.py` loads `cv_job_score_model_v2.pkl` (Gradient Boosting); the original Random Forest (`v1`) is retired but kept on disk for rollback, tracked in `backend/models/model_registry.json`. Worth reading in context, though: the training label (`final_score`) is itself a hand-written formula of the same features the model receives, not a real recruiter decision — so any reasonably flexible model reaches R² ≈ 0.98+ almost by construction. The point of this comparison was finding the most **robust** model with a legitimate, evidence-backed comparison table, not chasing the last fraction of R².

- **Blue bar / "match %"** — the model's predicted 0–100 fit score for that role, from your skills, experience, project count, certificates, and CV quality.
- **"Market blueprint"** instead of a company name — intentional. There's no real employer behind a job match; it's a scored comparison against a curated role profile.
- **Gap tags** — the skills that role's blueprint *requires* which your CV is missing.

**Green bar / "Percentile vs. others" — what it actually means**

It tells you how your match score for a role compares to **other CVs that have been scored for that same role before** — not to any live population of real applicants.

How it's calculated (`python-module-c/backend/utils/relative_eval.py`):

1. There's a file (`role_score_distributions.json`) built once from a training dataset of previously-scored CVs, containing a sorted list of scores per role.
2. When you get a match % for a role (say 60% for "AI ML"), the system checks: out of all the historical scores on record for "AI ML", what percentage were at or below 60?
3. That percentage is your percentile, shown as "Scored higher than X% of candidates for this role."

So if you see "Scored higher than 90% of candidates for AI ML" — it means your 60% match score ranks above 90% of the historical CVs that were scored against that specific role blueprint.

A few things worth knowing:

- **It's a static reference dataset, not live users.** It doesn't update as other real people use the app right now — it's a fixed distribution built from training data.
- **It can be misleading with small samples.** If a role only has a handful of historical scores on record, "higher than 100%" just means your score beat every one of that small sample — not that you're literally better than everyone who's ever applied.
- **Below 5 historical samples, it's hidden entirely** — that's why some roles show only the blue "Match %" bar with no green one (`MIN_SAMPLES_FOR_PERCENTILE = 5` in `relative_eval.py`). The code deliberately withholds the percentile rather than show a number computed from too few data points to mean anything.
- **It's role-specific.** Your percentile for "AI ML" and your percentile for "Backend Developer" come from two completely separate historical distributions — they're not comparable to each other.

In short: it answers "how does my fit score for this role compare to other candidates historically scored for this same role" — a ranking against past data, not a real-time leaderboard. The same mechanism (and the same caveats) applies again in §9.5's job-post comparison, benchmarked against that panel's "closest role blueprint" instead.

### 9.2 Extracted Skills chips

Each chip shows two independently-computed values:

- **Proficiency label** (e.g. "Advanced") — **not per-skill**. It's your CV's *overall* estimated experience level (from total months of experience mentioned in the text: Entry <12mo, Mid 12–35mo, Senior 36mo+ → Beginner/Intermediate/Advanced), applied identically to every skill chip.
- **Confidence %** — **is** per-skill: 90% if that skill is explicitly *required* by your #1-ranked job match, 75% if it's *preferred* for that role, 60% otherwise (found in your CV text, but not tied to the top role's requirements).

> **Fixed 2026-08-19** — this confidence tiering was silently broken from launch until this date: `compare_cv_with_role()` returns matched-skill names through `display_skill()` (title-cased, e.g. `"PyTorch"`), but the code checked membership against `cleaned_all_skills`, which is lowercase (`"pytorch"`). Python string equality is case-sensitive, so `"pytorch" in {"PyTorch", ...}` was always `False` — every chip silently fell through to the 60% default, for every skill, on every CV, regardless of actual role fit. Confirmed empirically: before the fix, all 22 chips on a real CV read exactly 60% even though 10 of those skills were directly required/preferred by its own #1 job match. Fixed in `app.py`'s `confidence_for()` by normalizing both sides with `normalize_skill()` before comparing. Confidence values now genuinely vary — see the `python` (0.9, required) vs. `css` (0.6, unrelated) contrast in §8's example response.

### 9.3 Improvement Suggestions (on the Analysis page)

These are generated **only from your #1 job match**, not all 5 listed roles: up to 5 missing required skills become "Improve X because it is important for this role.", then any remaining slots (up to 5 total) are filled from missing preferred skills as "Learning Y can strengthen your profile."

Clicking **Apply →** on one of these adds the missing skill (`fix_example`, e.g. `"Computer Vision"`) to your **Skills → Other** list and switches you into the section editor — see §9.6 for exactly how Apply behaves.

> **Fixed 2026-08-19** — `fix_example` used to be hardcoded to `""` for every suggestion Module C returned (`app.py`'s `/analyze`), so the "Fix:" line under each card always rendered blank, and clicking Apply pushed an *empty string* into `skills.other` — the frontend has no empty-chip guard, so this silently created an invisible, zero-width pill with just an "×" button, while still showing a "Suggestion applied" success toast. It looked broken because it was: nothing visible happened, several cards at once, every single time. Fixed by adding `generate_recommendations_detailed()` in `utils/scoring.py`, which pairs each recommendation with the actual missing-skill name as `fix_example` (the plain-string `generate_recommendations()` used by `/analyze-cv`, `/compare-job`, and `build_demo.py` is untouched, so this didn't ripple elsewhere). The frontend's `handleApplySuggestion()` (§9.6) was also hardened to refuse to apply — and refuse to claim success — when `fix_example` is blank, as a backstop against this class of bug recurring.

### 9.4 GitHub Verification (on the Analysis page) vs. GitHub Project Validation

There are genuinely **three** separate GitHub-related things stored on a CV, and they used to collide before being split apart — worth being precise about which is which:

1. **Module C's `github_verified` field** — always an empty array. Module C has no GitHub feature and hard-codes `github_verified: []` in its `/analyze` response.
2. **`cvs.github_verified_skills`** — the DB column `analyzeCV()` writes `result.github_verified` into. Since (1) is always empty, this column is, in effect, always empty too — it exists mainly to preserve the shape for any future Module C GitHub feature.
3. **`cvs.github_api_verified_skills`** (migration `0031`) — the column that's actually populated with real data: written by `githubService.verifySkills()`, the **Skill page's** "Verify Skills" flow, which checks the language breakdown of your connected GitHub repos via the real GitHub API. This used to share column (2) with Module C's mock output — whichever wrote last silently won, with no way to tell which source produced what you were looking at. They're now separate columns with separate writers, and the CV page's "Extracted Skills" display **prefers `github_api_verified_skills`, falling back to `github_verified_skills`** only if the former is empty.

Separately again, the **"GitHub Project Validation" card** (`POST /api/cv/:id/verify-projects`, stored in `cvs.project_verification`) is a fourth, distinct feature: it cross-checks your CV's *Projects* section against your connected GitHub repos (do the projects you listed actually exist there?), not your skills. See the Skill Forecasting doc for more on `githubService` and its own known trust/correctness caveats (stale-verification-on-disconnect is now fixed — see that doc's §13).

### 9.5 "Compare With a Real Job Post" — a different engine

This panel (`POST /api/cv/:id/job-post` → Module C `/compare-job`) computes things independently of the Job Matches section above — don't compare its percentages to the bar chart's:

- **Top "skill match %"** — a **literal keyword overlap**: (skills found in both your CV and the pasted ad) ÷ (skills found in the ad). This is *not* the ML model — it's a much simpler set-intersection metric.
- **"closest role blueprint"** — whichever of the 24 curated roles shares the most skills with the pasted ad text. It's a best-effort proxy so the readiness model has something to score against; the job post itself never states this.
- **"readiness: Intermediate (54)"** — the *same* ML regression model used for Job Matches, now run against that closest-role blueprint, bucketed into a label: Advanced ≥80, Intermediate 50–79, Beginner <50 (`get_level()` in `utils/scoring.py`).
- **Percentile** under this card works exactly like §9.1, benchmarked against the closest role's historical distribution instead.
- **▲ / → / ▼ badges** next to some missing skills (e.g. "JavaScript ▲ rising") — Module A's live market-demand forecast for that specific missing skill (rising/stable/falling weekly demand). A gap without a badge means Module A couldn't be reached or had no data for that skill.
- **"AI-tailored summary" + Summary/Skills "Apply" cards** — Module D (an LLM) rewriting your summary and pointing out gaps tailored to the pasted ad's exact wording. A third engine again, separate from the ML scoring and the keyword overlap above.

### 9.6 The "Apply →" button, in general

"Apply" appears in three places on the CV page, and it behaves differently depending on which `section` the suggestion is tagged with (`frontend/.../cv/page.tsx`, `handleApplySuggestion()`):

| Suggestion's `section` | What Apply does |
|---|---|
| `skills` | Adds `fix_example` as a new entry in **Skills → Other** |
| `summary` | Appends `fix_example` to your summary text (or replaces it if empty) |
| `experience` | Appends `fix_example` as a new bullet on your **first** experience entry — does nothing if you have no experience entries yet |
| `projects` | Creates a new project titled "New Project" with `fix_example` as its description |
| anything else | Refused — there's no section to apply it to |

All three sources of "Apply" buttons funnel through this same function:
- **Improvement Suggestions** (Analysis page, §9.3) — always `section: "skills"`, from Module C's `/analyze`.
- **"Apply to Summary"** under the AI-tailored summary (§9.5) — always `section: "summary"`, `fix_example` is Module D's LLM-rewritten summary.
- **Summary/Skills suggestion cards** under the job-post comparison (§9.5) — `section` and `fix_example` both come from Module D's `/tailor-cv`; only rendered when `fix_example` is non-empty (that panel already guarded against the blank-fix_example bug described in §9.3 — it was `/analyze`'s Improvement Suggestions that didn't).

As of 2026-08-19, Apply shows an **error** toast instead of a false success one whenever there's genuinely nothing to apply (blank `fix_example`, an unrecognised section, or an experience-suggestion with no experience entries yet).

**A known rough edge that's *not* fixed**: for the job-post tailoring "Skills" card, `fix_example` is free-form LLM prose (e.g. *"Add Golang (Go) and Node.js to the skills list, as these are explicitly requested by the job posting."*), not a bare skill name — Apply pushes that whole sentence into Skills → Other as one entry rather than extracting "Golang" and "Node.js" as separate clean tags. Works, but untidy; you may want to manually clean up the Skills section after applying one of these.

---

## 10. The database tables it uses

| Table | What it stores | Key fields |
|-------|----------------|-----------|
| `cvs` | One row per CV | `id`, `user_id`, `title`, `github_url`, `linkedin_url`, `summary`, `match_score`, `bert_skills` (JSON), `github_verified_skills` (JSON, Module C's view), `github_api_verified_skills` (JSON, real-GitHub-API view — see §9.4), `percentile`, `percentile_label` (§9.1), `file_path`, `extracted_text`, `project_verification` (JSON) |
| `cv_sections` | The structured sections | `id`, `cv_id`, `section_type` (summary/experience/education/skills/projects), `content` (JSON), `order_index` |
| `cv_job_matches` | Ranked role matches from analysis | `id`, `cv_id`, `job_title`, `company`, `match_pct`, `skill_gaps` (JSON), `percentile`, `percentile_label` |
| `cv_suggestions` | Improvement suggestions | `id`, `cv_id`, `section_type`, `issue`, `fix_example`, `priority` |
| `cv_job_posts` | Pasted job ads + comparison results | `id`, `cv_id`, `title`, `job_text`, `comparison` (JSON), `tailoring` (JSON) |

**Where files live:** the actual uploaded file goes to **Supabase Storage** (bucket `cv-files`), not a table; the `cvs.file_path` column points to it. The backend hands out short-lived **signed URLs** (1 hour) so files are never public.

> Defined in `0013_cv.sql`, `0019_cv_file_path.sql` (adds `file_path`/`extracted_text`), `0023_cv_jobposts_and_verification.sql`, `0031_cv_github_api_verified.sql`, and `0032_cv_relative_evaluation.sql`.
>
> ⚠️ **Migration files here are not applied automatically** — there's no CI/CD step that runs them against the live database, so a file existing in this folder doesn't guarantee the column exists live. `cvs.ats_score` (from `0013_cv.sql`) is a confirmed example: the column was never actually created, which is why `cv.service.ts`'s `analyzeCV()` deliberately skips writing to it (see the code comment there) and it's omitted from the field list above. **Practical effect:** the ATS gauge you see right after clicking *Analyse* is real and freshly computed (Module C returns `ats_score` in every `/analyze` response) — it just isn't saved anywhere, so it reads as blank/zero again the next time you reopen that CV without re-analysing. `cvs.file_path` had the same problem until it was diagnosed and applied on 2026-08-19 (previously: uploads saved to Storage fine, but the DB write recording *where* silently failed, so a reopened CV showed the upload prompt again instead of the file). Before trusting a migration file reflects reality, verify against the live schema.

---

## 11. Validation: what gets checked

From `cv.validation.ts` and the upload middleware:

- **Create CV:** `title` defaults to "My CV"; `github_url`/`linkedin_url` must be valid URLs.
- **Update CV:** all optional; `ats_score`/`match_score` integers 0–100.
- **Sections:** each section's `section_type` must be one of the five allowed types; `content` is free-form JSON.
- **Analyse:** `file_url`/`github_url` optional strings.
- **File upload:** only `application/pdf`, `image/png`, `image/jpeg`, `text/plain` allowed; **max 10 MB**.

---

## 12. Error handling

| Situation | What happens | What the user sees |
|-----------|--------------|--------------------|
| Not logged in / no permission | Middleware blocks | 401 / 403 |
| Wrong file type or too big | Multer rejects | 400, "Unsupported file type…" |
| CV not yours / not found | Service throws | 404, "CV not found" |
| Storage upload fails | Service throws | 500 with the storage message |
| **Module D extraction fails** | File still saved; sections come back empty | You fill sections by hand |
| **Module C down** | `callPython` returns mock analysis, tagged `unavailable: true` and never persisted | UI works, shows sample score/matches behind an amber "not a real analysis" banner (§14) |
| **Corrupted/encrypted/unreadable file reaches Module C's own extractor** | Caught as `CVExtractionError`, returned as a clean `400` | A specific error message, never a raw 500/stack trace |
| Job post has no recognisable skills | Module C 422 surfaced | 422 with a clear message |
| Job-post document upload extraction is slow (Module D cold-starting OCR/LLM) | Backend now allows up to 300s (raised from 180s) and surfaces a real error instead of a silent empty result if Module D is genuinely unreachable | A clear "Could not extract text…" message rather than a confusing empty job description |
| Saving matches/suggestions fails | Logged, analysis still returned | You still see results |
| **CV row update fails after upload/analysis** | Now throws instead of failing silently — this is the fix for the CV-upload-reverts-to-upload-prompt bug (missing `file_path` write going unnoticed) | A clear error surfaces immediately instead of the file silently "disappearing" on next visit |

All errors return `{ success: false, message }`.

---

## 13. Security

- **Authentication:** valid login token on every route.
- **Authorization:** `cv:read` to view, `cv:write` to change/upload/analyse.
- **Data isolation:** every query filters by `user_id`; you can only touch your own CVs.
- **Private files:** uploads go to a **private** Storage bucket; the file is reached only through **time-limited signed URLs** (1 hour), never a public link.
- **Upload safety:** strict file-type allow-list + 10 MB limit guard against malicious or huge uploads.
- **Sensitive data:** CV content (a personal document) is kept private and only sent to the Python brains over local HTTP for processing.

---

## 14. What happens if the AI service is off

- If **Module C** (port 8003) isn't running when you click *Analyse*, the backend returns **mock data** — a fixed ATS score of 74 and sample matches like *Frontend Developer / Full-Stack Engineer / React Developer*. As of the mock-data fix, this response now carries an `unavailable: true` flag, and none of it is persisted to the database (the backend detects this by identity — `callPython` returns the exact same fallback object by reference — so mock data can never silently masquerade as a real, saved analysis). The CV page shows an explicit amber banner — *"Module C was unavailable — the results below are placeholder demo data, not a real analysis of this CV. Re-analyse once Module C is running."* — rather than presenting fake numbers as if they were real.
- If **Module D** (port 8004) is off when you *upload*, the file is still saved but the sections come back empty and you fill them in by hand.

> Things to know:
> - Module C now has **its own OCR pipeline** (EasyOCR + pdf2image, plus a local Ollama LLM structuring step — see §1) and can read scanned PDFs and PNG/JPG CVs on its own, independent of Module D. It's slow on CPU (a single scanned page takes roughly 45–80 seconds; a multi-page scan scales close to linearly) — the "Could not read text from this CV" message should now be rare, reserved for genuinely corrupted/empty/password-protected files rather than every image CV.
> - Module C must use **scikit-learn 1.6.1** (its model file was trained with that version); a newer version fails to load the model with a `_RemainderColsList` error.
> - `github_verified` always comes back **empty** from Module C — GitHub verification is the separate "Verify Projects"/"Verify Skills" features (§9.4).
> - Seeing the fixed mock results *with* the amber "unavailable" banner? Start Module C (`cd python-module-c/backend && ./venv/bin/python app.py`) and click *Analyse* again. Startup now warms the OCR reader and the local Ollama model before accepting requests, so the very first real upload isn't the one that pays that cold-start cost.

The mock data lives in `MOCK_CV_ANALYSIS` inside the backend CV service.

---

## 15. A real example, start to finish

Ishara uploads `ishara_cv.pdf`.

1. Frontend → `POST /api/cv/:id/upload` (multipart). Multer accepts the 1.2 MB PDF.
2. Backend saves it to Storage at `ishara-id/cv-id.pdf`, calls Module D `/extract-cv`, and fills her sections automatically.
3. Ishara reviews the sections, fixes one bullet, and clicks **Analyse CV**.
4. Backend gathers her CV text, makes a signed link, and calls Module C `/analyze`, which replies:

```json
{
  "ats_score": 74,
  "extracted_skills": [ { "name": "react", "proficiency_label": "Advanced", "confidence": 0.9 } ],
  "job_matches": [ { "title": "Frontend Developer", "match_pct": 88, "skill_gaps": ["Redux", "Jest"],
                      "percentile": 82, "percentile_label": "Scored higher than 82% of candidates for this role" } ],
  "suggestions": [ { "section": "skills", "issue": "Improve Redux because it is important for this role.", "fix_example": "Redux" } ]
}
```

5. Backend saves the score, skills, matches, and suggestions, computes a `match_score` from the top matches, and sends a notification: *"Your CV scored 74/100 ATS score with 1 job match found."* (The `ats_score` itself isn't saved to the `cvs` row — see the ⚠️ note in §10 — only `match_score`, skills, matches, and suggestions persist.)
6. On screen Ishara sees **ATS 74/100**, her skills (React genuinely required by Frontend Developer, so 90% confidence — §9.2), **Frontend Developer — 88% match, scored higher than 82% of historically-scored candidates for that role (missing Redux, Jest)**, and a suggestion card for Redux — clicking **Apply →** adds "Redux" to her Skills → Other list (§9.6).

---

## 16. Sequence diagram (text)

```
User      CV Page       Backend          Module D (:8004)   Module C (:8003)   Storage/DB
 │ upload    │             │                   │                  │              │
 │──────────►│ POST upload  │                   │                  │              │
 │           │────────────►│ Multer checks      │                  │              │
 │           │             │ save file ─────────────────────────────────────────►│ Storage
 │           │             │ POST /extract-cv ─►│                  │              │
 │           │             │◄───────────────────│ {text, sections} │              │
 │           │             │ save sections ─────────────────────────────────────►│ cv_sections
 │           │◄────────────│ sections shown     │                  │              │
 │ analyse   │             │                    │                  │              │
 │──────────►│ POST analyze │                   │                  │              │
 │           │────────────►│ gather text + signed URL              │              │
 │           │             │ POST /analyze ──────────────────────►│               │
 │           │             │◄──────────────────────────────────── │ {score,...}   │
 │           │             │ save results ──────────────────────────────────────►│ cvs/matches/suggestions
 │           │             │ notify ────────────────────────────────────────────►│ notifications
 │           │◄────────────│ { success, data }  │                  │              │
 │◄──────────│ ATS gauge + matches + suggestions │                  │             │
```

---

## 17. Where it lives in the code

- **Web page:** [frontend/src/app/(dashboard)/cv/page.tsx](../../frontend/src/app/(dashboard)/cv/page.tsx) — see `handleApplySuggestion()` for the Apply-button logic (§9.6)
- **Frontend → backend calls:** [frontend/src/services/cv.service.ts](../../frontend/src/services/cv.service.ts)
- **Backend address list (routes):** [backend/src/routes/cv.routes.ts](../../backend/src/routes/cv.routes.ts)
- **Backend request receiver (controller):** [backend/src/controllers/cv.controller.ts](../../backend/src/controllers/cv.controller.ts)
- **Backend logic (upload + analyse + compare):** [backend/src/services/cv.service.ts](../../backend/src/services/cv.service.ts) — see `uploadCV()`, `analyzeCV()`, `attachJobPost()`, `verifyProjects()`
- **Validation rules:** [backend/src/validations/cv.validation.ts](../../backend/src/validations/cv.validation.ts)
- **Upload guard:** [backend/src/middlewares/upload.middleware.ts](../../backend/src/middlewares/upload.middleware.ts)
- **The scoring brain:** [python-module-c/backend/app.py](../../python-module-c/backend/app.py) — `/analyze`, `/compare-job`; see `confidence_for()` (§9.2 fix), the `suggestions` block (§9.3 fix), and the OCR/LLM warm-up calls at startup
- **Module C's own OCR pipeline:** [python-module-c/backend/utils/ocr.py](../../python-module-c/backend/utils/ocr.py) (`EasyOCR` + `pdf2image`, quality-gated per-page fallback) and [python-module-c/backend/utils/llm_structurer.py](../../python-module-c/backend/utils/llm_structurer.py) (local-Ollama section structuring, regex fallback) — independent of Module D, see §1 and [`docs/cv-ocr-pipeline-implementation-plan.md`](../cv-ocr-pipeline-implementation-plan.md)
- **The relative-evaluation percentile:** [python-module-c/backend/utils/relative_eval.py](../../python-module-c/backend/utils/relative_eval.py) (`percentile_for_score`, `percentile_label`), built by [python-module-c/backend/build_score_distributions.py](../../python-module-c/backend/build_score_distributions.py) into `models/role_score_distributions.json`
- **The readiness-level scorer:** [python-module-c/backend/utils/scoring.py](../../python-module-c/backend/utils/scoring.py) — `get_level()`, `compare_cv_with_role()`, `normalize_skill()`/`display_skill()` (the casing pair behind the §9.2 fix), and `generate_recommendations_detailed()` — the structured (issue + fix_example) version used by `/analyze`; plain-string `generate_recommendations()` still exists unchanged for `/analyze-cv`, `/compare-job`, and `build_demo.py`
- **Model training & comparison (§9.1):** [python-module-c/backend/train.py](../../python-module-c/backend/train.py) (labels + baseline model), [python-module-c/backend/compare_models.py](../../python-module-c/backend/compare_models.py) (the 4-candidate comparison, saves `models/cv_job_score_model_v2.pkl` + `models/model_registry.json`) — full results in [`python-module-c/EVALUATION_SUMMARY.md`](../../python-module-c/EVALUATION_SUMMARY.md) and [`IMPROVEMENT_PLAN.md`](../../python-module-c/IMPROVEMENT_PLAN.md)
- **The text-reading brain:** [python-module-d/main.py](../../python-module-d/main.py) — `/extract-cv`, `/tailor-cv`
- **Database tables:** [0013_cv.sql](../../backend/supabase/migrations/0013_cv.sql), [0019_cv_file_path.sql](../../backend/supabase/migrations/0019_cv_file_path.sql), [0023_cv_jobposts_and_verification.sql](../../backend/supabase/migrations/0023_cv_jobposts_and_verification.sql), [0031_cv_github_api_verified.sql](../../backend/supabase/migrations/0031_cv_github_api_verified.sql) (real-GitHub-API verified skills, separate from Module C's `github_verified_skills`), [0032_cv_relative_evaluation.sql](../../backend/supabase/migrations/0032_cv_relative_evaluation.sql) (`percentile`/`percentile_label` columns)
