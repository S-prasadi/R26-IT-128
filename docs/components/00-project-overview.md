# PathwayIQ — Project Overview (Start Here)

> A friendly, non-technical tour of how the whole project fits together.
> Read this first, then jump into the module you own.

---

## What is PathwayIQ?

PathwayIQ is an **AI career helper**. A person logs in and the app helps them answer four questions about their career:

1. **"Which skills should I learn next?"** → the **Skill Forecaster**
2. **"What career paths can I take from here?"** → the **Career Predictor**
3. **"How good is my CV, and which jobs fit me?"** → the **CV Analyser**
4. **"Can I practise for interviews?"** → the **Interview Simulator**

This is a **4-student group project** — each student built one of those four AI brains.

| Module | Name | Owner builds | Lives in |
|--------|------|--------------|----------|
| **A** | Skill Forecaster | Predicts which skills will be in demand | `python-module-a/` (port 8001) |
| **B** | Career Predictor | Predicts likely career paths | `python-module-b/` (port 8002) |
| **C** | CV Analyser | Scores a CV against job roles | `python-module-c/` (port 8003) |
| **D** | Interview Simulator | Makes interview questions + reads emotion from the webcam | `python-module-d/` (port 8004) |

Read your module's own story:
- [Skill Forecasting](skill-forecasting.md)
- [Career Prediction](career-prediction.md)
- [CV Analysis](cv-analysis.md)
- [Interview Simulator](interview-simulator.md)

---

## The four pieces of the system

Think of the app as **four kinds of programs** that talk to each other. Each one has a clear job, like people in a relay race passing a baton.

```
┌───────────────┐   ┌───────────────┐   ┌────────────────┐   ┌──────────────┐
│  1. FRONTEND  │   │  2. BACKEND   │   │  3. DATABASE   │   │ 4. PYTHON AI │
│  (the web     │   │ (the manager) │   │ (the memory)   │   │  (the brains)│
│   page you    │   │               │   │                │   │              │
│   click on)   │   │               │   │                │   │ A · B · C · D│
└───────────────┘   └───────────────┘   └────────────────┘   └──────────────┘
   Next.js            Express             Supabase             4 services
   :3000              :8081               (PostgreSQL)         :8001–:8004
```

**1. Frontend — the web page** (`frontend/`)
What the user actually sees and clicks: buttons, forms, charts. It never does the "thinking" itself. When the user clicks something, it just asks the backend for help and shows whatever comes back.

**2. Backend — the manager** (`backend/`)
The middle-man that coordinates everything. It:
- checks **who you are** (are you logged in? are you allowed to do this?),
- reads and writes the **database**,
- and hands the hard "AI" work to the right **Python service**.
The frontend is **only ever allowed to talk to the backend** — never directly to the database or (almost never) to the Python brains.

**3. Database — the memory** (Supabase / PostgreSQL)
Where everything is permanently saved: users, skills, CVs, interview sessions, notifications. When you log back in tomorrow, your data is still here.

**4. Python AI services — the brains** (`python-module-a` … `-d`)
Four small, separate programs, each running on its own port. Each is an expert at *one* thing (forecasting, career paths, CV scoring, interview questions). The backend sends them a question over the internet and they send back an answer.

---

## How one request flows (the relay race)

Almost every feature follows the **same journey**. Once you understand this, you understand the whole app:

```
You click a button
      │
      ▼
FRONTEND  ──── sends your data (with your login token) ────►  BACKEND
                                                                 │
                          ┌──────────────────────────────────────┤
                          │ 1. checks you are logged in & allowed  │
                          │ 2. maybe reads/writes the DATABASE     │
                          │ 3. asks a PYTHON BRAIN to do AI work   │
                          └──────────────────────────────────────┘
                                                                 │
FRONTEND  ◄──────────────── sends the answer back ──────────────┘
      │
      ▼
The page updates and shows you the result
```

The user never sees steps 1–3 — they just click a button and get a result a moment later.

---

## Logging in (in plain words)

Before any of this works, the user has to log in:

1. The user types their email + password on the **login page**.
2. The backend checks them against **Supabase Auth** (the part of the database that handles accounts).
3. If correct, the backend hands back a **token** — think of it as a wristband that says "this person is logged in."
4. From then on, the frontend sends that wristband (token) with **every** request. The backend checks the wristband each time before doing anything.

If the wristband expires (after some hours), the user is asked to log in again.

---

## Permissions & roles (who is allowed to do what)

Logging in answers *"who are you?"*. Permissions answer *"what are you allowed to do?"*.

Every user has one or more **roles** (the defaults are `admin` and `user`), and each role carries a set of **permissions**. Permissions are named `area:action`, for example `skills:read`, `cv:write`, `interviews:write`.

Each backend route is guarded by two checks, in order:

1. **`authenticate`** — is the token valid? (who are you)
2. **`requirePermission("area:action")`** — do you have this permission? (what you can do)

So a route like *"run a forecast"* needs `skills:read`, and *"analyse a CV"* needs `cv:write`. If either check fails, the request stops before any real work happens (401 if not logged in, 403 if not allowed). Each module's doc lists the exact permission per endpoint.

---

## The standard shape of every reply

So the modules feel consistent, the backend always answers in the **same JSON shape**.

**Success:**

```json
{ "success": true, "message": "Success", "data": { /* the actual result */ } }
```

**Error:**

```json
{ "success": false, "message": "What went wrong" }
```

Whenever a module doc shows a "successful response", the real result is the part inside `data`. Errors always carry a human-readable `message`, which the frontend usually shows as a small toast notification.

---

## The common request anatomy (the same skeleton every time)

Almost every action in every module follows this exact skeleton on the backend:

```
route  ──►  authenticate  ──►  requirePermission  ──►  validate body  ──►  controller  ──►  service
                                                                                              │
                                                            ┌─────────────────────────────────┤
                                                            │ read / write the DATABASE        │
                                                            │ and/or call a PYTHON brain        │
                                                            └─────────────────────────────────┘
                                                                                              │
                                                                            { success, data } ◄┘
```

- **route** — the address (e.g. `POST /api/skills/forecast`)
- **authenticate / requirePermission** — the two security guards above
- **validate** — a Zod schema that checks the request body's shape and rules
- **controller** — receives the request, pulls out the user + body
- **service** — the real logic (database + Python brains)

Once you've seen this for one module, the other three feel familiar — they only differ in *what* the service does.

---

## The clever safety net: "mock fallback"

The Python brains are separate programs. What if one of them is **switched off** while you're developing?

The backend is built so that **the app never crashes** in that case. If it tries to ask a Python brain a question and gets no answer, it quietly uses **fake sample data ("mock data")** instead, so the page still shows *something*.

> **Why this matters for you as a student:** if you ever see obviously fake results (like "React, TypeScript, Node.js" every single time), it usually means **your Python service isn't running**. Start it, click the button again, and you'll see real results. Each module's doc explains exactly what its fake data looks like.

> **Note on Module B (Career Predictor):** at the moment the backend is *always* using mock data for career predictions, because Module B isn't fully wired up yet. See [career-prediction.md](career-prediction.md).

---

## Where things live (quick map)

```
frontend/                         ← the web pages (what users see)
  src/app/(dashboard)/skill/      ← Skill page
  src/app/(dashboard)/career/     ← Career page
  src/app/(dashboard)/cv/         ← CV page
  src/app/(dashboard)/interview/  ← Interview page
  src/services/                   ← code that calls the backend

backend/                          ← the manager
  src/routes/                     ← the list of API addresses
  src/controllers/                ← receive each request
  src/services/                   ← the real logic + calls to Python
  supabase/migrations/            ← the database table definitions

python-module-a/  (Skill)         ← the four AI brains
python-module-c/  (CV)
python-module-d/  (Interview)
python-module-b/  (Career)
```

That's the whole picture. Now open your module's doc — each one tells the same kind of story, focused on *your* feature.
