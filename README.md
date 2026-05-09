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
9. [Running Python Module D (Interview AI)](#9-running-python-module-d-interview-ai)
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
| **A** | Skill Forecaster | Analyses market trends and forecasts which skills will be in high demand over the next 3 months. Sends early-warning alerts for fast-rising or declining technologies. |
| **B** | Career Predictor | Takes a user's current skill set and predicts the most likely and most achievable career paths. Outputs role transition probabilities and recommended skill gaps to close. |
| **C** | CV Analyser | Parses uploaded CVs/resumes using BERT NLP, extracts skills, calculates an ATS (Applicant Tracking System) compatibility score, and matches the profile against live job listings. |
| **D** | Interview Simulator | Generates tailored interview questions using GitHub Models (GPT-4o mini). Accepts an uploaded document (job description, resume, notes) — EasyOCR extracts the text and the questions are generated around that context. Tracks emotion state during the session and analyses responses in real time. |

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
│               localhost:8080                                    │
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
| Python AI | FastAPI, EasyOCR, pypdf, pdf2image, Pillow, OpenAI SDK (GitHub Models endpoint) |
| AI Models | GitHub Models — GPT-4o mini via `https://models.inference.ai.azure.com` |

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
└── python-module-d/            # Interview AI microservice
    ├── main.py                 # FastAPI app (OCR + GitHub Models)
    └── requirements.txt        # Python dependencies
```

---

## 5. Prerequisites

Make sure you have the following installed:

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 20+ | Use nvm: `nvm use 20` |
| npm | 10+ | Comes with Node |
| Python | 3.10+ | 3.11 recommended |
| pip | latest | `pip install --upgrade pip` |
| poppler | any | Required by pdf2image for PDF→image conversion. Install with `brew install poppler` (macOS) or `apt install poppler-utils` (Ubuntu) |

---

## 6. Environment Variables

### Backend — `backend/.env`

Create this file before starting the backend:

```env
# Server
PORT=8080
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000

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
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/api
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

The API will be available at **http://localhost:8080**

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with nodemon (auto-restarts on file changes) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run compiled production build |
| `npm run type-check` | TypeScript type check without emitting |

**Health check endpoints:**

```
GET http://localhost:8080/api/health
GET http://localhost:8080/api/health/supabase
```

---

## 9. Running Python Module D (Interview AI)

Module D powers the interview simulator — it generates questions using GitHub Models and extracts text from uploaded documents using EasyOCR.

### Step 1 — Create a virtual environment

```bash
cd python-module-d
python3 -m venv venv
source venv/bin/activate          # macOS/Linux
# venv\Scripts\activate           # Windows
```

### Step 2 — Install dependencies

```bash
pip install -r requirements.txt
```

> **Note on EasyOCR first run:** The first time you call the `/extract-ocr` endpoint, EasyOCR will download its language model (~100MB). This is automatic — just allow it to complete.

### Step 3 — Set your GitHub token

```bash
export GITHUB_TOKEN=your_github_personal_access_token
```

### Step 4 — Start the service

```bash
python main.py
```

The service starts on **http://localhost:8004**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/generate-questions` | POST | Generate 5 interview questions (uses GitHub Models; falls back to hardcoded questions if `GITHUB_TOKEN` not set) |
| `/extract-ocr` | POST | Extract text from a base64-encoded PDF, PNG, JPG, or TXT file using EasyOCR |
| `/analyze-response` | POST | Score a candidate's answer and return feedback using GitHub Models |

> **No GitHub token?** The service still works — it returns sensible fallback questions and analysis scores. Set the token for full AI-powered functionality.

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
| GET | `/api/skills` | List all skills + trends |
| POST | `/api/skills/forecast` | Trigger ML forecast for a skill |
| GET | `/api/skills/early-warnings` | Get skills with fast-rising/declining trends |

### Career (Module B)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/career` | Get career predictions for current user |
| POST | `/api/career/predict` | Generate new career path prediction |

### CV (Module C)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cv` | List user CVs |
| POST | `/api/cv` | Add CV (pass `file_url`) |
| POST | `/api/cv/:id/analyse` | Trigger ATS analysis + job matching |

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

During a live session the UI simulates real-time emotion detection (Confident, Neutral, Nervous, Engaged, Confused). Each submitted response records the current emotion in the `emotion_data` JSONB column, which is included in the response analysis sent to Module D.

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

Open four terminal windows:

```bash
# Terminal 1 — Frontend
cd frontend && npm run dev

# Terminal 2 — Backend
cd backend && npm run dev

# Terminal 3 — Python Module D
cd python-module-d
source venv/bin/activate
export GITHUB_TOKEN=your_token
python main.py

# Terminal 4 — (optional) Supabase local
npx supabase start
```

### Typical request flow

```
Browser → Next.js (3000)
       → Axios → Express API (8080)  [auth check + validation]
              → Supabase              [data read/write]
              → Python Module D       [AI question generation / OCR]
              ← returns data
       ← JSON response
← rendered page
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
| Interview questions are generic (not AI-generated) | Set `GITHUB_TOKEN` env var before starting Module D |
| PDF upload returns empty text | The PDF is likely scanned — ensure `poppler` is installed for `pdf2image` to work |
| EasyOCR model download hangs | Allow it to complete on first run (~100MB download). Subsequent runs are instant. |
| 401 on all API requests | JWT has expired — log out and log back in |
| Python service shows `[Python] Service unreachable` in backend logs | The Python microservice is not running — start it or rely on mock fallback data |
