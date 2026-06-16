# Module D — Interview & Document Intelligence Service

| | |
|---|---|
| **Project** | PathwayIQ (R26-IT-128) |
| **Stack** | Python · FastAPI · OpenAI SDK (GitHub Models, gpt-4o-mini) · TensorFlow/Keras · OpenCV · EasyOCR |
| **Port** | `8004` |
| **Entry point** | `main.py` |

## What this component does

Module D is the AI workhorse of the platform. It powers the **Interview Simulator** (question generation, rubric answer scoring, real-time webcam emotion detection) and all **document intelligence** (OCR, structured CV extraction, job-post tailoring).

## Environment

| Variable | Purpose | Default |
|---|---|---|
| `GITHUB_TOKEN` | GitHub Models API token for all LLM features. **Never hardcode it** — without it, every LLM endpoint degrades to a deterministic fallback instead of failing. | *(unset → fallbacks)* |
| `FACE_SCALE_FACTOR` | Haar-cascade pyramid step; lower = finds more faces | `1.1` |
| `FACE_MIN_NEIGHBORS` | Detection strictness; lower = more sensitive | `4` |
| `FACE_MIN_SIZE` | Minimum face size in px (rejects noise) | `48` |
| `NEUTRAL_DAMPING` | Multiplier on the "neutral" emotion probability before argmax; lower = more sensitive to real expressions, `1.0` = off | `0.6` |

`run-all.sh` exports `GITHUB_TOKEN` from `backend/.env` automatically.

## Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/generate-questions` | `{ session_id, topic, difficulty 1-5, skills[], document_text }` → 5 interview questions (behavioral/technical/situational), tailored to an uploaded document when provided. LLM with JSON mode; static question fallback on failure. |
| POST | `/analyze-response` | `{ question_id, response_text, question_text, question_type, topic, difficulty, emotion_data }` → rubric evaluation (see below). |
| POST | `/extract-ocr` | `{ file_b64, mimetype }` → raw text from PDF / PNG / JPEG / TXT. |
| POST | `/extract-cv` | `{ file_b64, mimetype }` → `{ raw_text, sections }` — fully structured CV (summary, experience, education, skills, projects + contact links). |
| POST | `/tailor-cv` | `{ sections, job_text }` → `{ tailored_summary, suggestions[], keywords_to_add[] }` — LLM advice to tailor a CV to a specific job post. |
| GET | `/interview` | Legacy standalone emotion-detector UI (Jinja template). |
| POST | `/predict` | `{ image: base64 JPEG }` → face detection + emotion classification for one webcam frame. |

## How answer analysis works (`/analyze-response`)

- **Question-aware LLM rubric** — the prompt includes the question text/type, topic, and difficulty (not just the answer). Returns an overall score, 2–3 sentence feedback, five criterion scores (`relevance`, `technical_accuracy`, `depth`, `structure`, `communication`), strengths/improvements lists, and a model answer. JSON mode, clamped 0–100.
- **Deterministic emotion math** — `engagement_score` and `emotion_summary` are computed from the real webcam timeline sent by the frontend (`{dominant, timeline:[{t, emotion}]}`), using per-state weights (Engaged 95, Confident 90, Neutral 65, Nervous 40, Confused 35, Stressed 30). The LLM is never asked to invent emotion data. No camera → `engagement_score: null`, never a fake number.
- **Fallback** — if the LLM is unavailable, a length-based heuristic score is returned so an interview session never dies mid-flow.

## How emotion detection works (`/predict`)

1. Decode the frame, grayscale, **histogram-equalise** (better detection in poor lighting).
2. Haar cascade face detection with the tunable sensitivity parameters above; largest face wins.
3. Crop (+10% margin), resize to 48×48, run the Keras model (`models/emotion_model.h5`, 7 emotion classes).
4. **Neutral damping** — FER models are heavily biased toward "neutral", so its probability is multiplied by `NEUTRAL_DAMPING` and the distribution renormalised before argmax. Borderline expressions now surface; a clearly neutral face still wins.
5. Raw emotions map to interview states: fearful/surprised → **Nervous**, neutral/happy → **Confident**, sad → **Confused**, angry/disgusted → **Stressed**.

The main app calls this through the Express backend (`POST /api/interviews/predict-emotion`, ~1 fps), which records the timeline per question.

## How CV extraction works (`/extract-cv`)

1. **Layered text extraction**: pypdf (`layout` + `plain` modes) → if too little text, pdf2image+EasyOCR at 300 dpi (requires poppler) → finally OCR of images embedded in the PDF pages. Small images are upscaled before OCR.
2. **Text cleanup**: de-hyphenation, OCR-spacing fixes, URL repair ("github .com/x" → "github.com/x").
3. **Regex pre-extraction** of GitHub/LinkedIn/portfolio/email/phone (more reliable than the LLM for these).
4. **Chunked LLM parsing** (8 000-char chunks with overlap) into a strict JSON schema, with per-chunk retry and case-insensitive dedup on merge.

The extracted `raw_text` is stored by the backend (`cvs.extracted_text`) and reused by **Module C** for analysis — Module C cannot OCR on its own.

## Fallback philosophy

Every endpoint must keep the product flow alive: missing token or an LLM/HTTP failure returns a deterministic fallback (static questions, heuristic score, generic tailoring tip) and logs a warning — never a 500 mid-session. The service even boots without `GITHUB_TOKEN` (LLM features disabled, OCR and emotion detection still work).

## Running

```bash
cd python-module-d
GITHUB_TOKEN=... ./venv/bin/python main.py    # uvicorn on :8004
# or via the repo root: ./run-all.sh
```

> ⚠️ No auto-reload — restart the process after code changes. First OCR call downloads EasyOCR weights (slow once).
