# Module D — Interview & Document Intelligence Service

| | |
|---|---|
| **Project** | PathwayIQ (R26-IT-128) |
| **Stack** | Python · FastAPI · local Ollama (`gemma4:e2b`) · TensorFlow/Keras · OpenCV · EasyOCR |
| **Port** | `8004` |
| **Entry point** | `main.py` |

## What this component does

Module D is the AI workhorse of the platform. It powers the **Interview Simulator** (question generation, rubric answer scoring, real-time webcam emotion detection) and all **document intelligence** (OCR, structured CV extraction, job-post tailoring).

## Environment

| Variable | Purpose | Default |
|---|---|---|
| `OLLAMA_BASE_URL` | Local Ollama native API endpoint. | `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | Locally installed model used for JSON extraction and interview features. | `gemma4:e2b` |
| `FACE_SCALE_FACTOR` | Haar-cascade pyramid step; lower = finds more faces | `1.1` |
| `FACE_MIN_NEIGHBORS` | Detection strictness; lower = more sensitive | `4` |
| `FACE_MIN_SIZE` | Minimum face size in px (rejects noise) | `48` |
| `NEUTRAL_DAMPING` | Multiplier on the "neutral" emotion probability before argmax; lower = more sensitive to real expressions, `1.0` = off | `0.6` |

`run-all.sh` configures the local Ollama endpoint and model automatically. CV text stays on the local machine.

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

1. **Per-page hybrid extraction**: high-quality embedded PDF text is retained; weak or scanned pages are rendered at 300 DPI and OCR'd independently.
2. **Scan recovery**: EXIF orientation correction, upscaling, denoising, CLAHE contrast enhancement, adaptive thresholding, and 90/180/270-degree rotation handling.
3. **Layout recovery**: OCR bounding boxes are reordered into lines and common two-column CV layouts before parsing.
4. **Quality selection**: original, contrast-enhanced, and thresholded candidates are scored using OCR confidence, readable text, and recognised CV headings; the strongest result wins.
5. **Text cleanup**: de-hyphenation, OCR-spacing fixes, URL repair ("github .com/x" → "github.com/x").
6. **Structured parsing**: regex contact extraction followed by chunked LLM parsing. If the model is unavailable, a deterministic heading/skills parser still returns usable sections.
7. **Diagnostics**: `/extract-cv` and `/extract-ocr` return per-page method, confidence, quality, and character counts.

The extracted `raw_text` is stored by the backend (`cvs.extracted_text`) and reused by **Module C** for analysis — Module C cannot OCR on its own.

## Fallback philosophy

Every endpoint keeps the product flow alive: if Ollama is stopped or the selected model is missing, deterministic extraction/questions/scoring fallbacks are returned and the problem is logged.

## Running

```bash
cd python-module-d
ollama serve                                  # if Ollama is not already running
OLLAMA_MODEL=gemma4:e2b ./venv/bin/python main.py
# or via the repo root: ./run-all.sh
```

> ⚠️ No auto-reload — restart the process after code changes. First OCR call downloads EasyOCR weights (slow once).
