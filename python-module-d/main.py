"""
Module D — Interview Q&A Service
Runs on port 8004 by default.

Endpoints:
  POST /generate-questions  — Generate interview questions (optionally from a document)
  POST /analyze-response    — Analyse a candidate's response
  POST /extract-ocr         — Extract text from a base64-encoded PDF or image via EasyOCR
  POST /extract-cv          — Extract and parse CV sections via OCR + GPT-4o-mini
  POST /predict             — Detect face emotion from a base64 JPEG webcam frame
  GET  /interview           — Standalone emotion detector UI
"""

import base64
import io
import json
import logging
import os
import ssl
import tempfile
from functools import lru_cache
from pathlib import Path
from urllib.error import URLError

# Must be set before keras is imported anywhere
os.environ.setdefault("KERAS_BACKEND", "torch")

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
_log = logging.getLogger("module-d")

import certifi
import numpy as np
import uvicorn
from dotenv import dotenv_values, load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
import httpx
from PIL import Image
from pydantic import BaseModel
from pypdf import PdfReader
from docx import Document

app = FastAPI(title="Module D - Interview Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Emotion detection globals ─────────────────────────────────────────────────

_MODELS_DIR = Path(__file__).parent / "models"
_EMOTION_LABELS = ["angry", "disgusted", "fearful", "happy", "neutral", "sad", "surprised"]
_EMOTION_TO_STATE = {
    "angry":     "Stressed",
    "disgusted": "Stressed",
    "fearful":   "Nervous",
    "happy":     "Confident",
    "neutral":   "Neutral",     # neutral is its own state, not "Confident"
    "sad":       "Confused",
    "surprised": "Nervous",
}

# ── Emotion sensitivity tuning ────────────────────────────────────────────────
# FER models are heavily biased toward "neutral", so a plain argmax almost always
# reads neutral → the live state felt stuck on one value and looked insensitive.
# Instead of taking the single top class, `_emotion_state` aggregates the whole
# probability vector into interview states and DISCOUNTS the dominant neutral class
# so subtle expressions surface. Callers dial this via a 0-100 `sensitivity` value
# (see `_sensitivity_to_thresholds`); these are the legacy fixed defaults, still
# used by the standalone /interview demo UI which has no per-session value:
#   NEUTRAL_WEIGHT     fraction of the neutral probability that counts toward
#                      "Neutral" — LOWER = MORE sensitive to other emotions.
#   NEUTRAL_DOMINANCE  if neutral is at least this strong, stay "Neutral" unless an
#                      expressive state clearly shows (prevents flicker/noise).
#   MIN_EXPRESSIVE     minimum aggregated score for a non-neutral state to win.
NEUTRAL_WEIGHT    = 0.45
NEUTRAL_DOMINANCE = 0.70
MIN_EXPRESSIVE    = 0.12


def _sensitivity_to_thresholds(sensitivity: float) -> tuple[float, float, float]:
    """Map a 0-100 UI sensitivity value to (neutral_weight, neutral_dominance, min_expressive).

    50 reproduces the legacy hardcoded defaults exactly. neutral_dominance is kept
    fixed since it only guards against flicker/noise, not "how easily flagged".
    """
    t = max(0.0, min(100.0, sensitivity)) / 100.0
    neutral_weight = 0.70 - 0.50 * t
    min_expressive = 0.20 - 0.16 * t
    return neutral_weight, NEUTRAL_DOMINANCE, min_expressive


def _emotion_state(preds, sensitivity: float = 50.0) -> tuple[str, float]:
    """Map a 7-class emotion probability vector to an interview state.

    Aggregates probability per interview state and discounts the over-dominant
    neutral class so the result tracks subtle expressions instead of always reading
    neutral. Returns (interview_state, confidence_for_that_state).
    """
    neutral_weight, neutral_dominance, min_expressive = _sensitivity_to_thresholds(sensitivity)
    neutral_p = float(preds[_EMOTION_LABELS.index("neutral")])

    scores: dict[str, float] = {}
    for i, p in enumerate(preds):
        emo    = _EMOTION_LABELS[i]
        weight = neutral_weight if emo == "neutral" else 1.0
        state  = _EMOTION_TO_STATE[emo]
        scores[state] = scores.get(state, 0.0) + float(p) * weight

    # Strongest expressive (non-neutral) state.
    expressive = {s: v for s, v in scores.items() if s != "Neutral"}
    top_state, top_score = (max(expressive.items(), key=lambda kv: kv[1])
                            if expressive else ("Neutral", 0.0))

    # Stay Neutral when neutral clearly dominates and nothing expressive crosses the bar.
    if neutral_p >= neutral_dominance and top_score < min_expressive:
        return "Neutral", neutral_p
    # Otherwise the strongest expressive state wins once it clears the noise floor.
    if top_score >= min_expressive:
        return top_state, top_score
    return "Neutral", neutral_p

_emotion_model = None
_face_cascade  = None


@app.on_event("startup")
async def _startup():
    global _emotion_model, _face_cascade

    # Load Keras emotion model (uses torch backend set above)
    try:
        import keras  # type: ignore
        model_path = _MODELS_DIR / "emotion_model.h5"
        _emotion_model = keras.models.load_model(str(model_path))
        _log.info("Emotion model loaded: %d classes", len(_EMOTION_LABELS))
    except Exception as exc:
        _log.warning("Emotion model not loaded (%s) — /predict will return fallback", exc)

    # Load OpenCV face cascade
    try:
        import cv2  # type: ignore
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        _face_cascade = cv2.CascadeClassifier(cascade_path)
        _log.info("Face cascade loaded")
    except Exception as exc:
        _log.warning("Face cascade not loaded: %s", exc)

    # Warm /extract-cv's two slow, previously-lazy dependencies here instead of
    # on the first real upload — EasyOCR's Reader() and Ollama's model load
    # each take tens of seconds on CPU, and stacking both on a real user's
    # first request reliably exceeded the Node backend's timeout (it fell
    # back to an empty result while Module D kept working in the background).
    try:
        _get_ocr_reader()
        _log.info("EasyOCR reader warmed up")
    except Exception as exc:
        _log.warning("EasyOCR warm-up failed (%s) — first /extract-cv call will be slow", exc)

    try:
        _ollama_json("Reply with {\"ok\": true} and nothing else.", max_tokens=16)
        _log.info("Ollama (%s) warmed up", OLLAMA_MODEL)
    except Exception as exc:
        _log.warning("Ollama warm-up failed (%s) — first /extract-cv call will be slow", exc)


def _configure_ssl_ca_bundle() -> None:
    """Force urllib/ssl to use certifi CA bundle to avoid local trust-store issues."""
    cafile = certifi.where()
    os.environ.setdefault("SSL_CERT_FILE", cafile)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", cafile)
    ssl._create_default_https_context = lambda: ssl.create_default_context(
        cafile=cafile)


_configure_ssl_ca_bundle()

import easyocr


@lru_cache(maxsize=1)
def _get_ocr_reader() -> easyocr.Reader:
    """Lazy-load EasyOCR and retry once with certifi CA bundle on SSL failures."""
    try:
        return easyocr.Reader(["en"], gpu=False)
    except URLError as exc:
        # Retry once after forcing certifi bundle in environments with broken system certs.
        reason = getattr(exc, "reason", None)
        if isinstance(reason, ssl.SSLCertVerificationError):
            _configure_ssl_ca_bundle()
            return easyocr.Reader(["en"], gpu=False)
        raise


# Local Ollama endpoint. No cloud token or CV data leaves the machine.
load_dotenv(Path(__file__).parent / ".env")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/").removesuffix("/v1")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma4:12b")


def _ollama_json(prompt: str, max_tokens: int, temperature: float = 0.0) -> dict:
    """Call Ollama's native API so thinking can be disabled reliably."""
    response = httpx.post(
        f"{OLLAMA_BASE_URL}/api/chat",
        json={"model": OLLAMA_MODEL, "messages": [{"role": "user", "content": prompt}],
              "format": "json", "think": False, "stream": False,
              "options": {"temperature": temperature, "num_predict": max_tokens}},
        timeout=120.0,
    )
    response.raise_for_status()
    content = response.json().get("message", {}).get("content", "").strip()
    if not content:
        raise ValueError("Ollama returned empty JSON content")
    return json.loads(content)

DIFFICULTY_LABELS = {1: "very easy", 2: "easy",
                     3: "medium", 4: "hard", 5: "expert"}

# Per-state engagement weights — engagement is computed deterministically from the real
# webcam emotion timeline, never invented by the LLM.
EMOTION_WEIGHTS = {"Engaged": 95, "Confident": 90, "Neutral": 65,
                   "Nervous": 40, "Confused": 35, "Stressed": 30}


def _engagement_summary(emotion_data: dict):
    """Derive (engagement_score, emotion_summary) from the captured emotion timeline.

    Returns (None, ...) when no camera data was sent, so the UI can show "no signal"
    instead of a fabricated number.
    """
    emotion_data = emotion_data or {}
    timeline = emotion_data.get("timeline") or []
    emotions: list[str] = [str(pt["emotion"]) for pt in timeline
                           if isinstance(pt, dict) and pt.get("emotion")]
    # Fall back to a single dominant snapshot if no timeline was provided.
    if not emotions and emotion_data.get("dominant"):
        emotions = [str(emotion_data["dominant"])]
    if not emotions:
        return None, {"dominant": None, "distribution": {}}

    counts: dict[str, int] = {}
    for e in emotions:
        counts[e] = counts.get(e, 0) + 1
    total = len(emotions)
    distribution = {e: round(c / total * 100) for e, c in counts.items()}
    dominant = max(counts, key=lambda k: counts[k])
    score = round(sum(EMOTION_WEIGHTS.get(e, 60) for e in emotions) / total)
    return max(0, min(100, score)), {"dominant": dominant, "distribution": distribution}


def _heuristic_score(text: str) -> int:
    """Length-based fallback score so a session never dies when the LLM is unavailable."""
    words = len((text or "").split())
    if words == 0:
        return 0
    return max(20, min(85, 30 + words // 2))


# ── Pydantic schemas ─────────────────────────────────────────────────────────

class GenerateQuestionsRequest(BaseModel):
    session_id: str
    topic: str
    difficulty: int = 3
    skills: list[str] = []
    document_text: str = ""


class AnalyseResponseRequest(BaseModel):
    question_id: str
    response_text: str = ""
    question_text: str = ""           # the question being answered (for context-aware scoring)
    question_type: str = ""           # behavioral | technical | situational
    topic: str = ""                   # interview topic, e.g. "React"
    difficulty: int = 3               # 1–5
    emotion_data: dict = {}


class ExtractOcrRequest(BaseModel):
    file_b64: str
    mimetype: str  # application/pdf | image/png | image/jpeg | text/plain


class TailorCvRequest(BaseModel):
    sections: dict = {}   # cv_sections rows keyed by section_type, from the Node backend
    job_text: str = ""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pdf_to_images(pdf_bytes: bytes) -> list[Image.Image]:
    """Convert each page of a PDF to a PIL Image using pdf2image (poppler)."""
    from pdf2image import convert_from_bytes  # lazy import — only needed for PDFs
    return convert_from_bytes(pdf_bytes)


def _ocr_images(images: list[Image.Image]) -> str:
    try:
        reader = _get_ocr_reader()
    except Exception as exc:
        _log.warning("EasyOCR init failed: %s", exc)
        return ""

    texts = []
    for img in images:
        try:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                img.save(tmp.name)
                try:
                    results = reader.readtext(tmp.name, detail=0)
                finally:
                    os.unlink(tmp.name)
            texts.append(" ".join(results))
        except Exception as exc:
            _log.warning("OCR failed for image: %s", exc)
            texts.append("")
    return "\n".join(texts)


def _generate_questions_with_ollama(topic: str, difficulty: int, skills: list[str], document_text: str) -> list[dict]:
    difficulty_label = DIFFICULTY_LABELS.get(difficulty, "medium")
    skills_note = f" The candidate has these skills: {', '.join(skills)}." if skills else ""
    doc_context = (
        f"\n\nThe candidate provided the following document as context. "
        f"Use it to create highly relevant questions:\n---\n{document_text[:4000]}\n---"
        if document_text.strip()
        else ""
    )

    prompt = (
        f"You are an expert technical interviewer. Generate exactly 5 {difficulty_label} interview questions "
        f"about \"{topic}\".{skills_note}{doc_context}\n\n"
        "Return ONLY valid JSON in this exact format — no markdown, no extra text:\n"
        '{"questions": [{"text": "...", "type": "behavioral|technical|situational", "difficulty": 1-5}]}'
    )

    return _ollama_json(prompt, max_tokens=1024, temperature=0.7)["questions"]


def _sections_to_text(sections: dict) -> str:
    """Flatten cv_sections content (keyed by section_type) into readable text
    for the tailoring prompt. Mirrors the Node backend's own field-shape
    assumptions (backend/src/services/cv.service.ts getCvText()) exactly, so
    Module D sees the same CV content the app itself already renders."""
    parts: list[str] = []

    summary = sections.get("summary") or {}
    if summary.get("text"):
        parts.append(f"Summary\n{summary['text']}")

    for e in (sections.get("experience") or {}).get("entries") or []:
        bullets = "\n".join(e.get("bullets") or [])
        parts.append(
            f"Experience: {e.get('role', '')} at {e.get('company', '')} "
            f"({e.get('start_date', '')} - {e.get('end_date', '')})\n{bullets}"
        )

    for e in (sections.get("education") or {}).get("entries") or []:
        parts.append(
            f"Education: {e.get('degree', '')} {e.get('field', '')}, {e.get('institution', '')} "
            f"({e.get('start_date', '')} - {e.get('end_date', '')})"
        )

    skills = (sections.get("skills") or {}).get("skills") or {}
    all_skills = [
        *(skills.get("languages") or []), *(skills.get("frameworks") or []),
        *(skills.get("tools") or []), *(skills.get("other") or []),
    ]
    if all_skills:
        parts.append(f"Skills: {', '.join(all_skills)}")

    for p in (sections.get("projects") or {}).get("entries") or []:
        tech = ", ".join(p.get("tech_stack") or [])
        parts.append(f"Project: {p.get('name', '')} — {p.get('description', '')} ({tech})")

    return "\n\n".join(parts)


def _tailor_cv_with_ollama(sections: dict, job_text: str) -> dict:
    cv_text = _sections_to_text(sections)
    prompt = (
        "You are a career coach helping a candidate tailor their CV for a specific job posting. "
        "Read the candidate CV and the job posting below, then suggest concrete improvements "
        "that would make the CV a stronger match for this job. Base every suggestion only on "
        "experience the candidate actually has in the CV below — never invent skills or "
        "experience they do not have.\n\n"
        f"Candidate CV:\n---\n{cv_text[:4000]}\n---\n\n"
        f"Job posting:\n---\n{job_text[:3000]}\n---\n\n"
        "Return ONLY valid JSON in this exact format — no markdown, no extra text:\n"
        '{"tailored_summary": "<a rewritten 2-3 sentence professional summary aimed at this job, '
        'using only real experience from the CV above>", '
        '"suggestions": [{"section": "summary|experience|skills|projects", '
        '"issue": "<what is weak or missing for this job>", '
        '"fix_example": "<a concrete rewritten line using the candidate real experience>"}], '
        '"keywords_to_add": ["<a real term from the job posting that is missing from the CV>"]}'
    )
    return _ollama_json(prompt, max_tokens=800, temperature=0.3)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/generate-questions")
def generate_questions(req: GenerateQuestionsRequest):
    try:
        questions = _generate_questions_with_ollama(
            req.topic, req.difficulty, req.skills, req.document_text
        )
        return {"questions": questions}
    except Exception as exc:
        _log.warning("Ollama question generation unavailable, using fallback: %s", exc)
        difficulty = req.difficulty
        return {"questions": [
            {"text": f"Explain your experience with {req.topic} development.", "type": "behavioral", "difficulty": difficulty},
            {"text": f"Describe the most complex {req.topic} project you have built.", "type": "situational", "difficulty": difficulty},
            {"text": f"What design patterns do you commonly use in {req.topic}?", "type": "technical", "difficulty": difficulty},
            {"text": f"How do you handle performance optimisation in {req.topic}?", "type": "technical", "difficulty": difficulty},
            {"text": f"Describe a time you debugged a critical issue in {req.topic}.", "type": "behavioral", "difficulty": difficulty},
        ], "generation_mode": "deterministic", "ollama_unavailable": True}


@app.post("/tailor-cv")
def tailor_cv(req: TailorCvRequest):
    try:
        data = _tailor_cv_with_ollama(req.sections, req.job_text)
        data.setdefault("tailored_summary", "")
        data.setdefault("suggestions", [])
        data.setdefault("keywords_to_add", [])
        if not isinstance(data["suggestions"], list):
            data["suggestions"] = []
        if not isinstance(data["keywords_to_add"], list):
            data["keywords_to_add"] = []
        return data
    except Exception as exc:
        _log.warning("tailor-cv LLM unavailable, using empty fallback: %s", exc)
        return {"tailored_summary": "", "suggestions": [], "keywords_to_add": []}


@app.post("/extract-ocr")
def extract_ocr(req: ExtractOcrRequest):
    try:
        file_bytes = base64.b64decode(req.file_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 payload.")

    diagnostics = {"mimetype": req.mimetype, "pages": []}
    text = _extract_raw_text(file_bytes, req.mimetype, diagnostics)
    diagnostics["characters"] = len(text)
    diagnostics["quality"] = _text_quality(text)
    return {"text": text, "extraction": diagnostics}


class ExtractCvRequest(BaseModel):
    file_b64: str
    mimetype: str


import re as _re

# ── Text extraction helpers ───────────────────────────────────────────────────

def _clean_extracted_text(text: str) -> str:
    """
    Normalise OCR/PDF-extracted text before sending to the LLM.
    - Collapse runs of blank lines into a single blank line
    - Fix missing spaces after punctuation (OCR artefact: "Company.Role" → "Company. Role")
    - Normalise whitespace within lines while preserving line breaks
    - Remove soft-hyphen line-wrap artefacts
    """
    # Remove soft hyphens / line-continuation hyphens at end of line
    text = _re.sub(r"-\n(\w)", r"\1", text)
    # Fix "word.Word" → "word. Word" (period missing space, common in pypdf output)
    text = _re.sub(r"([a-z])\.([A-Z])", r"\1. \2", text)
    # Normalise horizontal whitespace within lines
    lines = [" ".join(ln.split()) for ln in text.splitlines()]
    # Collapse 3+ consecutive blank lines into 2
    cleaned: list[str] = []
    blank_count = 0
    for ln in lines:
        if ln == "":
            blank_count += 1
            if blank_count <= 2:
                cleaned.append(ln)
        else:
            blank_count = 0
            cleaned.append(ln)
    return "\n".join(cleaned).strip()


def _text_quality(text: str) -> float:
    """Score OCR usefulness, penalising garbage while rewarding CV-like text."""
    text = (text or "").strip()
    if not text:
        return 0.0
    chars = len(text)
    printable = sum(ch.isalnum() or ch.isspace() or ch in "@.,:/+#&()-•" for ch in text) / chars
    words = _re.findall(r"[A-Za-z][A-Za-z0-9+#.-]{1,}", text)
    alpha_words = sum(any(c.isalpha() for c in word) for word in words)
    headings = sum(bool(_re.search(rf"\b{h}\b", text, _re.I)) for h in
                   ("experience", "education", "skills", "projects", "summary", "profile"))
    return round(printable * 45 + min(alpha_words, 250) / 250 * 35 + min(headings, 4) / 4 * 20, 2)


def _prepare_ocr_variants(image: Image.Image) -> list[tuple[str, Image.Image]]:
    """Create high-resolution and contrast-enhanced variants for difficult scans."""
    import cv2
    from PIL import ImageOps

    image = ImageOps.exif_transpose(image).convert("RGB")
    w, h = image.size
    target_width = min(2600, max(1600, w))
    if w < target_width:
        scale = target_width / max(1, w)
        image = image.resize((target_width, int(h * scale)), Image.Resampling.LANCZOS)
    rgb = np.array(image)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    gray = cv2.fastNlMeansDenoising(gray, None, 8, 7, 21)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)
    adaptive = cv2.adaptiveThreshold(clahe, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                     cv2.THRESH_BINARY, 31, 12)
    return [("original", image), ("contrast", Image.fromarray(clahe)),
            ("adaptive", Image.fromarray(adaptive))]


def _order_ocr_results(results: list) -> tuple[str, float]:
    """Restore reading order from EasyOCR boxes, including common two-column CVs."""
    items = []
    confidences = []
    for box, text, confidence in results:
        if not str(text).strip():
            continue
        x = min(point[0] for point in box)
        y = min(point[1] for point in box)
        height = max(point[1] for point in box) - y
        items.append((float(x), float(y), max(float(height), 1.0), str(text).strip()))
        confidences.append(float(confidence))
    if not items:
        return "", 0.0
    max_x = max(x for x, _, _, _ in items)
    min_x = min(x for x, _, _, _ in items)
    midpoint = min_x + (max_x - min_x) / 2
    left = [item for item in items if item[0] <= midpoint]
    right = [item for item in items if item[0] > midpoint]
    # Treat as columns only when both sides contain substantial content.
    groups = [items]
    if len(left) >= 4 and len(right) >= 4:
        groups = [left, right]
    lines = []
    for group in groups:
        group.sort(key=lambda item: (round(item[1] / max(item[2], 10)), item[0]))
        current_y = None
        current = []
        current_h = 12.0
        for x, y, height, value in group:
            if current_y is None or abs(y - current_y) <= max(current_h, height) * .65:
                current.append((x, value)); current_y = y if current_y is None else (current_y + y) / 2
                current_h = max(current_h, height)
            else:
                lines.append(" ".join(v for _, v in sorted(current)))
                current, current_y, current_h = [(x, value)], y, height
        if current:
            lines.append(" ".join(v for _, v in sorted(current)))
        if group is not groups[-1]:
            lines.append("")
    return "\n".join(lines), sum(confidences) / len(confidences)


def _ocr_image_advanced(image: Image.Image) -> tuple[str, dict]:
    reader = _get_ocr_reader()
    candidates = []
    for variant_name, variant in _prepare_ocr_variants(image):
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            try:
                variant.save(tmp.name)
                results = reader.readtext(tmp.name, detail=1, paragraph=False,
                                          rotation_info=[90, 180, 270],
                                          decoder="beamsearch", beamWidth=5,
                                          contrast_ths=0.05, adjust_contrast=0.7,
                                          text_threshold=0.55, low_text=0.3)
                text, confidence = _order_ocr_results(results)
                cleaned = _clean_extracted_text(text)
                score = _text_quality(cleaned) * .8 + confidence * 20
                candidates.append((score, cleaned, variant_name, confidence))
            finally:
                try: os.unlink(tmp.name)
                except OSError: pass
    score, text, variant, confidence = max(candidates, default=(0, "", "none", 0), key=lambda x: x[0])
    return text, {"method": f"easyocr-{variant}", "confidence": round(confidence, 3),
                  "quality": round(_text_quality(text), 2), "characters": len(text)}


def _normalise_for_links(text: str) -> str:
    """Remove spaces that OCR inserts into URLs (e.g. 'github .com' → 'github.com')."""
    text = _re.sub(r"(\w)\s+\.\s*(\w)", r"\1.\2", text)
    text = _re.sub(r"(\w)\.\s+(\w)", r"\1.\2", text)
    text = _re.sub(r"(/)\s+(\w)", r"\1\2", text)
    return text


def _ensure_https(url: str) -> str:
    return url if url.startswith("http") else "https://" + url


def _search_github(src: str) -> str:
    m = _re.search(r"(https?://)?(?:www\.)?github\.com/[\w\-]+(?:/[\w\-\.]+)*", src, _re.I)
    return _ensure_https(m.group(0).rstrip(".,;)")) if m else ""


def _search_linkedin(src: str) -> str:
    m = _re.search(r"(https?://)?(?:www\.)?linkedin\.com/in/[\w\-]+(?:/[\w\-]*)?", src, _re.I)
    return _ensure_https(m.group(0).rstrip(".,;)")) if m else ""


def _search_portfolio(src: str) -> str:
    for m in _re.finditer(r"https?://[^\s\"'><\]\[]+", src, _re.I):
        url = m.group(0).rstrip(".,;)")
        low = url.lower()
        if "github.com" not in low and "linkedin.com" not in low:
            return url
    return ""


def _pre_extract_links(text: str) -> dict:
    """
    Reliably extract contact info with regex BEFORE sending to the LLM.
    Runs on both the original and a space-normalised copy so OCR artefacts
    like 'github .com/user' and 'linkedin. com/in/user' are still matched.
    """
    links: dict[str, str] = {"github": "", "linkedin": "", "portfolio": "", "email": "", "phone": ""}
    normalised = _normalise_for_links(text)

    for src in (text, normalised):
        if not links["github"]:
            links["github"] = _search_github(src)
        if not links["linkedin"]:
            links["linkedin"] = _search_linkedin(src)
        if not links["portfolio"]:
            links["portfolio"] = _search_portfolio(src)

    em = _re.search(r"[\w.\-+]+@[\w.\-]+\.[a-zA-Z]{2,}", text)
    if em:
        links["email"] = em.group(0)

    ph = _re.search(
        r"(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}",
        text,
    )
    if ph:
        links["phone"] = ph.group(0).strip()

    _log.info("pre-extracted links: %s", {k: v for k, v in links.items() if v})
    return links


def _looks_letter_spaced(text: str) -> bool:
    """Some PDF export pipelines position every glyph individually, which
    pypdf then extracts as a space between every letter ('D U L I N A')
    while still using a wider gap at real word boundaries."""
    tokens = [t for t in text.split(" ") if t]
    if len(tokens) < 10:
        return False
    single_char = sum(1 for t in tokens if len(t) == 1)
    return single_char / len(tokens) > 0.4


def _collapse_letter_spacing(text: str) -> str:
    """Detect letter-spaced text and collapse it back into words, using
    runs of 2+ spaces (the real word-boundary signal in this export
    format) as the split point. Ordinary text is returned unchanged. Must
    run before _clean_extracted_text, whose whitespace normalization would
    collapse multi-space runs and destroy that signal."""
    if not _looks_letter_spaced(text):
        return text

    lines_out = []
    for line in text.splitlines():
        chunks = _re.split(r" {2,}", line)
        lines_out.append(" ".join(chunk.replace(" ", "") for chunk in chunks))

    return "\n".join(lines_out)


def _pypdf_extract_pages(file_bytes: bytes) -> list[str]:
    """Extract text from a text-based PDF using pypdf.
    Tries both 'layout' and 'plain' modes and returns whichever scores
    higher on _text_quality (after collapsing letter-spacing artifacts, if
    any, so quality scoring sees real words)."""
    reader = PdfReader(io.BytesIO(file_bytes))
    pages: list[str] = []
    for page in reader.pages:
        candidates = []
        for mode in ("layout", "plain"):
            try:
                candidates.append(page.extract_text(extraction_mode=mode) or "")  # type: ignore[call-arg]
            except Exception:
                candidates.append(page.extract_text() or "")
        candidates = [_collapse_letter_spacing(c) for c in candidates]
        pages.append(max(candidates, key=_text_quality, default=""))
    return pages


def _pdf2image_ocr(file_bytes: bytes) -> str:
    """Render PDF pages to images via poppler then OCR each page."""
    from pdf2image import convert_from_bytes  # requires poppler
    images = convert_from_bytes(file_bytes, dpi=300)
    return _ocr_images(images)


def _render_pdf_pages(file_bytes: bytes) -> list[Image.Image]:
    from pdf2image import convert_from_bytes
    return convert_from_bytes(file_bytes, dpi=300, fmt="png", thread_count=2,
                              grayscale=False, use_pdftocairo=True)


def _extract_embedded_images(file_bytes: bytes) -> list[Image.Image]:
    """Extract embedded XObject images from each PDF page using pypdf."""
    from pypdf import PdfReader as _PR
    reader = _PR(io.BytesIO(file_bytes))
    images: list[Image.Image] = []
    for page in reader.pages:
        resources = page.get("/Resources")
        if not resources or "/XObject" not in resources:
            continue
        for obj in resources["/XObject"].get_object().values():
            obj = obj.get_object()
            if obj.get("/Subtype") == "/Image":
                try:
                    images.append(Image.open(io.BytesIO(obj.get_data())))
                except Exception:
                    pass
    return images


def _extract_pdf_text(file_bytes: bytes, diagnostics: dict | None = None) -> str:
    """Extract text from a PDF with layered fallbacks and detailed logging."""
    # Path 1: pypdf direct text extraction (works for text-based PDFs)
    direct_pages = []
    try:
        direct_pages = _pypdf_extract_pages(file_bytes)
    except Exception as exc:
        _log.warning("pypdf failed: %s", exc)
    page_results = []
    try:
        rendered = _render_pdf_pages(file_bytes)
        page_count = max(len(rendered), len(direct_pages))
        for index in range(page_count):
            direct = _clean_extracted_text(direct_pages[index]) if index < len(direct_pages) else ""
            direct_quality = _text_quality(direct)
            # Good embedded text is more accurate; OCR only weak/missing pages.
            if direct_quality >= 55 and len(direct) >= 120:
                selected, meta = direct, {"method": "pypdf", "quality": direct_quality,
                                           "confidence": 1.0, "characters": len(direct)}
            else:
                ocr, ocr_meta = _ocr_image_advanced(rendered[index])
                selected, meta = (ocr, ocr_meta) if _text_quality(ocr) > direct_quality else (
                    direct, {"method": "pypdf", "quality": direct_quality,
                             "confidence": 1.0, "characters": len(direct)})
            page_results.append(selected)
            meta["page"] = index + 1
            diagnostics.setdefault("pages", []).append(meta) if diagnostics is not None else None
    except Exception as exc:
        _log.warning("hybrid PDF OCR failed: %s", exc)
        page_results = [_clean_extracted_text(page) for page in direct_pages]
    text = _clean_extracted_text("\n\n".join(page_results))
    _log.info("hybrid PDF extraction produced %d chars across %d pages", len(text), len(page_results))
    return text


def _extract_image_text(file_bytes: bytes, diagnostics: dict | None = None) -> str:
    """OCR an image, upscaling first if it is too small for accurate recognition."""
    text, meta = _ocr_image_advanced(Image.open(io.BytesIO(file_bytes)))
    if diagnostics is not None:
        diagnostics.setdefault("pages", []).append({"page": 1, **meta})
    return text


def _extract_raw_text(file_bytes: bytes, mimetype: str, diagnostics: dict | None = None) -> str:
    """Dispatch to the correct extractor based on MIME type."""
    mimetype = mimetype.lower()
    if mimetype == "text/plain":
        return file_bytes.decode("utf-8", errors="replace")
    if mimetype == "application/pdf":
        return _extract_pdf_text(file_bytes, diagnostics)
    if mimetype == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        document = Document(io.BytesIO(file_bytes))
        text = "\n".join(paragraph.text for paragraph in document.paragraphs)
        if diagnostics is not None:
            diagnostics.setdefault("pages", []).append({"page": 1, "method": "python-docx", "confidence": 1.0,
                                                         "quality": _text_quality(text), "characters": len(text)})
        return _clean_extracted_text(text)
    if mimetype in ("image/png", "image/jpeg", "image/jpg"):
        return _extract_image_text(file_bytes, diagnostics)
    raise HTTPException(status_code=400, detail=f"Unsupported mimetype: {mimetype}")


def _llm_call(prompt: str, max_tokens: int = 4000) -> str:
    """Call local Ollama and strip markdown fences from the response."""
    return json.dumps(_ollama_json(prompt, max_tokens=max_tokens, temperature=0.0))


_CV_SCHEMA = (
    "{\n"
    '  "summary": "string",\n'
    '  "experience": [\n'
    '    {"company": "", "role": "", "start_date": "", "end_date": "", "location": "", "bullets": ["..."]}\n'
    "  ],\n"
    '  "education": [\n'
    '    {"institution": "", "degree": "", "field": "", "start_date": "", "end_date": "", "grade": ""}\n'
    "  ],\n"
    '  "skills": {"languages": [], "frameworks": [], "tools": [], "other": []},\n'
    '  "projects": [\n'
    '    {"name": "", "description": "", "tech_stack": [], "url": "", "start_date": "", "end_date": ""}\n'
    "  ]\n"
    "}"
)

_CV_RULES = (
    "Rules (follow exactly):\n"
    "- Do NOT skip any job, education, or project entry — include every one you find\n"
    "- experience[].company: exact company name as written\n"
    "- experience[].role: exact job title as written\n"
    "- experience[].start_date / end_date: keep original format (e.g. 'Jan 2022', '2022-01', 'March 2021'); use 'Present' if current\n"
    "- experience[].bullets: split each achievement/responsibility into a separate string; remove leading '•', '-', '*' characters\n"
    "- education[].institution: full institution name\n"
    "- education[].degree: degree type (BSc, MSc, BEng, etc.)\n"
    "- education[].field: subject/major\n"
    "- education[].grade: GPA, percentage, or classification if present\n"
    "- skills.languages: ONLY programming/scripting languages (Python, JavaScript, Java, SQL, etc.)\n"
    "- skills.frameworks: libraries, frameworks (React, Django, Spring, etc.)\n"
    "- skills.tools: tools, platforms, services, DevOps, cloud (Git, Docker, AWS, Jira, etc.)\n"
    "- skills.other: soft skills, methodologies, or anything that doesn't fit above\n"
    "- projects[].tech_stack: every technology mentioned for that project as separate strings\n"
    "- projects[].url: project URL or repository link if present\n"
    '- If a field is absent use "" for strings, [] for arrays\n'
    "- Use 'Present' for ongoing roles — NEVER leave end_date blank for current jobs\n"
    "- Output ONLY the JSON object — no markdown, no explanation\n"
)

_CHUNK_MAX  = 8000
_CHUNK_OVERLAP = 500

_FALLBACK_HEADERS = {
    "summary": "summary", "profile": "summary", "professional summary": "summary", "objective": "summary",
    "experience": "experience", "work experience": "experience", "professional experience": "experience",
    "employment history": "experience", "education": "education", "academic background": "education",
    "skills": "skills", "technical skills": "skills", "core competencies": "skills",
    "projects": "projects", "personal projects": "projects", "key projects": "projects",
}
_KNOWN_LANGUAGES = {"python", "java", "javascript", "typescript", "c", "c++", "c#", "go", "rust", "ruby", "php", "swift", "kotlin", "dart", "sql", "r"}
_KNOWN_FRAMEWORKS = {"react", "angular", "vue", "next.js", "node.js", "express", "django", "flask", "fastapi", "spring", "spring boot", "tensorflow", "pytorch", "scikit-learn", "laravel", ".net"}
_KNOWN_TOOLS = {"git", "github", "docker", "kubernetes", "aws", "azure", "gcp", "jira", "linux", "postman", "figma", "tableau", "power bi", "mongodb", "postgresql", "mysql"}


def _normalise_heading(line: str) -> str:
    return _re.sub(r"[^a-z ]", "", line.lower()).strip()


def _split_skill_values(text: str) -> list[str]:
    values = _re.split(r"[,|•·;/]+|\s{2,}", text)
    return [value.strip(" :-\t") for value in values if 1 < len(value.strip(" :-\t")) < 60]


def _parse_cv_sections_fallback(raw_text: str, links: dict) -> dict:
    """Conservative section parser used when the LLM is missing or rejects auth."""
    buckets: dict[str, list[str]] = {name: [] for name in ("summary", "experience", "education", "skills", "projects")}
    current = "summary"
    for raw_line in raw_text.splitlines():
        line = raw_line.strip(" \t•*-–—")
        if not line:
            continue
        heading = _normalise_heading(line.rstrip(":"))
        matched = _FALLBACK_HEADERS.get(heading)
        if matched:
            current = matched
            continue
        buckets[current].append(line)

    skill_values = _split_skill_values("\n".join(buckets["skills"]))
    skills = {"languages": [], "frameworks": [], "tools": [], "other": []}
    for value in skill_values:
        low = value.lower()
        category = "languages" if low in _KNOWN_LANGUAGES else "frameworks" if low in _KNOWN_FRAMEWORKS else "tools" if low in _KNOWN_TOOLS else "other"
        if value.lower() not in {v.lower() for v in skills[category]}:
            skills[category].append(value)

    date_range = _re.compile(r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?[a-z]*\s*\d{4}\s*(?:-|–|—|to)\s*(?:present|current|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?[a-z]*\s*\d{4})", _re.I)
    experience = []
    pending: list[str] = []
    for line in buckets["experience"]:
        if date_range.search(line) and pending:
            header = pending.pop(0)
            experience.append({"company": "", "role": header, "start_date": "", "end_date": "",
                               "location": "", "bullets": pending})
            pending = [line]
        else:
            pending.append(line)
    if pending:
        experience.append({"company": "", "role": pending[0], "start_date": "", "end_date": "",
                           "location": "", "bullets": pending[1:]})

    education = [{"institution": line, "degree": "", "field": "", "start_date": "", "end_date": "", "grade": ""}
                 for line in buckets["education"][:8]]
    projects = [{"name": line[:100], "description": line, "tech_stack": [], "url": "", "start_date": "", "end_date": ""}
                for line in buckets["projects"][:10]]
    return {"links": links, "summary": " ".join(buckets["summary"])[:1200], "experience": experience,
            "education": education, "skills": skills, "projects": projects}


def _split_into_chunks(text: str) -> list[str]:
    """Split text into overlapping chunks that break on newline boundaries."""
    if len(text) <= _CHUNK_MAX:
        return [text]
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = start + _CHUNK_MAX
        if end < len(text):
            boundary = text.rfind("\n", start + _CHUNK_MAX - _CHUNK_OVERLAP, end)
            if boundary > start:
                end = boundary
        chunks.append(text[start:end])
        start = end - _CHUNK_OVERLAP if end < len(text) else len(text)
    return chunks


def _parse_cv_sections_with_llm(raw_text: str, pre_links: dict) -> dict:
    """Chunk the CV text, parse each chunk with the LLM, and merge results."""
    empty: dict = {
        "links": pre_links, "summary": "", "experience": [],
        "education": [], "skills": {"languages": [], "frameworks": [], "tools": [], "other": []},
        "projects": [],
    }
    chunks = _split_into_chunks(raw_text)
    chunk_results = [
        r for r in (
            _parse_chunk(chunk, i, len(chunks), pre_links, _CV_SCHEMA, _CV_RULES)
            for i, chunk in enumerate(chunks)
        )
        if r
    ]
    if not chunk_results:
        _log.warning("LLM CV parsing unavailable; using deterministic section parser")
        return _parse_cv_sections_fallback(raw_text, pre_links)
    return _merge_chunk_results(chunk_results, pre_links)


def _build_chunk_prompt(chunk: str, index: int, total: int, pre_links: dict, schema: str, rules: str) -> str:
    known = (
        f"The following contact details were already extracted — do NOT re-extract them:\n"
        f"  GitHub: {pre_links.get('github') or 'not found'}\n"
        f"  LinkedIn: {pre_links.get('linkedin') or 'not found'}\n"
        f"  Email: {pre_links.get('email') or 'not found'}\n\n"
    )
    return (
        f"You are a precise CV parser. This is chunk {index+1} of {total} of a CV.\n\n"
        + known
        + f"Return ONLY valid JSON matching this schema:\n{schema}\n\n"
        + rules
        + f"\nCV TEXT (chunk {index+1}/{total}):\n---\n{chunk}\n---"
    )


def _parse_chunk(chunk: str, index: int, total: int, pre_links: dict, schema: str, rules: str) -> dict | None:
    """Call the LLM for one chunk, retrying once on JSON parse failure."""
    prompt = _build_chunk_prompt(chunk, index, total, pre_links, schema, rules)
    for attempt in range(2):
        try:
            return json.loads(_llm_call(prompt, max_tokens=4000))
        except Exception:
            if attempt == 0:
                prompt = prompt.replace(
                    "Return ONLY valid JSON",
                    "IMPORTANT: your previous response was not valid JSON. Return ONLY valid JSON",
                )
    return None


def _merge_unique(entries: list[dict], seen: set[str], key_fn) -> list[dict]:
    """Append entries whose key is not already in seen; update seen in place."""
    result = []
    for entry in entries:
        key = key_fn(entry)
        if key and key not in seen:
            seen.add(key)
            result.append(entry)
    return result


def _merge_skills(merged_skills: dict, new_skills: dict) -> None:
    """Merge new_skills into merged_skills, deduplicating case-insensitively."""
    for cat in ("languages", "frameworks", "tools", "other"):
        existing = {s.lower() for s in merged_skills[cat]}
        for sk in new_skills.get(cat, []):
            if sk.lower() not in existing:
                merged_skills[cat].append(sk)
                existing.add(sk.lower())


def _merge_chunk_results(chunk_results: list[dict], pre_links: dict) -> dict:
    """Combine parsed chunks into a single deduplicated result."""
    merged: dict = {
        "links":      pre_links,
        "summary":    "",
        "experience": [],
        "education":  [],
        "skills":     {"languages": [], "frameworks": [], "tools": [], "other": []},
        "projects":   [],
    }
    seen_exp:  set[str] = set()
    seen_edu:  set[str] = set()
    seen_proj: set[str] = set()

    for result in chunk_results:
        if not merged["summary"] and result.get("summary"):
            merged["summary"] = result["summary"]

        merged["experience"] += _merge_unique(
            result.get("experience", []), seen_exp,
            lambda e: (e.get("company", "") + e.get("role", "")).lower().strip(),
        )
        merged["education"] += _merge_unique(
            result.get("education", []), seen_edu,
            lambda e: (e.get("institution", "") + e.get("degree", "")).lower().strip(),
        )
        merged["projects"] += _merge_unique(
            result.get("projects", []), seen_proj,
            lambda e: e.get("name", "").lower().strip(),
        )
        _merge_skills(merged["skills"], result.get("skills", {}))

    return merged


@app.post("/extract-cv")
def extract_cv(req: ExtractCvRequest):
    """Extract and parse a CV into structured sections using EasyOCR + GPT-4o-mini."""
    try:
        file_bytes = base64.b64decode(req.file_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 payload.")

    diagnostics = {"mimetype": req.mimetype, "pages": []}
    raw_text = _extract_raw_text(file_bytes, req.mimetype, diagnostics)
    if not raw_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract any text from the file.")

    pre_links = _pre_extract_links(raw_text)
    sections = _parse_cv_sections_with_llm(raw_text, pre_links)
    diagnostics["characters"] = len(raw_text)
    diagnostics["quality"] = _text_quality(raw_text)
    diagnostics["structured_counts"] = {
        "experience": len(sections.get("experience", [])), "education": len(sections.get("education", [])),
        "skills": sum(len(v) for v in sections.get("skills", {}).values()), "projects": len(sections.get("projects", [])),
    }
    return {
        "raw_text": raw_text,
        "sections": sections,
        "extraction": diagnostics,
    }


CRITERIA_KEYS = ("relevance", "technical_accuracy", "depth", "structure", "communication")


def _scoring_fallback(req: AnalyseResponseRequest, engagement_score, emotion_summary, note: str):
    """Deterministic response used when the LLM is unavailable, so a session never dies."""
    return {
        "score": _heuristic_score(req.response_text),
        "feedback": note,
        "criteria": {},
        "strengths": [],
        "improvements": [],
        "model_answer": "",
        "engagement_score": engagement_score,
        "emotion_summary": emotion_summary,
    }


@app.post("/analyze-response")
def analyze_response(req: AnalyseResponseRequest):
    # Engagement is computed from the real webcam timeline — the LLM never invents it.
    engagement_score, emotion_summary = _engagement_summary(req.emotion_data)

    try:
        difficulty_label = DIFFICULTY_LABELS.get(int(req.difficulty or 3), "medium")
        prompt = (
            "You are a senior technical interviewer. Evaluate the candidate's answer to THIS "
            "question. Judge relevance to the question first, then technical accuracy, depth, "
            "structure, and communication. An empty or off-topic answer must score below 40. "
            "Reward concrete, correct, well-structured answers.\n\n"
            f"Topic: {req.topic or 'general'}\n"
            f"Question type: {req.question_type or 'general'}\n"
            f"Difficulty: {difficulty_label}\n"
            f"Question: \"{req.question_text}\"\n"
            f"Candidate answer: \"{req.response_text}\"\n\n"
            "Respond with JSON of exactly this shape:\n"
            '{"score": <0-100 overall>, '
            '"feedback": "<2-3 sentences, specific and actionable>", '
            '"criteria": {"relevance": <0-100>, "technical_accuracy": <0-100>, "depth": <0-100>, '
            '"structure": <0-100>, "communication": <0-100>}, '
            '"strengths": ["<short point>"], "improvements": ["<short point>"], '
            '"model_answer": "<a strong, concise example answer>"}'
        )
        data = _ollama_json(prompt, max_tokens=700, temperature=0.3)

        # Clamp the overall score and every criterion to 0–100.
        if isinstance(data.get("score"), (int, float)):
            data["score"] = max(0, min(100, round(float(data["score"]))))
        criteria = data.get("criteria")
        if isinstance(criteria, dict):
            data["criteria"] = {
                k: max(0, min(100, round(float(v))))
                for k, v in criteria.items() if k in CRITERIA_KEYS and isinstance(v, (int, float))
            }

        # Engagement is ours, not the model's.
        data["engagement_score"] = engagement_score
        data["emotion_summary"] = emotion_summary
        data.setdefault("strengths", [])
        data.setdefault("improvements", [])
        data.setdefault("model_answer", "")
        return data
    except Exception as exc:
        _log.warning("analyze-response LLM failed, using heuristic fallback: %s", exc)
        return _scoring_fallback(
            req, engagement_score, emotion_summary,
            "Scored automatically (AI unavailable). Add specific examples and structure your answer toward a clear outcome.",
        )


class PredictRequest(BaseModel):
    frame: str  # base64-encoded JPEG from the browser webcam
    sensitivity: float = 50.0  # 0-100 UI slider value; 50 = legacy hardcoded defaults


@app.post("/predict")
def predict(req: PredictRequest):
    """Accept a base64 JPEG frame, detect face, run Keras emotion model."""
    _fallback = {"face": False, "interview_state": "Neutral", "confidence": 0.0, "probs": {}, "bbox": None}

    if _emotion_model is None or _face_cascade is None:
        return _fallback

    try:
        import cv2  # type: ignore

        img_bytes = base64.b64decode(req.frame)
        np_arr    = np.frombuffer(img_bytes, np.uint8)
        frame     = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return _fallback

        gray  = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = _face_cascade.detectMultiScale(
            gray, scaleFactor=1.1, minNeighbors=5, minSize=(48, 48)
        )

        if len(faces) == 0:
            return _fallback

        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        roi = gray[y : y + h, x : x + w]
        roi = cv2.resize(roi, (48, 48))
        roi = roi.astype("float32") / 255.0
        roi = roi.reshape(1, 48, 48, 1)

        preds             = _emotion_model.predict(roi, verbose=0)[0]
        probs             = {_EMOTION_LABELS[i]: round(float(preds[i]), 4) for i in range(len(_EMOTION_LABELS))}
        state, confidence = _emotion_state(preds, req.sensitivity)

        return {
            "face":            True,
            "interview_state": state,
            "confidence":      round(confidence, 4),
            "probs":           probs,
            "bbox":            [int(x), int(y), int(w), int(h)],
        }
    except Exception as exc:
        _log.error("predict failed: %s", exc)
        return _fallback


@app.get("/interview", response_class=HTMLResponse)
def interview_ui():
    """Serve the standalone real-time emotion detector UI."""
    html_path = Path(__file__).parent / "templates" / "interview.html"
    if not html_path.exists():
        raise HTTPException(status_code=404, detail="interview.html not found")
    return html_path.read_text(encoding="utf-8")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8004)
