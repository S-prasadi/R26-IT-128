# Interview Simulator (Module D)

> *"Can I practise for interviews?"*
> The Interview Simulator generates tailored interview questions with AI, scores each answer **against the question it was asked** (with a rubric breakdown), and — using your webcam — reads your **facial emotion** in real time to tell you whether you look confident, nervous, confused, or stressed. Your engagement is measured from those real emotions, and your session total is the average of your real per-question scores.

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

- **generates 5 interview questions** using a local Ollama model (`gemma4:e2b` by default),
- can **read an uploaded document** (a job description or resume) and build the questions around it,
- **scores each answer against the actual question** out of 100 — with written feedback, a **five-criterion rubric** (relevance, technical accuracy, depth, structure, communication), strengths/improvements, and a model answer, and
- watches the **webcam** to detect the user's emotion live, mapping facial expressions to interview states (Confident, Nervous, Confused, Stressed, Engaged, Neutral), then computes an **engagement score deterministically from those real emotions**.

Every browser ↔ Module D call now goes **through the backend** (`/api/interviews/...`), including the webcam frames via a `predict-emotion` proxy — so the AI service is never exposed directly, requests are authenticated, and there is no hardcoded `localhost` URL in the frontend.

---

## 2. Feature list

| Feature | What you do | What you see |
|---------|-------------|--------------|
| **Upload a document** | Upload a job ad/resume (PDF/image/txt) before starting | A text preview, used to tailor questions |
| **Start a session** | Pick a topic + difficulty (1–5), click Start | 5 AI-generated questions |
| **Tailored questions** | Start with a document attached | Questions built around that document |
| **Answer a question** | Type/record your answer, submit | Instant score (0–100), feedback, rubric breakdown, model answer |
| **Live emotion** | Allow the webcam during the session | A chip showing Confident / Nervous / Confused / Stressed, plus a real emotion timeline |
| **Finish the session** | End the interview | Overall score = average of your real per-question scores; engagement from your real emotions |
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

7. **You type/record an answer.** Meanwhile, throughout the session, the page sends webcam frames to the backend's `/api/interviews/predict-emotion` proxy (which forwards them to Module D's `/predict`) to track your emotion live, and **builds a per-question emotion timeline** sampled about once a second.
8. **The page submits your answer** plus the emotion data `{ dominant, timeline }` to the backend.
9. **The backend verifies** the question belongs to this session (and the session is yours), and **looks up the question text, type, topic, and difficulty**.
10. **The backend asks Module D to score it** via `/analyze-response`, sending your answer **together with the question context** so the AI grades relevance to the actual question — plus the emotion timeline.
11. **Module D returns** a score, feedback, a five-criterion **rubric** (relevance, technical accuracy, depth, structure, communication), strengths, improvements, a model answer, and an **engagement score computed deterministically from your emotion timeline** (no camera → `null`, never a fake number). The backend saves the response — including the rubric in the `analysis` column — (inserting, or updating if you re-answer) and returns it.

**Ending the session** (`PATCH /api/interviews/:id`):

12. The page sends only the **duration**. The backend computes the **overall score and engagement score as the average of your real per-question scores** stored in the database, marks the session `completed`, and saves the totals. (Client-sent scores are ignored.)

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

LIVE EMOTION (through the backend proxy):
Browser webcam ─ frame as base64 JPEG ─ POST /api/interviews/predict-emotion ─► Backend ─► :8004/predict ─► Module D
              ◄─ { face, interview_state, confidence, probs, bbox } ─ chip updates ~5×/sec
              (the page also samples a {t, emotion} timeline ~1×/sec for engagement scoring)

ANSWER:
You ─ submit answer + emotion timeline ─► Backend ─ adds question context ─ POST :8004/analyze-response ─► Module D
                                          ◄─ { score, feedback, criteria, strengths, improvements, model_answer, engagement_score, emotion_summary }
                                          save response + rubric (DB)
You ◄──────────────────── score + feedback shown instantly
```

The webcam frames now go **through the backend** (`/api/interviews/predict-emotion`) so the call is authenticated and the AI service URL is never hardcoded in the browser. Engagement is derived from the captured emotion timeline, not invented by the AI.

---

## 5. Frontend side

- **The page:** `frontend/src/app/(dashboard)/interview/page.tsx` — a Setup step (topic, difficulty, optional document upload), the live interview step (current question, answer box, webcam + emotion chip), and a results/review view.
- **Webcam handling:** the page uses `getUserMedia()` to capture video, draws each frame to a hidden `<canvas>`, converts it to a base64 JPEG, and posts it to the backend proxy `POST /api/interviews/predict-emotion` about 5 times per second. The returned `interview_state` updates the emotion chip, and the page samples each detected state into a **per-question emotion timeline** (`emotionTimeline` ref, ~1 fps) that resets after every submitted answer.
- **State management:** React state holds the session, the list of questions, the current question index, each answer + its score, the live emotion, and a timer for the session duration; a ref holds the emotion timeline for the current question.
- **API calls:** through `frontend/src/services/interview.service.ts` — list/get sessions, extract a document, create a session, submit a response (with `emotion_data: { dominant, timeline }`), `predictEmotion(frame)`, and end a session (sends only `duration_seconds`; the backend computes the totals).

---

## 6. Backend side

Chain: **route → controller → service → (DB + Module D)**.

The service (`interview.service.ts`) functions:

- `listSessions()` — all of the user's sessions.
- `getSession()` — one session with its questions, each joined to its response.
- `createSession()` — create the session row, call **Module D** `/generate-questions`, save the 5 questions.
- `extractDocumentText()` — send an uploaded document to **Module D** `/extract-ocr`, return the text.
- `submitResponse()` — verify the question belongs to the session, look up its **text/type/topic/difficulty**, call **Module D** `/analyze-response` with that context + the emotion timeline, then insert or update the response — storing the rubric in the `analysis` column (re-answering overwrites the previous one).
- `predictEmotion()` — proxy a single webcam frame to **Module D** `/predict` (so the browser never calls Python directly); returns a safe neutral fallback if Module D is unreachable.
- `endSession()` — recompute the session's `overall_score` and `engagement_score` as the **average of the stored per-question scores**, mark the session completed, and save the totals + duration. Client-sent scores are not trusted.

---

## 7. Routes and endpoints

All under `/api/interviews`, all require a valid login token.

| Method | Path | What it does | Permission |
|--------|------|--------------|------------|
| GET | `/api/interviews` | List the user's sessions | `interviews:read` |
| GET | `/api/interviews/:id` | Get one session with questions + responses | `interviews:read` |
| POST | `/api/interviews/extract-document` | Upload a doc → extracted text (Module D OCR) | `interviews:write` |
| **POST** | **`/api/interviews`** | **Start a session (Module D generates questions)** | `interviews:write` |
| PATCH | `/api/interviews/:id` | End a session (backend computes final scores) | `interviews:write` |
| **POST** | **`/api/interviews/:id/responses`** | **Submit an answer (Module D scores it against the question)** | `interviews:write` |
| **POST** | **`/api/interviews/predict-emotion`** | **Proxy one webcam frame to Module D for live emotion** | `interviews:write` |

**Module D endpoints** — all reached **through the backend**: `/generate-questions`, `/extract-ocr`, `/analyze-response`, and `/predict` (via the `predict-emotion` proxy). The browser no longer calls Module D directly. Module D also serves a standalone emotion-detector UI at `http://localhost:8004/interview` for local testing.

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

**Submit-answer request** — `POST /api/interviews/:id/responses`:

```json
{
  "question_id": "q1-uuid",
  "response_text": "React reconciliation diffs the virtual DOM tree...",
  "emotion_data": {
    "dominant": "Confident",
    "timeline": [
      { "t": 1, "emotion": "Confident" },
      { "t": 2, "emotion": "Engaged" },
      { "t": 3, "emotion": "Neutral" }
    ]
  }
}
```

**Submit-answer response** (the backend adds the question context before scoring, and stores the rubric):

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "id": "response-uuid",
    "question_id": "q1-uuid",
    "score": 78,
    "feedback": "Solid explanation of the diffing algorithm. Add a concrete example of keys preventing re-renders.",
    "engagement_score": 83,
    "emotion_data": { "dominant": "Confident", "timeline": [], "summary": { "dominant": "Confident", "distribution": { "Confident": 33, "Engaged": 33, "Neutral": 33 } } },
    "analysis": {
      "criteria": { "relevance": 85, "technical_accuracy": 80, "depth": 70, "structure": 78, "communication": 80 },
      "strengths": ["Clear grasp of the virtual DOM diff"],
      "improvements": ["Mention key-based reconciliation"],
      "model_answer": "React builds a virtual DOM and diffs it against the previous tree..."
    }
  }
}
```

> `engagement_score` here (83) is the average of the timeline weights — Confident 90, Engaged 95, Neutral 65 — **not** a number the AI invented. With no camera it is `null`.

**The proxied `/predict-emotion` reply** (browser → backend → Module D):

```json
{ "success": true, "message": "Emotion predicted", "data": { "face": true, "interview_state": "Confident", "confidence": 0.81, "probs": {}, "bbox": [120, 80, 200, 200] } }
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
| `interview_responses` | The user's answer + scoring per question | `id`, `question_id`, `response_text`, `score`, `feedback`, `engagement_score`, `emotion_data` (JSON: `{ dominant, timeline:[{t,emotion}], summary }`), `analysis` (JSON: `{ criteria, strengths, improvements, model_answer }`) |

**CRUD performed:** create/read/update on `interview_sessions`; create/read on `interview_questions`; create/update/read on `interview_responses`. The `emotion_data` column stores the captured emotion **timeline** for the answer plus the summary from Module D; the `analysis` column stores the rubric breakdown.

> Defined in `0014_interviews.sql`; the `analysis` rubric column is added in `0021_interview_response_analysis.sql`. The session's `overall_score`/`engagement_score` are computed by the backend as the average of these per-question values.

---

## 10. Validation: what gets checked

From `interview.validation.ts` and the upload middleware:

- **Create session:** `topic` required; `difficulty` integer 1–5 (default 3); `skills` optional array; `document_text` optional and **auto-trimmed to 10,000 characters**.
- **End session:** `duration_seconds` non-negative integer. (`overall_score`/`engagement_score` are still accepted by the schema for compatibility but **ignored** — the backend computes them from the stored answers.)
- **Submit response:** `question_id` must be a UUID; `response_text` optional; `emotion_data` optional free-form JSON (the page sends `{ dominant, timeline }`).
- **Predict emotion:** `frame` required, a non-empty base64 JPEG string.
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
| **Module D down (scoring)** | Mock analysis used (callPython fallback) | You still get a score + feedback |
| **LLM fails / no token (scoring)** | Module D returns a heuristic length-based score (no 500) | A score + "AI unavailable" note, engagement still real |
| **No camera / empty timeline** | `engagement_score` is `null` | Honest "no signal" instead of a fake number |
| **`predict-emotion` fails / no camera** | Proxy returns neutral fallback; chip keeps last value | Interview continues normally |
| Wrong file type/size on upload | Multer rejects | 400, "Unsupported file type…" |

All errors return `{ success: false, message }`.

---

## 12. Security

- **Authentication:** valid login token on every `/api/interviews` route.
- **Authorization:** `interviews:read` to view, `interviews:write` to create/answer/end.
- **Data isolation:** sessions and responses are filtered by `user_id`; `submitResponse()` double-checks the question belongs to *your* session before saving.
- **The webcam call is authenticated:** frames go through `POST /api/interviews/predict-emotion` (login + `interviews:write`), not a hardcoded `localhost:8004` URL in the browser. They are forwarded to Module D, classified, and **not stored** — used purely for the live chip and the engagement timeline.
- **No cloud AI token:** Module D calls a local Ollama instance (`OLLAMA_BASE_URL`, default `http://127.0.0.1:11434`) — CV/interview data never leaves the machine, and there's no API key to leak. `python-module-d/.env` (gitignored) can override `OLLAMA_BASE_URL`/`OLLAMA_MODEL` if needed.
- **Document size guard:** `document_text` is capped at 10,000 characters before being sent to the AI, and uploads are capped at 10 MB.
- **Input safety:** Zod validation + parameterised Supabase queries; AI-returned scores are clamped to 0–100 server-side (in Module D) so a bad reply can't skew totals.

---

## 13. What happens if the AI service is off

Module D is unusually robust:

- If **Module D is off** when starting, the backend returns **mock questions** built from your topic (e.g. *"Explain your experience with React development."*).
- If **Module D is unreachable** when scoring, the backend uses its `MOCK_RESPONSE_ANALYSIS` fallback so you still get a score + feedback.
- If **Module D is reachable but Ollama is stopped or the model isn't pulled**, Module D itself returns a **deterministic heuristic score** (length-based) with an "AI unavailable" note — it does **not** return a 500. Either way the engagement number stays real (it comes from your webcam, not the LLM).
- The **live emotion** goes through the backend proxy — if Module D is off or the camera is blocked, the proxy returns a neutral fallback and the chip keeps its last value.
- **Ollama not running?** Module D still boots (it never depended on a token) and every LLM endpoint degrades to a fallback. Emotion detection works fully offline (it doesn't call Ollama at all).

The mock data lives in `mockQuestions()` / `MOCK_RESPONSE_ANALYSIS` (backend service) and `_scoring_fallback()` / `_heuristic_score()` (Module D `main.py`).

> Tip: to enable real AI scoring, install [Ollama](https://ollama.com), run `ollama serve`, and pull the default model with `ollama pull gemma4:e2b`. If questions look generic (not tailored) or feedback says "AI unavailable", Ollama isn't running or the model isn't pulled. If the webcam chip never changes, check the browser gave camera permission.

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
3. As Kavya answers question 1, the page sends webcam frames to `/api/interviews/predict-emotion`, which returns `Confident`, so the chip shows green "Confident" — and the page records a timeline like `[Confident, Engaged, Confident, Neutral]`.
4. She submits her answer + that timeline → Backend looks up the question (text/type/topic/difficulty) and calls Module D `/analyze-response`, which scores the answer **against that question**:

```json
{
  "score": 78,
  "feedback": "Strong on reconciliation. Add a keys example.",
  "criteria": { "relevance": 85, "technical_accuracy": 80, "depth": 70, "structure": 78, "communication": 80 },
  "strengths": ["Clear virtual-DOM explanation"],
  "improvements": ["Mention key-based diffing"],
  "model_answer": "React diffs the new virtual DOM against the old tree...",
  "engagement_score": 84,
  "emotion_summary": { "dominant": "Confident", "distribution": { "Confident": 50, "Engaged": 25, "Neutral": 25 } }
}
```

5. She sees **78/100** with feedback and the rubric instantly; the response + rubric are saved to `interview_responses`.
6. After all 5 questions she ends the session (`PATCH /api/interviews/:id`, sending only the duration). The backend averages her five real scores into the **overall score** and her five engagement numbers into the **engagement score**, saves them, and they appear in her history.

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
 │  (webcam loop, via backend proxy, ~5 fps)          │                │
 │ frame ─────►│ POST /predict-emotion                │                │
 │             │───────────────►│ POST /predict ─────►│ {state}        │
 │◄────────────│◄───────────────│◄────────────────────│                │
 │             │   (page samples a {t,emotion} timeline ~1 fps)        │
 │             │                │                     │                │
 │ answer      │                │                     │                │
 │────────────►│ POST /:id/responses (+ timeline)     │                │
 │             │───────────────►│ verify + load question context       │
 │             │                │ POST /analyze-response (+ context) ─►│
 │             │                │◄─────────────────────────│ {score, rubric, engagement}
 │             │                │ save response + analysis ────────────►│ interview_responses
 │             │◄───────────────│ { success, data }    │                │
 │◄────────────│ score + feedback + rubric shown      │                │
```

---

## 17. Where it lives in the code

- **Web page:** [frontend/src/app/(dashboard)/interview/page.tsx](../../frontend/src/app/(dashboard)/interview/page.tsx)
- **Frontend → backend calls:** [frontend/src/services/interview.service.ts](../../frontend/src/services/interview.service.ts) — incl. `predictEmotion()`
- **Backend address list (routes):** [backend/src/routes/interview.routes.ts](../../backend/src/routes/interview.routes.ts) — incl. `POST /predict-emotion`
- **Backend request receiver (controller):** [backend/src/controllers/interview.controller.ts](../../backend/src/controllers/interview.controller.ts)
- **Backend logic (session, questions, scoring):** [backend/src/services/interview.service.ts](../../backend/src/services/interview.service.ts) — see `createSession()`, `submitResponse()` (forwards question context + stores `analysis`), `predictEmotion()` (proxy), `endSession()` (computes totals)
- **Validation rules:** [backend/src/validations/interview.validation.ts](../../backend/src/validations/interview.validation.ts) — incl. `predictEmotionSchema`
- **The AI brain:** [python-module-d/main.py](../../python-module-d/main.py) — `/generate-questions`, `/analyze-response` (rubric + JSON mode + `_engagement_summary()`), `/extract-ocr`, `/extract-cv`, `/predict`, `/interview`
- **AI config:** `python-module-d/.env` (gitignored, optional) — override `OLLAMA_BASE_URL` / `OLLAMA_MODEL` there or in the shell environment
- **Database tables:** [0014_interviews.sql](../../backend/supabase/migrations/0014_interviews.sql), [0021_interview_response_analysis.sql](../../backend/supabase/migrations/0021_interview_response_analysis.sql)
