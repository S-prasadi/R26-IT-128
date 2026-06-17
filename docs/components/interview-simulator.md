# Interview Simulator (Module D)

> *"Can I practise for interviews?"*
> The Interview Simulator generates tailored interview questions with AI, scores each answer you give, and — using your webcam — reads your **facial emotion** in real time to tell you whether you look confident, nervous, confused, or stressed.

New here? Read [the project overview](00-project-overview.md) first. This document zooms into just the Interview module.

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
14. [The emotion detection model](#14-the-emotion-detection-model)
15. [A real example, start to finish](#15-a-real-example-start-to-finish)
16. [Sequence diagram (text)](#16-sequence-diagram-text)
17. [Where it lives in the code](#17-where-it-lives-in-the-code)

---

## 1. What this module does

The user starts a practice interview on a topic (say "React") at a chosen difficulty. Module D then:

- **generates 5 interview questions** using an AI model (GPT-4o mini via GitHub Models),
- can **read an uploaded document** (a job description or resume) and build the questions around it,
- **scores each answer** out of 100 with written feedback and an engagement score, and
- watches the **webcam** to detect the user's emotion live, mapping facial expressions to four interview states (Confident, Nervous, Confused, Stressed).

It is the only module the browser sometimes talks to **directly** — for the webcam frames — so the live emotion stays fast and smooth (going through the backend would add too much delay for ~5 frames per second).

---

## 2. Feature list

| Feature | What you do | What you see |
|---------|-------------|--------------|
| **Upload a document** | Upload a job ad/resume (PDF/image/txt) before starting | A text preview, used to tailor questions |
| **Start a session** | Pick a topic + difficulty (1–5), click Start | 5 AI-generated questions |
| **Tailored questions** | Start with a document attached | Questions built around that document |
| **Answer a question** | Type/record your answer, submit | Instant score (0–100), feedback, engagement score |
| **Live emotion** | Allow the webcam during the session | A chip showing Confident / Nervous / Confused / Stressed |
| **Finish the session** | End the interview | Overall + engagement score saved |
| **Review history** | Open a past session | Questions, your answers, and the scores |

---

## 3. The journey of your data (step by step)

**Optional — upload a document first** (`POST /api/interviews/extract-document`):

1. You upload a job description or resume. Multer checks the type and size (max 10 MB). The backend base64-encodes it and sends it to Module D's `/extract-ocr`, which reads the text and returns it as a preview.

**Starting the interview** (`POST /api/interviews`):

2. **You click "Start Interview."** The page sends `{ topic, difficulty, skills?, document_text? }`.
3. **The backend checks login + permission** (`interviews:write`) and validates the body. (The `document_text` is trimmed to 10,000 characters.)
4. **The backend creates a session row** in `interview_sessions` with status `in_progress`.
5. **The backend asks Module D for questions** at `http://localhost:8004/generate-questions`, passing the topic, difficulty, skills, and document text.
6. **Module D generates 5 questions** with GPT-4o mini (tailored to the document if one was given). The backend **saves them** to `interview_questions` and returns the session + questions.

**Answering a question** (`POST /api/interviews/:id/responses`):

7. **You type/record an answer.** Meanwhile, throughout the session, the page has been sending webcam frames straight to Module D's `/predict` to track your emotion live.
8. **The page submits your answer** plus the current emotion to the backend.
9. **The backend verifies** the question belongs to this session (and the session is yours).
10. **The backend asks Module D to score it** via `/analyze-response`, sending your answer text and emotion data.
11. **Module D returns** a score, feedback, engagement score, and an emotion summary. The backend saves the response (inserting, or updating if you re-answer) and returns it.

**Ending the session** (`PATCH /api/interviews/:id`):

12. The page sends the overall score, engagement score, and duration; the backend marks the session `completed` and saves the totals.

---

## 4. How the pieces talk (diagram)

```
START:
You ─ "Start Interview" ─► Interview page ─ POST /api/interviews ─► Backend
                                                                      │ create session (DB)
                                                                      │ POST :8004/generate-questions ─► Module D
                                                                      │ save 5 questions (DB)
                                                                      ▼
You ◄──────────────────────────────────────────────── 5 questions appear

LIVE EMOTION (direct — does NOT go through the backend):
Browser webcam ─ frame as base64 JPEG ─ POST http://localhost:8004/predict ─► Module D
              ◄─ { face, interview_state, confidence, probs, bbox } ─ chip updates ~5×/sec

ANSWER:
You ─ submit answer + emotion ─► Backend ─ POST :8004/analyze-response ─► Module D
                                          ◄─ { score, feedback, engagement, emotion_summary }
                                          save response (DB)
You ◄──────────────────── score + feedback shown instantly
```

The webcam path going **straight to Module D** (not through the backend) is what keeps the live emotion smooth. Module D allows this with fully-open CORS for that endpoint.

---

## 5. Frontend side

- **The page:** `frontend/src/app/(dashboard)/interview/page.tsx` — a Setup step (topic, difficulty, optional document upload), the live interview step (current question, answer box, webcam + emotion chip), and a results/review view.
- **Webcam handling:** the page uses `getUserMedia()` to capture video, draws each frame to a hidden `<canvas>`, converts it to a base64 JPEG, and POSTs it to Module D's `/predict` about 5 times per second. The returned `interview_state` updates the emotion chip.
- **State management:** React state holds the session, the list of questions, the current question index, each answer + its score, the live emotion, and a timer for the session duration.
- **API calls:** through `frontend/src/services/interview.service.ts` — list/get sessions, extract a document, create a session, submit a response, end a session. (The `/predict` call is a direct fetch to Module D, not through this service.)

---

## 6. Backend side

Chain: **route → controller → service → (DB + Module D)**.

The service (`interview.service.ts`) functions:

- `listSessions()` — all of the user's sessions.
- `getSession()` — one session with its questions, each joined to its response.
- `createSession()` — create the session row, call **Module D** `/generate-questions`, save the 5 questions.
- `extractDocumentText()` — send an uploaded document to **Module D** `/extract-ocr`, return the text.
- `submitResponse()` — verify the question belongs to the session, call **Module D** `/analyze-response`, then insert or update the response (re-answering overwrites the previous one).
- `endSession()` — mark the session completed and store the final scores + duration.

---

## 7. Routes and endpoints

All under `/api/interviews`, all require a valid login token.

| Method | Path | What it does | Permission |
|--------|------|--------------|------------|
| GET | `/api/interviews` | List the user's sessions | `interviews:read` |
| GET | `/api/interviews/:id` | Get one session with questions + responses | `interviews:read` |
| POST | `/api/interviews/extract-document` | Upload a doc → extracted text (Module D OCR) | `interviews:write` |
| **POST** | **`/api/interviews`** | **Start a session (Module D generates questions)** | `interviews:write` |
| PATCH | `/api/interviews/:id` | End a session (save final scores) | `interviews:write` |
| **POST** | **`/api/interviews/:id/responses`** | **Submit an answer (Module D scores it)** | `interviews:write` |

**Module D endpoints** — through the backend: `/generate-questions`, `/extract-ocr`, `/analyze-response`. **Direct from the browser:** `POST http://localhost:8004/predict` (webcam frames). Module D also serves a standalone emotion-detector UI at `http://localhost:8004/interview` for testing.

---

## 8. What you send and what you get back (examples)

**Request** — `POST /api/interviews`

```json
{
  "topic": "React",
  "difficulty": 3,
  "skills": ["React", "TypeScript"],
  "document_text": "We are hiring a frontend engineer with React + Redux experience..."
}
```

**Successful response** (shortened):

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": "session-uuid",
    "topic": "React",
    "difficulty": 3,
    "status": "in_progress",
    "questions": [
      { "id": "q1-uuid", "question_text": "Explain how React reconciliation works.", "question_type": "technical", "difficulty": 3, "order_index": 0 }
    ]
  }
}
```

**Submit-answer response** — `POST /api/interviews/:id/responses`:

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": "response-uuid",
    "question_id": "q1-uuid",
    "score": 72,
    "feedback": "Good understanding demonstrated. Be more specific with concrete examples.",
    "engagement_score": 68,
    "emotion_data": { "dominant": "Confident", "summary": { "dominant": "Confident" } }
  }
}
```

**The direct `/predict` reply** (browser ↔ Module D):

```json
{ "face": true, "interview_state": "Confident", "confidence": 0.81, "bbox": [120, 80, 200, 200] }
```

**Error response** (e.g. submitting to a question that isn't in this session):

```json
{ "success": false, "message": "Question not found for this session" }
```

---

## 9. The database tables it uses

| Table | What it stores | Key fields |
|-------|----------------|-----------|
| `interview_sessions` | One row per practice interview | `id`, `user_id`, `topic`, `difficulty` (1–5), `status` (pending/in_progress/completed), `duration_seconds`, `overall_score`, `engagement_score`, `started_at`, `ended_at` |
| `interview_questions` | The 5 generated questions per session | `id`, `session_id`, `question_text`, `question_type` (behavioral/technical/situational), `difficulty`, `order_index` |
| `interview_responses` | The user's answer + scoring per question | `id`, `question_id`, `response_text`, `score`, `feedback`, `engagement_score`, `emotion_data` (JSON) |

**CRUD performed:** create/read/update on `interview_sessions`; create/read on `interview_questions`; create/update/read on `interview_responses`. The `emotion_data` column stores the live emotion captured during the answer plus the summary from Module D.

> Defined in `0014_interviews.sql`; the `score`/`engagement_score` analysis fields are added in `0021_interview_response_analysis.sql`.

---

## 10. Validation: what gets checked

From `interview.validation.ts` and the upload middleware:

- **Create session:** `topic` required; `difficulty` integer 1–5 (default 3); `skills` optional array; `document_text` optional and **auto-trimmed to 10,000 characters**.
- **End session:** `overall_score`/`engagement_score` numbers 0–100; `duration_seconds` non-negative integer.
- **Submit response:** `question_id` must be a UUID; `response_text` optional; `emotion_data` optional free-form JSON.
- **Document upload:** PDF/PNG/JPG/TXT only, max 10 MB.

---

## 11. Error handling

| Situation | What happens | What the user sees |
|-----------|--------------|--------------------|
| Not logged in / no permission | Middleware blocks | 401 / 403 |
| Invalid body | Validation blocks | 400 with the message |
| Session not yours / not found | Service throws | 404, "Session not found" |
| Question not in this session | Service throws | 404, "Question not found for this session" |
| **Module D down (start)** | Mock questions used | Interview still works, generic questions |
| **Module D down (scoring)** | Mock score (72) used | You still get a score + feedback |
| **`/predict` fails / no camera** | Emotion chip keeps last value | Interview continues normally |
| Wrong file type/size on upload | Multer rejects | 400, "Unsupported file type…" |

All errors return `{ success: false, message }`.

---

## 12. Security

- **Authentication:** valid login token on every `/api/interviews` route.
- **Authorization:** `interviews:read` to view, `interviews:write` to create/answer/end.
- **Data isolation:** sessions and responses are filtered by `user_id`; `submitResponse()` double-checks the question belongs to *your* session before saving.
- **The direct webcam call:** `/predict` runs offline on the user's machine — frames go to the local Module D only, not stored, used purely for the live chip. Module D opens CORS for this to allow the browser call.
- **Document size guard:** `document_text` is capped at 10,000 characters before being sent to the AI, and uploads are capped at 10 MB.
- **Input safety:** Zod validation + parameterised Supabase queries.

---

## 13. What happens if the AI service is off

Module D is unusually robust:

- If **Module D is off** when starting, the backend returns **mock questions** built from your topic (e.g. *"Explain your experience with React development."*).
- If it's off when scoring, you get a **mock score of 72** with generic feedback.
- The **live emotion** (`/predict`) is a direct browser call — if Module D is off or the camera is blocked, the chip just keeps its last value and the app carries on.
- **No GitHub token?** Module D still runs; it returns sensible fallback questions/feedback. Emotion detection works fully offline (it doesn't use the GitHub Models API at all).

The mock data lives in `mockQuestions()` and `MOCK_RESPONSE_ANALYSIS` inside the backend interview service.

> Tip: if questions look generic (not tailored), Module D's `GITHUB_TOKEN` probably isn't set. If the webcam chip never changes, check the browser gave camera permission and the page is on `http://` (not a `file://` path).

---

## 14. The emotion detection model

The `/predict` endpoint uses a pre-trained **Keras** model (`models/emotion_model.h5`) trained on 48×48 grayscale face images. It finds the face with a Haar Cascade, classifies **7 raw emotions**, and maps them to the four interview states the UI shows:

| Raw emotion | Interview state |
|-------------|-----------------|
| neutral, happy | **Confident** |
| fearful, surprised | **Nervous** |
| sad | **Confused** |
| angry, disgusted | **Stressed** |

This runs entirely on the local machine — no internet needed.

---

## 15. A real example, start to finish

Kavya starts a **React** interview at difficulty 3.

1. Frontend → `POST /api/interviews` with `{ topic: "React", difficulty: 3 }`.
2. Backend creates the session, calls Module D `/generate-questions`, saves 5 questions, and returns them.
3. As Kavya answers question 1, the page sends webcam frames to `/predict`, which returns `Confident`, so the chip shows green "Confident."
4. She submits her answer → Backend calls Module D `/analyze-response`, which scores it:

```json
{ "score": 72, "feedback": "Good understanding demonstrated. Add concrete examples.", "engagement_score": 68, "emotion_summary": { "dominant": "Confident" } }
```

5. She sees **72/100** with that feedback instantly; the response is saved to `interview_responses`.
6. After all 5 questions she ends the session (`PATCH /api/interviews/:id`); her overall score and duration are saved and appear in her history.

---

## 16. Sequence diagram (text)

```
User      Interview Page     Backend           Module D (:8004)    Database
 │ start       │                │                    │                │
 │────────────►│ POST /interviews│                   │                │
 │             │───────────────►│ auth + perms        │                │
 │             │                │ create session ─────────────────────►│ interview_sessions
 │             │                │ POST /generate-questions ─►│         │
 │             │                │◄───────────────────────────│ 5 Qs    │
 │             │                │ save questions ──────────────────────►│ interview_questions
 │             │◄───────────────│ session + questions │                │
 │             │                │                     │                │
 │  (webcam loop, direct to Module D, ~5 fps)         │                │
 │ frame ──────────────────────────────────────────►│ /predict        │
 │◄──────────────────────────────────────────────── │ {state}         │
 │             │                │                     │                │
 │ answer      │                │                     │                │
 │────────────►│ POST /:id/responses                  │                │
 │             │───────────────►│ verify question      │                │
 │             │                │ POST /analyze-response ─►│            │
 │             │                │◄─────────────────────────│ {score}    │
 │             │                │ save response ───────────────────────►│ interview_responses
 │             │◄───────────────│ { success, data }    │                │
 │◄────────────│ score + feedback shown               │                │
```

---

## 17. Where it lives in the code

- **Web page:** [frontend/src/app/(dashboard)/interview/page.tsx](../../frontend/src/app/(dashboard)/interview/page.tsx)
- **Frontend → backend calls:** [frontend/src/services/interview.service.ts](../../frontend/src/services/interview.service.ts)
- **Backend address list (routes):** [backend/src/routes/interview.routes.ts](../../backend/src/routes/interview.routes.ts)
- **Backend request receiver (controller):** [backend/src/controllers/interview.controller.ts](../../backend/src/controllers/interview.controller.ts)
- **Backend logic (session, questions, scoring):** [backend/src/services/interview.service.ts](../../backend/src/services/interview.service.ts) — see `createSession()`, `submitResponse()`, `extractDocumentText()`, `endSession()`
- **Validation rules:** [backend/src/validations/interview.validation.ts](../../backend/src/validations/interview.validation.ts)
- **The AI brain:** [python-module-d/main.py](../../python-module-d/main.py) — `/generate-questions`, `/analyze-response`, `/extract-ocr`, `/extract-cv`, `/predict`, `/interview`
- **Database tables:** [0014_interviews.sql](../../backend/supabase/migrations/0014_interviews.sql), [0021_interview_response_analysis.sql](../../backend/supabase/migrations/0021_interview_response_analysis.sql)
