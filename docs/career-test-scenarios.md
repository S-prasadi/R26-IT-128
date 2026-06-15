# Career Pathway — Test Scenarios

Ready-made **Goal + Skill set + Current job** combinations for exercising the
career-path prediction, the deep journey graph, the node detail drawer, the
what-if simulator, and the per-node market panel.

All "Expected path" values below are the **actual** Module B output captured from
the trained model (184-class Logistic Regression).

---

## Login (frontend → http://localhost:3000)

```
Email:    student.test@pathwayiq.dev
Password: Student@12345
```

> Start the stack first with `./run-all.sh` (backend 8081, Module A 8001,
> Module B 8002, frontend 3000).

## How the three inputs are used

| Input | Where you enter it | What it does |
|---|---|---|
| **Goal** (target role) | Career page → *Career Goal* tab | Stored on your profile; shown in the radar/goal card. Does **not** force the prediction. |
| **Skill set** | *Skills* page (add skills) **or** the *What-if* panel | The main driver of the prediction. |
| **Current job** (+ months) | *Career Path* tab → "Current Role" / "Experience" | Sets where the ladder starts and the seniority of the journey. |

Three ways to test a scenario:
1. **Frontend (account):** add the scenario's skills on the *Skills* page, set the goal, then run *Generate My Path* with the current job.
2. **Frontend (no account change):** keep the account as-is and type the skills into the **What-if** panel → *Simulate*.
3. **API (fastest):** call Module B directly (see bottom) — pass skills + current role inline, no login.

> Only the 30 **catalog** skills can be added to the account. What-if and the API
> accept any free-text skill.

---

## ✅ Clean demo scenarios

### 1. Data Science → AI Researcher
- **Goal:** `Data Scientist`
- **Skills:** `Python, SQL, Machine Learning, PyTorch`
- **Current job:** `Student`, 6 months
- **Expected path:** `Student → ML/AI Intern → Junior Machine Learning Engineer → Machine Learning Engineer → AI Researcher`  (readiness ≈ 50%)
- **Check:** 5-node deep ladder; click *AI Researcher* → gate skills (tensorflow, research methods) + market signal.

### 2. Machine Learning Engineer
- **Goal:** `Machine Learning Engineer`
- **Skills:** `Python, TensorFlow, PyTorch, Machine Learning`
- **Current job:** `Student`, 12 months
- **Expected path:** `Student → ML/AI Intern → Junior Machine Learning Engineer → Machine Learning Engineer`  (readiness ≈ 34%)

### 3. Frontend Developer
- **Goal:** `Frontend Developer`
- **Skills:** `React, TypeScript, Next.js, JavaScript`
- **Current job:** `Junior Developer`, 18 months
- **Expected path:** `Junior Developer → Frontend Intern → Junior Frontend Developer → Frontend Developer`  (readiness ≈ 30%)

### 4. Full-Stack Developer
- **Goal:** `Full Stack Developer`
- **Skills:** `React, Node.js, Express.js, MongoDB`
- **Current job:** `Student`, 12 months
- **Expected path:** `Student → Software Engineer Intern → Junior Full Stack Developer → Full Stack Developer`  (readiness ≈ 21%)

### 5. Mobile Developer
- **Goal:** `Mobile Developer`
- **Skills:** `Flutter, React Native, JavaScript`
- **Current job:** `Mobile Dev Intern`, 12 months
- **Expected path:** `Mobile Dev Intern → Junior Mobile Developer → Mobile Developer`

### 6. GenAI / LLM (senior pivot)
- **Goal:** `AI Researcher`
- **Skills:** `Python, LangChain, FastAPI, Machine Learning`
- **Current job:** `Software Engineer`, 36 months
- **Expected path:** `Software Engineer → ML/AI Intern → Junior Machine Learning Engineer → Machine Learning Engineer → AI Researcher`  (readiness ≈ 50%)

---

## ⚠️ Edge-case scenarios (known model-label noise)

The model still maps some DevOps/Cloud/Backend skill sets onto generic
"General IT" roles. The **depth, gates, market, and what-if features still work** —
the target *label* is just imperfect. Good for testing robustness:

| Goal | Skills | Current job | Actual output |
|---|---|---|---|
| `DevOps Engineer` | `Docker, Kubernetes, AWS, GCP` | `Junior Developer`, 24 | → `IT Specialist → Envoy Engineer` |
| `Cloud Engineer` | `AWS, GCP, Kubernetes, Docker` | `Cloud Intern`, 18 | → `IT Specialist → Envoy Engineer` |
| `Backend Developer` | `Java, Spring Boot, PostgreSQL, Redis` | `Backend Developer`, 30 | → `Mobile Dev Intern → … → Mobile Developer` |

These are the targets for the next model label-cleanup pass.

---

## What-if simulator test inputs

Open *Career Path* → **What-if** panel (chips show your current skills):

| Action | Skills | Expected effect |
|---|---|---|
| Add | `tensorflow`, `pytorch`, `deep learning` | AI/ML path strengthens, readiness ↑ |
| Add | `react`, `typescript`, `next.js` | Frontend roles surface |
| Remove | `python`, `machine learning` | Readiness **drops** (proves it's live) |
| Add | `docker`, `kubernetes`, `aws` | DevOps/Cloud roles appear |

Click **Simulate** → readiness Δ + newly-surfaced roles. **Reset** restores the
saved prediction. Simulations are never written to history.

---

## API quick-reference (no login)

**Module B model directly (port 8002)** — deep path + `step_gates`:
```bash
curl -s localhost:8002/predict -H 'content-type: application/json' \
 -d '{"skills":["python","sql","machine learning","pytorch"],
      "current_role":"Student","experience_months":6,"top_k":2}' | python3 -m json.tool
```

**Full backend flow (registers student + skills + goal + predict + roadmap):**
```bash
cd backend && npm run test:career
```
