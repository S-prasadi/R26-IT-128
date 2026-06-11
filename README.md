# PathwayIQ — Skill Forecasting & Semantic Career Pathway Optimization Ecosystem

> **Project code:** R26-IT-128

PathwayIQ is a full-stack AI platform that helps professionals understand where their skills stand today, where the market is heading, and exactly how to get there. It combines real-time skill trend forecasting, AI-driven career path prediction, CV/resume intelligence, and an interactive interview simulator into one cohesive ecosystem.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Repository Structure](#4-repository-structure)
5. [Prerequisites](#5-prerequisites)
6. [Environment Variables](#6-environment-variables)
7. [Running the Frontend](#7-running-the-frontend)
8. [Running the Backend](#8-running-the-backend)
9. [Running the Python Microservices (Modules A, C, D)](#9-running-the-python-microservices-modules-a-c-d)
10. [Database Setup (Supabase)](#10-database-setup-supabase)
11. [API Reference](#11-api-reference)
12. [Feature Deep-Dives](#12-feature-deep-dives)
13. [Permissions & Roles](#13-permissions--roles)
14. [Development Workflow](#14-development-workflow)

---

## 1. Project Overview

PathwayIQ is built around **four AI modules**, each solving a distinct part of the career development problem:

| Module | Name | What it does |
|--------|------|-------------|
| **A** | Skill Forecaster | Analyses 2.5 years of weekly skill-demand data (Google Trends + job portals, global & Sri Lanka) and forecasts which skills will be in high demand over the next 12 weeks using ARIMA / Exponential Smoothing. Detects global→local lead-lag signals (CCF + Granger) and sends early-warning alerts for fast-rising technologies. **Integrated** (FastAPI, port 8001). |
| **B** | Career Predictor | Takes a user's current skill set and predicts the most likely and most achievable career paths. Outputs role transition probabilities and recommended skill gaps to close. *(Not yet wired — backend uses mock fallback.)* |
| **C** | CV Analyser | Parses uploaded CVs/resumes (PDF/DOCX/TXT), extracts skills via keyword matching, scores the CV against 24 job-role profiles with a pre-trained scikit-learn model, computes an ATS-quality score, and returns ranked role matches with missing-skill gaps and learning recommendations. **Integrated** (Flask, port 8003). |
| **D** | Interview Simulator | Generates tailored interview questions using GitHub Models (GPT-4o mini). Accepts an uploaded document (job description, resume, notes) — EasyOCR extracts the text and the questions are generated around that context. Tracks **real-time facial emotion** via webcam using a TensorFlow/Keras model (7 emotion classes mapped to interview states: Confident, Nervous, Confused, Stressed). Analyses responses in real time. Includes a standalone emotion detector UI at `/interview`. |

**Per-component documentation** (all features + how each component works):

- [frontend/README.md](frontend/README.md) — all pages and UI features
- [backend/README.md](backend/README.md) — API gateway, route groups, key flows
- [python-module-a/README.md](python-module-a/README.md) — Skill Forecasting Engine
- [python-module-c/README.md](python-module-c/README.md) — CV Job Analyzer
- [python-module-d/README.md](python-module-d/README.md) — Interview & Document Intelligence

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User (Browser)                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │  HTTPS
┌──────────────────────────▼──────────────────────────────────────┐
│               Frontend  (Next.js 16, React 19)                  │
│               localhost:3000                                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │  REST / JSON + Bearer JWT
┌──────────────────────────▼──────────────────────────────────────┐
│               Backend  (Express 5, TypeScript)                  │
│               localhost:8081                                    │
│                                                                 │
│   Auth · Users · Roles · Skills · Progress · Career ·          │
│   CV · Interviews · Notifications · Permissions                 │
└──────┬───────────────────────────────────────────┬─────────────┘
       │  Supabase SDK (service role)               │  HTTP POST (10 s timeout)
┌──────▼──────────┐                     ┌───────────▼──────────────────────────┐
│  Supabase       │                     │  Python Microservices                │
│  (PostgreSQL    │                     │                                      │
│  + Auth         │                     │  Module A :8001  Skill forecasting   │
│  + Storage)     │                     │  Module B :8002  Career prediction   │
│                 │                     │  Module C :8003  CV analysis         │
│                 │                     │  Module D :8004  Interview Q&A       │
└─────────────────┘                     └──────────────────────────────────────┘
```

The backend acts as the **orchestration layer** — it handles auth, data persistence, and business logic, then delegates all ML/AI work to the Python microservices. If a Python service is unreachable, the backend automatically falls back to sensible mock data so the rest of the application keeps working.

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4, Recharts, Sonner (toasts), Axios |
| Backend | Node.js, Express 5, TypeScript, Zod (validation), Jose (JWT), Multer (file upload) |
| Database | Supabase (PostgreSQL, Row Level Security, Auth, Storage) |
| Python AI (Module A) | FastAPI, Uvicorn, pandas, statsmodels (ARIMA/ES), scikit-learn, joblib, APScheduler |
| Python AI (Module C) | Flask, flask-cors, pandas, scikit-learn (**pinned 1.6.1**), joblib, PyPDF2, python-docx, dateparser, requests |
| Python AI (Module D) | FastAPI, Uvicorn, EasyOCR, pypdf, pdf2image, Pillow, OpenCV, NumPy, TensorFlow/Keras, OpenAI SDK (GitHub Models endpoint), Jinja2 |
| AI Models | GitHub Models — GPT-4o mini via `https://models.inference.ai.azure.com`; pre-trained Keras emotion model (7-class facial expression recognition); pre-trained scikit-learn CV-scoring regressor; ARIMA/Exponential-Smoothing skill-demand forecasts |

---

## 4. Repository Structure

```
.
├── frontend/                   # Next.js application
│   └── src/
│       ├── app/
│       │   ├── (dashboard)/    # Authenticated pages
│       │   │   ├── interview/  # Interview Simulator
│       │   │   ├── career/     # Career Predictor
│       │   │   ├── cv/         # CV Analyser
│       │   │   ├── skill/      # Skill Forecaster
│       │   │   ├── dashboard/  # Main dashboard
│       │   │   ├── profile/    # User profile
│       │   │   ├── progress/   # Progress tracker
│       │   │   ├── notifications/
│       │   │   ├── users/      # User management (admin)
│       │   │   └── roles/      # Role management (admin)
│       │   └── (auth)/         # Login / Register pages
│       ├── components/         # Shared UI components
│       ├── services/           # API client functions
│       ├── types/              # TypeScript type definitions
│       ├── lib/                # Axios client, utilities
│       └── config/             # Frontend env config
│
├── backend/                    # Express API server
│   └── src/
│       ├── controllers/        # Request handlers
│       ├── services/           # Business logic + Python bridge
│       ├── routes/             # Express route definitions
│       ├── middlewares/        # Auth, permissions, validation, upload
│       ├── validations/        # Zod schemas
│       ├── config/             # Supabase client, env config
│       ├── constants/          # HTTP status codes
│       ├── types/              # TypeScript types
│       └── utils/              # Response helpers
│   └── supabase/
│       └── migrations/         # SQL migration files (0001–0017)
│   └── api/
│       └── index.ts            # Entry point
│
├── python-module-a/            # Skill Forecaster microservice (FastAPI, :8001)
│   ├── api/app.py              # FastAPI app — forecasts, lead-lag, clusters, POST /forecast adapter
│   ├── model/                 # forecasting.py, lead_lag.py, clustering.py, pipeline.py
│   ├── scraping/              # dataset generation + weekly scraper
│   ├── data/                  # raw/processed/output CSVs + saved model artifacts
│   └── requirements.txt
│
├── python-module-c/            # CV Analyser microservice (Flask, :8003)
│   └── backend/
│       ├── app.py             # Flask app — /roles, /analyze-cv, POST /analyze adapter
│       ├── utils/             # cv_parser.py (text + skill extraction), scoring.py (features + recs)
│       ├── models/            # cv_job_score_model.pkl, job_role_profiles.json (24 roles)
│       └── requirements.txt
│
└── python-module-d/            # Interview AI microservice (FastAPI, :8004; merged from Component 4)
    ├── main.py                 # FastAPI app — Q&A, OCR, CV parsing, emotion detection
    ├── requirements.txt        # Python dependencies
    ├── models/                 # Pre-trained Keras emotion model
    │   ├── emotion_model.h5
    │   ├── emotion.weights.h5
    │   └── emotion_labels.json
    ├── templates/
    │   └── interview.html      # Standalone emotion detector UI
    └── notebooks/              # Model research notebooks
        ├── emotion_model_proposed_techs.ipynb
        └── emotion_model_base.ipynb
```

---

## 5. Prerequisites

Make sure you have the following installed:

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20+ | Use nvm: `nvm use 20` |
| npm | 10+ | Comes with Node |
| Python | 3.10+ | 3.13 tested and confirmed working |
| pip | latest | `pip install --upgrade pip` |
| poppler | any | Required by pdf2image for PDF→image conversion. Install with `brew install poppler` (macOS) or `apt install poppler-utils` (Ubuntu) |

---

## 6. Environment Variables

### Backend — `backend/.env`

Create this file before starting the backend (the actual `.env` in the repo uses `PORT=8081`):

```env
# Server
PORT=8081
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# Supabase (get these from your Supabase project dashboard)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_ISSUER=https://your-project.supabase.co/auth/v1
SUPABASE_JWKS_URL=https://your-project.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_JWT_AUDIENCE=authenticated

# Admin setup (used for initial seeding only)
ADMIN_SETUP_KEY=your-secret-setup-key

# Python microservice URLs (defaults shown — change if running on different ports)
PYTHON_MODULE_A_URL=http://localhost:8001
PYTHON_MODULE_B_URL=http://localhost:8002
PYTHON_MODULE_C_URL=http://localhost:8003
PYTHON_MODULE_D_URL=http://localhost:8004
```

### Frontend — `frontend/.env.local`

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8081/api
```

### Python Module D — environment variable (shell)

```bash
export GITHUB_TOKEN=your_github_personal_access_token
```

> **Getting a GitHub Token for Models:**
> 1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
> 2. Create a new token (classic) with no special scopes needed
> 3. GitHub Models (free tier) gives you access to GPT-4o mini, Llama 3, Mistral, and more

---

## 7. Running the Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available at **http://localhost:3000**

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot-reload |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run type-check` | Run TypeScript compiler check |

---

## 8. Running the Backend

```bash
cd backend
npm install
npm run dev
```

The API will be available at **http://localhost:8081**

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with nodemon (auto-restarts on file changes) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run compiled production build |
| `npm run type-check` | TypeScript type check without emitting |

**Health check endpoints:**

```
GET http://localhost:8081/api/health
GET http://localhost:8081/api/health/supabase
```

---

## 9. Running the Python Microservices (Modules A, C, D)

Each Python module is a standalone service with its **own** virtual environment. The backend reaches them over HTTP at the ports configured in `backend/.env` (A=8001, B=8002, C=8003, D=8004). If a service is down, the backend falls back to mock data — so you can run only the modules you need.

> All `venv/` directories are excluded from git via the repo-root `.gitignore`.

---

### 9.1 Module A — Skill Forecaster (FastAPI, port 8001)

Powers the **Skill page → Forecast tab**. Reads pre-computed forecast artifacts (`data/output/*.csv`, `data/models/*.pkl`) and serves them; the backend calls its `POST /forecast` endpoint.

```bash
cd python-module-a
python3 -m venv venv
source venv/bin/activate                 # Windows: venv\Scripts\activate
pip install --upgrade pip
# Minimal runtime — the API only reads CSV/pkl artifacts at request time:
pip install fastapi "uvicorn[standard]" pandas joblib apscheduler numpy pydantic
python api/app.py
```

Starts on **http://localhost:8001** (dashboard + `/docs`). Key endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/forecast` | POST | **Backend adapter** — `{ user_id, skills }` → `{ trending, early_warnings, forecast_chart }` |
| `/api/forecasts/top` | GET | Top-N skills by predicted demand |
| `/api/forecasts/all` | GET | All skills — trend + predicted/actual demand |
| `/api/lead-lag` | GET | Global→local lead-lag (CCF + Granger) |
| `/api/clusters`, `/api/bundles`, `/api/history/{skill}`, `/api/status` | GET | Supporting data |

> The full `requirements.txt` (statsmodels, scikit-learn, bertopic) is only needed to **re-train** via `train.py`; it is **not** required to serve forecasts.

---

### 9.2 Module C — CV Analyser (Flask, port 8003)

Powers the **CV page → Analyse step**. Parses an uploaded CV, scores it against 24 job-role profiles with a pre-trained scikit-learn model, and returns ranked matches + recommendations. The backend calls its `POST /analyze` endpoint.

```bash
cd python-module-c/backend
python3 -m venv venv
source venv/bin/activate                 # Windows: venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

Starts on **http://localhost:8003**. Key endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/analyze` | POST | **Backend adapter** — `{ cv_id, file_url, github_url }` → `{ extracted_skills, github_verified, ats_score, job_matches, suggestions }`. Downloads the CV from the signed URL, auto-ranks all roles. |
| `/analyze-cv` | POST | Native multipart endpoint (`cv_file` + `target_role`) used by Module C's own React UI |
| `/roles` | GET | List the 24 job-role profiles |

> **Important — scikit-learn version pin:** the model file `cv_job_score_model.pkl` was trained with **scikit-learn 1.6.1**. `requirements.txt` pins this version; installing a newer scikit-learn (e.g. 1.9.x) fails to unpickle the model with `Can't get attribute '_RemainderColsList'`.

> **What Module C does NOT provide:** GitHub-verified skills come back empty (`github_verified: []`) — GitHub verification is a separate feature. Job matches are **roles** (the `title`), with `company` set to a `"Market Estimate"` placeholder. Image CVs (PNG/JPG) can't be analysed (no OCR) — upload a text-based PDF/DOCX/TXT.

---

### 9.3 Module D — Interview AI (FastAPI, port 8004)

Module D is the consolidated Interview AI microservice. It was formed by merging the original Module D (Q&A, OCR, CV parsing) with Component 4 (real-time facial emotion detection). It now provides all interview-related AI functionality in a single FastAPI service on port 8004.

### Step 1 — Create a virtual environment

```bash
cd python-module-d
python3 -m venv venv
source venv/bin/activate          # macOS/Linux
# venv\Scripts\activate           # Windows
```

> The `venv/` directory is excluded from git via `.gitignore`.

### Step 2 — Install dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

**What gets installed:** FastAPI, Uvicorn, TensorFlow 2.x, EasyOCR (+ PyTorch), OpenCV, NumPy, pypdf, pdf2image, Pillow, OpenAI SDK, Pydantic, Jinja2, certifi. Total download is approximately 1–2 GB on first install.

> **Note on EasyOCR first run:** The first time you call `/extract-ocr`, EasyOCR downloads its language model (~100MB). This is automatic.

### Step 3 — Set your GitHub token

```bash
export GITHUB_TOKEN=your_github_personal_access_token
```

> **Getting a token:** Go to github.com/settings/tokens → create a classic token with no special scopes. GitHub Models (free tier) provides GPT-4o mini access.

### Step 4 — Start the service

```bash
python main.py
```

The service starts on **http://localhost:8004**

Expected startup output:
```
INFO module-d: Emotion model loaded: 7 classes
INFO:     Uvicorn running on http://0.0.0.0:8004
```

If you see `Emotion model loaded: 7 classes`, the Keras emotion detection model loaded successfully.

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/generate-questions` | POST | Generate 5 interview questions via GitHub Models (GPT-4o mini); falls back to hardcoded questions if `GITHUB_TOKEN` is unset |
| `/extract-ocr` | POST | Extract text from a base64-encoded PDF, PNG, JPG, or TXT file using EasyOCR with pypdf fallback |
| `/extract-cv` | POST | Extract and structure CV sections (experience, education, skills, projects) via OCR + GPT-4o mini |
| `/analyze-response` | POST | Score a candidate's answer (0–100), return feedback, engagement score, and emotion summary |
| `/interview` | GET | Serves the standalone real-time emotion detector HTML UI |
| `/predict` | POST | Accept a base64 JPEG frame, detect face (Haar Cascade), run Keras emotion model, return emotion label + interview state + per-class probabilities + bounding box |

FastAPI auto-docs are available at **http://localhost:8004/docs**

### Emotion Detection Model

The `/predict` endpoint uses a pre-trained Keras model (`models/emotion_model.h5`) trained on 48×48 grayscale face images. It classifies 7 raw emotions and maps them to interview states:

| Raw Emotion | Interview State |
|-------------|----------------|
| neutral, happy | Confident |
| fearful, surprised | Nervous |
| sad | Confused |
| angry, disgusted | Stressed |

### CORS

Module D has CORS fully open (`allow_origins=["*"]`) so the Next.js frontend can call `/predict` directly from the browser without proxying through the backend (necessary to keep video frame latency low).

> **No GitHub token?** The service still starts and serves all endpoints. `/generate-questions` and `/analyze-response` return sensible fallback data. Emotion detection via `/predict` works entirely offline — it does not use the GitHub Models API.

---

## 10. Database Setup (Supabase)

### Option A — Run migrations manually

From the Supabase SQL editor, run the migration files in order:

```
backend/supabase/migrations/0001_extensions.sql
backend/supabase/migrations/0002_profiles.sql
...
backend/supabase/migrations/0017_inapp_notifications.sql
```

### Option B — Supabase CLI

```bash
cd backend
npx supabase db push
```

### Migration overview

| File | Creates |
|------|---------|
| 0001 | PostgreSQL extensions (uuid-ossp, pgcrypto) |
| 0002 | `profiles` table |
| 0003–0005 | Roles, permissions, user_roles |
| 0006 | Auto-create profile trigger on auth.users insert |
| 0007 | `v_user_permissions` view |
| 0008 | Row Level Security policies |
| 0009 | Seed data (default roles: admin, user) |
| 0010 | `skills`, `skill_trends` tables |
| 0011 | `user_progress`, `milestones` tables |
| 0012 | `career_predictions`, `career_paths` tables |
| 0013 | `cvs`, `cv_skills`, `job_matches` tables |
| 0014 | `interview_sessions`, `interview_questions`, `interview_responses` tables |
| 0015–0017 | Notifications tables + new permissions |

---

## 11. API Reference

All endpoints require a `Authorization: Bearer <supabase-jwt>` header unless marked public.

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login (returns JWT) |
| GET | `/api/auth/me` | Get current user profile |

### Skills (Module A)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/skills` | List master skills catalog |
| GET | `/api/skills/user` | List the current user's skills |
| POST | `/api/skills/user` | Add a skill to the user's profile |
| POST | `/api/skills/forecast` | Run skill-demand forecast → **calls Module A `/forecast`** (returns `trending`, `early_warnings`, `forecast_chart`) |

### Career (Module B)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/career` | Get career predictions for current user |
| POST | `/api/career/predict` | Generate new career path prediction |

### CV (Module C)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cv` | List user CVs |
| GET | `/api/cv/:id` | Get a CV with sections, job matches, suggestions |
| POST | `/api/cv` | Create a CV |
| PATCH | `/api/cv/:id` | Update CV metadata |
| DELETE | `/api/cv/:id` | Delete a CV |
| PUT | `/api/cv/:id/sections` | Upsert structured sections |
| POST | `/api/cv/:id/upload` | Upload a CV file → **Module D `/extract-cv`** auto-fills sections |
| POST | `/api/cv/:id/analyze` | Run ATS analysis → **calls Module C `/analyze`** (skills, score, ranked role matches, suggestions) |

### Interviews (Module D)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/interviews` | List all sessions for current user |
| GET | `/api/interviews/:id` | Get session with questions + responses |
| POST | `/api/interviews/extract-document` | Upload document (PDF/image/txt) → returns extracted text |
| POST | `/api/interviews` | Start new session (pass `topic`, `difficulty`, optional `document_text`) |
| PATCH | `/api/interviews/:id` | End session (pass scores + duration) |
| POST | `/api/interviews/:id/responses` | Submit answer for a question |

### Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | List notifications |
| PATCH | `/api/notifications/:id/read` | Mark as read |

---

## 12. Feature Deep-Dives

### Skill Forecasting (Module A)

The **Skill page → Forecast tab** shows real, model-driven skill-demand forecasts.

```
1. User clicks "Run Forecast" (optionally with their tracked skills)
2. Frontend → POST /api/skills/forecast { skills }
3. Backend → POST http://localhost:8001/forecast { user_id, skills }
4. Module A reads forecasts.csv + lead_lag_analysis.csv and returns:
     - trending[]        skill, current_rank, forecast_3m, velocity, change_pct
     - early_warnings[]  skills trending globally before they hit the local market
     - forecast_chart[]  12-week predicted demand for the top skills
5. Backend turns each early_warning into a "Skill Alert" notification
6. Frontend renders trending cards, early-warning list, and charts
```

If `skills` is empty the top skills overall are returned. If Module A is down, the backend serves a mock forecast (React/TypeScript/Node…) so the UI still works.

### CV Analysis (Module C)

The **CV page → Analyse step** scores a CV against job roles.

```
1. User uploads a CV (PDF/PNG/JPG/TXT) → POST /api/cv/:id/upload
      → file saved to Supabase storage; Module D extracts the text/sections
2. User clicks "Analyse CV" → POST /api/cv/:id/analyze
3. Backend generates a 1-hour signed URL and → POST http://localhost:8003/analyze
      { cv_id, file_url, github_url }
4. Module C downloads the file, extracts skills, and scores the CV against all
   24 role profiles with its pre-trained model, returning:
     - extracted_skills[]  name, proficiency_label, confidence
     - ats_score           0–100 CV-quality score
     - job_matches[]       role title, match_pct, missing skill_gaps (ranked)
     - suggestions[]       skills to improve / learn
     - github_verified[]   empty (separate feature)
5. Backend stores results in cvs / cv_job_matches / cv_suggestions and sends a
   "CV Analysis Complete" notification
6. Frontend renders the ATS gauge, skills, role matches, and suggestions
```

If Module C is down, the backend serves a mock analysis so the UI still works.

### Interview Simulator — Document Upload Flow

The interview simulator supports uploading a document before starting a session. This enables highly personalised, context-aware questions.

**How it works:**

```
1. User opens the Setup step in the Interview page
2. User optionally uploads a PDF, image, or .txt file (max 10MB)
3. Frontend POSTs the file to POST /api/interviews/extract-document
4. Backend receives the file buffer via Multer and sends it (base64) to Module D /extract-ocr
5. Module D runs EasyOCR on images; uses pypdf for text-layer PDFs
6. Extracted text is returned and shown as a preview in the UI
7. User clicks "Start Interview"
8. Frontend sends createSession with document_text included
9. Backend passes document_text to Module D /generate-questions
10. Module D uses GitHub Models (GPT-4o mini) to generate 5 questions tailored to the document
11. Questions are stored in the database and returned to the frontend
```

If no document is uploaded, the system falls back to generic topic-based questions — the existing behaviour is completely preserved.

### Emotion Tracking

During a live session the frontend activates the webcam and sends frames at ~5 fps to `POST http://localhost:8004/predict`. The response includes the detected emotion state (`Confident`, `Nervous`, `Confused`, `Stressed`), which is mapped to the UI's emotion labels and updates the live indicator in real time.

**Flow:**
```
Browser (Next.js interview page)
  → getUserMedia()          captures webcam stream
  → canvas.toDataURL()      converts frame to base64 JPEG
  → POST /predict           sends to Module D directly (not through the backend)
  ← { face, interview_state, confidence, probs, bbox }
  → setCurrentEmotion()     updates the emotion chip in the UI
```

If the camera is unavailable or `/predict` fails, the UI silently falls back and the emotion chip shows the last known state. Each submitted response records `{ dominant: currentEmotion, captured_at: timestamp }` in the `emotion_data` JSONB column, which is forwarded to Module D's `/analyze-response` for context-aware scoring.

The standalone emotion detector UI (ported from the original Component 4) is accessible directly at **http://localhost:8004/interview** and can be used independently for testing.

### Scoring & Feedback

After each answer is submitted:
- Module D analyses the response text + emotion context
- Returns a `score` (0–100), `feedback` string, `engagement_score`, and `emotion_summary`
- These are stored in `interview_responses` and displayed immediately in the UI
- At session end, overall and engagement scores are calculated and stored against the session

---

## 13. Permissions & Roles

The system uses a roles-and-permissions model seeded into the database.

**Default roles:** `admin`, `user`

**Permission namespaces:**

| Namespace | Actions |
|-----------|---------|
| `interviews` | `read`, `write` |
| `skills` | `read`, `write` |
| `career` | `read`, `write` |
| `cv` | `read`, `write` |
| `users` | `read`, `write` |
| `roles` | `read`, `write` |
| `notifications` | `read`, `write` |
| `progress` | `read` |

All API routes check permissions via the `requirePermission()` middleware before processing requests.

---

## 14. Development Workflow

### Running everything locally

Start the Python services first (the backend calls them), then the backend, then the frontend. Each Python service runs in its own terminal with its own venv:

```bash
# Terminal 1 — Module A (Skill Forecaster, :8001)
cd python-module-a && source venv/bin/activate && python api/app.py

# Terminal 2 — Module C (CV Analyser, :8003)
cd python-module-c/backend && source venv/bin/activate && python app.py

# Terminal 3 — Module D (Interview AI, :8004)
cd python-module-d && source venv/bin/activate
export GITHUB_TOKEN=your_token    # optional — enables full AI responses
python main.py
# Expected: "Emotion model loaded: 7 classes" then "Uvicorn running on http://0.0.0.0:8004"

# Terminal 4 — Backend (:8081)
cd backend && npm run dev

# Terminal 5 — Frontend (:3000)
cd frontend && npm run dev

# Terminal 6 — (optional) Supabase local
npx supabase start
```

> Module B is not yet wired — the backend serves mock career data until it is. Any Python service you skip simply falls back to mock data.

### Typical request flow

```
Browser → Next.js (3000)
       → Axios → Express API (8081)  [auth check + validation]
              → Supabase              [data read/write]
              → Python Module D       [AI question generation / OCR / CV parsing / response analysis]
              ← returns data
       ← JSON response
← rendered page

Browser → POST http://localhost:8004/predict  [webcam frames for emotion detection — direct, bypasses backend]
        ← { interview_state, confidence, probs, bbox }
```

### Adding a new Python module

1. Create a new FastAPI service (e.g. `python-module-e/main.py`) running on a new port
2. Add the URL to `backend/.env` as `PYTHON_MODULE_E_URL=http://localhost:8005`
3. Add it to `backend/src/config/env.ts` under `python`
4. Add `moduleE: () => env.python.moduleEUrl` to `pythonUrls` in `backend/src/services/python.service.ts`
5. Call it from any service using `callPython(pythonUrls.moduleE() + "/endpoint", body, fallback)`

### TypeScript checks

```bash
# Backend
cd backend && npm run type-check

# Frontend
cd frontend && npm run type-check
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Backend crashes on start | Check all required env vars are set in `backend/.env` |
| `Missing required environment variable` error | Ensure `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWKS_URL` are all in `.env` |
| Frontend API calls fail with 404 / no response | Ensure `NEXT_PUBLIC_API_BASE_URL=http://localhost:8081/api` in `frontend/.env.local` (port 8081, not 8080) |
| Interview questions are generic (not AI-generated) | Set `GITHUB_TOKEN` env var before starting Module D |
| PDF upload returns empty text | The PDF is likely scanned — ensure `poppler` is installed for `pdf2image` to work |
| EasyOCR model download hangs | Allow it to complete on first run (~100MB download). Subsequent runs are instant. |
| 401 on all API requests | JWT has expired — log out and log back in |
| Python service shows `[Python] Service unreachable` in backend logs | The Python microservice is not running — start it or rely on mock fallback data |
| Module D startup shows `emotion_model.h5 not found` | Verify `python-module-d/models/` directory contains `emotion_model.h5`, `emotion.weights.h5`, `emotion_labels.json` |
| Webcam does not activate in the interview page | Browser must be on `http://` (not `file://`) and camera permission must be granted. Check the browser console for `getUserMedia` errors. |
| `/predict` returns CORS error in browser console | Ensure Module D is running — the CORS middleware is registered in `main.py`. Restart the service if it was running before the CORS change was applied. |
| `pip install` takes very long or fails on TensorFlow | TensorFlow + PyTorch (easyocr dependency) are ~1–2 GB total. Ensure a stable internet connection and at least 3 GB free disk space. |
| Port 8001/8003/8004 already in use | Run `lsof -ti:<port> \| xargs kill -9` to free the port, then restart the service. |
| Module C fails to start with `Can't get attribute '_RemainderColsList'` | scikit-learn version mismatch — the model needs **1.6.1**. Run `pip install "scikit-learn==1.6.1"` in `python-module-c/backend/venv`. |
| CV analysis returns "Could not read text from this CV" | The file is an image (PNG/JPG) or a scanned PDF — Module C has no OCR. Upload a text-based PDF, DOCX, or TXT. |
| GitHub-verified skills section is empty on the CV page | Expected — Module C does not produce GitHub verification; that is a separate feature. |
| Skill forecast / CV analysis shows obviously fake data (React/TypeScript/Node mock) | The corresponding Python module (A on :8001 / C on :8003) is not running — start it. |
| Skill/CV data didn't update after starting the module | No backend restart needed (URLs are read per request) — just click Run Forecast / Analyse again. |
