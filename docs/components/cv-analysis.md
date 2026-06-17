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
9. [The database tables it uses](#9-the-database-tables-it-uses)
10. [Validation: what gets checked](#10-validation-what-gets-checked)
11. [Error handling](#11-error-handling)
12. [Security](#12-security)
13. [What happens if the AI service is off](#13-what-happens-if-the-ai-service-is-off)
14. [A real example, start to finish](#14-a-real-example-start-to-finish)
15. [Sequence diagram (text)](#15-sequence-diagram-text)
16. [Where it lives in the code](#16-where-it-lives-in-the-code)

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
- **Module C** does the scoring at analyse time (it does *not* have OCR — that's why Module D reads the text first).

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

**Successful response** (shortened):

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "ats_score": 74,
    "extracted_skills": [
      { "name": "React", "proficiency_label": "Advanced", "confidence": 0.92 }
    ],
    "job_matches": [
      { "title": "Frontend Developer", "company": "Market Estimate", "match_pct": 88, "skill_gaps": ["Redux", "Jest"] }
    ],
    "suggestions": [
      { "section": "experience", "issue": "Action verbs are weak",
        "fix_example": "Replace 'worked on' with 'engineered', 'delivered'" }
    ],
    "github_verified": []
  }
}
```

**Error response** (e.g. uploading an unsupported file type):

```json
{ "success": false, "message": "Unsupported file type. Upload a PDF, PNG, JPG, or TXT file." }
```

---

## 9. The database tables it uses

| Table | What it stores | Key fields |
|-------|----------------|-----------|
| `cvs` | One row per CV | `id`, `user_id`, `title`, `github_url`, `linkedin_url`, `summary`, `ats_score`, `match_score`, `bert_skills` (JSON), `github_verified_skills` (JSON), `file_path`, `extracted_text`, `project_verification` (JSON) |
| `cv_sections` | The structured sections | `id`, `cv_id`, `section_type` (summary/experience/education/skills/projects), `content` (JSON), `order_index` |
| `cv_job_matches` | Ranked role matches from analysis | `id`, `cv_id`, `job_title`, `company`, `match_pct`, `skill_gaps` (JSON) |
| `cv_suggestions` | Improvement suggestions | `id`, `cv_id`, `section_type`, `issue`, `fix_example`, `priority` |
| `cv_job_posts` | Pasted job ads + comparison results | `id`, `cv_id`, `title`, `job_text`, `comparison` (JSON), `tailoring` (JSON) |

**Where files live:** the actual uploaded file goes to **Supabase Storage** (bucket `cv-files`), not a table; the `cvs.file_path` column points to it. The backend hands out short-lived **signed URLs** (1 hour) so files are never public.

> Defined in `0013_cv.sql`, `0019_cv_file_path.sql` (adds `file_path`/`extracted_text`), and `0023_cv_jobposts_and_verification.sql`.

---

## 10. Validation: what gets checked

From `cv.validation.ts` and the upload middleware:

- **Create CV:** `title` defaults to "My CV"; `github_url`/`linkedin_url` must be valid URLs.
- **Update CV:** all optional; `ats_score`/`match_score` integers 0–100.
- **Sections:** each section's `section_type` must be one of the five allowed types; `content` is free-form JSON.
- **Analyse:** `file_url`/`github_url` optional strings.
- **File upload:** only `application/pdf`, `image/png`, `image/jpeg`, `text/plain` allowed; **max 10 MB**.

---

## 11. Error handling

| Situation | What happens | What the user sees |
|-----------|--------------|--------------------|
| Not logged in / no permission | Middleware blocks | 401 / 403 |
| Wrong file type or too big | Multer rejects | 400, "Unsupported file type…" |
| CV not yours / not found | Service throws | 404, "CV not found" |
| Storage upload fails | Service throws | 500 with the storage message |
| **Module D extraction fails** | File still saved; sections come back empty | You fill sections by hand |
| **Module C down** | `callPython` returns mock analysis | UI works, shows sample score/matches |
| Job post has no recognisable skills | Module C 422 surfaced | 422 with a clear message |
| Saving matches/suggestions fails | Logged, analysis still returned | You still see results |

All errors return `{ success: false, message }`.

---

## 12. Security

- **Authentication:** valid login token on every route.
- **Authorization:** `cv:read` to view, `cv:write` to change/upload/analyse.
- **Data isolation:** every query filters by `user_id`; you can only touch your own CVs.
- **Private files:** uploads go to a **private** Storage bucket; the file is reached only through **time-limited signed URLs** (1 hour), never a public link.
- **Upload safety:** strict file-type allow-list + 10 MB limit guard against malicious or huge uploads.
- **Sensitive data:** CV content (a personal document) is kept private and only sent to the Python brains over local HTTP for processing.

---

## 13. What happens if the AI service is off

- If **Module C** (port 8003) isn't running when you click *Analyse*, the backend returns **mock data** — a fixed ATS score of 74 and sample matches like *Frontend Developer / Full-Stack Engineer / React Developer*.
- If **Module D** (port 8004) is off when you *upload*, the file is still saved but the sections come back empty and you fill them in by hand.

> Things to know:
> - Module C has **no OCR** — it can't read image CVs (PNG/JPG) on its own. That's why Module D reads the text first at upload time.
> - Module C must use **scikit-learn 1.6.1** (its model file was trained with that version); a newer version fails to load the model with a `_RemainderColsList` error.
> - `github_verified` always comes back **empty** from Module C — GitHub verification is the separate "Verify Projects" feature.
> - Seeing the fixed mock results? Start Module C (`cd python-module-c/backend && python app.py`) and click *Analyse* again.

The mock data lives in `MOCK_CV_ANALYSIS` inside the backend CV service.

---

## 14. A real example, start to finish

Ishara uploads `ishara_cv.pdf`.

1. Frontend → `POST /api/cv/:id/upload` (multipart). Multer accepts the 1.2 MB PDF.
2. Backend saves it to Storage at `ishara-id/cv-id.pdf`, calls Module D `/extract-cv`, and fills her sections automatically.
3. Ishara reviews the sections, fixes one bullet, and clicks **Analyse CV**.
4. Backend gathers her CV text, makes a signed link, and calls Module C `/analyze`, which replies:

```json
{
  "ats_score": 74,
  "extracted_skills": [ { "name": "React", "proficiency_label": "Advanced", "confidence": 0.92 } ],
  "job_matches": [ { "title": "Frontend Developer", "match_pct": 88, "skill_gaps": ["Redux", "Jest"] } ],
  "suggestions": [ { "section": "experience", "issue": "Action verbs are weak", "fix_example": "Use 'engineered', 'delivered'" } ]
}
```

5. Backend saves the score, skills, matches, and suggestions, computes a `match_score` from the top matches, and sends a notification: *"Your CV scored 74/100 ATS score with 1 job match found."*
6. On screen Ishara sees **ATS 74/100**, her skills, **Frontend Developer — 88% match (missing Redux, Jest)**, and a tip to strengthen her experience section.

---

## 15. Sequence diagram (text)

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

## 16. Where it lives in the code

- **Web page:** [frontend/src/app/(dashboard)/cv/page.tsx](../../frontend/src/app/(dashboard)/cv/page.tsx)
- **Frontend → backend calls:** [frontend/src/services/cv.service.ts](../../frontend/src/services/cv.service.ts)
- **Backend address list (routes):** [backend/src/routes/cv.routes.ts](../../backend/src/routes/cv.routes.ts)
- **Backend request receiver (controller):** [backend/src/controllers/cv.controller.ts](../../backend/src/controllers/cv.controller.ts)
- **Backend logic (upload + analyse + compare):** [backend/src/services/cv.service.ts](../../backend/src/services/cv.service.ts) — see `uploadCV()`, `analyzeCV()`, `attachJobPost()`, `verifyProjects()`
- **Validation rules:** [backend/src/validations/cv.validation.ts](../../backend/src/validations/cv.validation.ts)
- **Upload guard:** [backend/src/middlewares/upload.middleware.ts](../../backend/src/middlewares/upload.middleware.ts)
- **The scoring brain:** [python-module-c/backend/app.py](../../python-module-c/backend/app.py) — `/analyze`, `/compare-job`
- **The text-reading brain:** [python-module-d/main.py](../../python-module-d/main.py) — `/extract-cv`, `/tailor-cv`
- **Database tables:** [0013_cv.sql](../../backend/supabase/migrations/0013_cv.sql), [0019_cv_file_path.sql](../../backend/supabase/migrations/0019_cv_file_path.sql), [0023_cv_jobposts_and_verification.sql](../../backend/supabase/migrations/0023_cv_jobposts_and_verification.sql)
