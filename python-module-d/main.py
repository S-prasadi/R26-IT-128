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
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from openai import OpenAI
from PIL import Image
from pydantic import BaseModel
from pypdf import PdfReader

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
    "neutral":   "Confident",
    "sad":       "Confused",
    "surprised": "Nervous",
}

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


# GitHub Models endpoint — set GITHUB_TOKEN in your environment
GITHUB_TOKEN = os.environ.get(
    "GITHUB_TOKEN", "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")
GITHUB_MODELS_BASE_URL = "https://models.inference.ai.azure.com"
GITHUB_MODEL = "gpt-4o-mini"

github_client = OpenAI(base_url=GITHUB_MODELS_BASE_URL, api_key=GITHUB_TOKEN)

DIFFICULTY_LABELS = {1: "very easy", 2: "easy",
                     3: "medium", 4: "hard", 5: "expert"}


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
    emotion_data: dict = {}


class ExtractOcrRequest(BaseModel):
    file_b64: str
    mimetype: str  # application/pdf | image/png | image/jpeg | text/plain


# ── Helpers ───────────────────────────────────────────────────────────────────

def _pdf_to_images(pdf_bytes: bytes) -> list[Image.Image]:
    """Convert each page of a PDF to a PIL Image using pdf2image (poppler)."""
    from pdf2image import convert_from_bytes  # lazy import — only needed for PDFs
    return convert_from_bytes(pdf_bytes)


def _ocr_images(images: list[Image.Image]) -> str:
    reader = _get_ocr_reader()
    texts = []
    for img in images:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            img.save(tmp.name)
            results = reader.readtext(tmp.name, detail=0)
            texts.append(" ".join(results))
            os.unlink(tmp.name)
    return "\n".join(texts)


def _generate_questions_with_github_models(topic: str, difficulty: int, skills: list[str], document_text: str) -> list[dict]:
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

    response = github_client.chat.completions.create(
        model=GITHUB_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
        max_tokens=1024,
    )

    raw = response.choices[0].message.content.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw)["questions"]


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/generate-questions")
def generate_questions(req: GenerateQuestionsRequest):
    if not GITHUB_TOKEN:
        # Fallback when no GitHub token is configured
        difficulty = req.difficulty
        return {
            "questions": [
                {"text": f"Explain your experience with {req.topic} development.",
                    "type": "behavioral", "difficulty": difficulty},
                {"text": f"Describe the most complex {req.topic} project you have built.",
                    "type": "situational", "difficulty": difficulty},
                {"text": f"What design patterns do you commonly use in {req.topic}?",
                    "type": "technical", "difficulty": difficulty},
                {"text": f"How do you handle performance optimisation in {req.topic}?",
                    "type": "technical", "difficulty": difficulty},
                {"text": f"Describe a time you had to debug a critical issue in {req.topic}.",
                    "type": "behavioral", "difficulty": difficulty},
            ]
        }

    try:
        questions = _generate_questions_with_github_models(
            req.topic, req.difficulty, req.skills, req.document_text
        )
        return {"questions": questions}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/extract-ocr")
def extract_ocr(req: ExtractOcrRequest):
    try:
        file_bytes = base64.b64decode(req.file_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 payload.")

    mimetype = req.mimetype.lower()

    if mimetype == "text/plain":
        return {"text": file_bytes.decode("utf-8", errors="replace")}

    if mimetype == "application/pdf":
        # First try pypdf for text-based PDFs (fast, no OCR needed)
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            pages_text = [page.extract_text() or "" for page in reader.pages]
            combined = "\n".join(pages_text).strip()
            if combined:
                return {"text": combined}
        except Exception:
            pass
        # Scanned PDF — convert pages to images then OCR
        images = _pdf_to_images(file_bytes)
        return {"text": _ocr_images(images)}

    if mimetype in ("image/png", "image/jpeg", "image/jpg"):
        image = Image.open(io.BytesIO(file_bytes))
        reader = _get_ocr_reader()
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            image.save(tmp.name)
            results = reader.readtext(tmp.name, detail=0)
            os.unlink(tmp.name)
        return {"text": " ".join(results)}

    raise HTTPException(
        status_code=400, detail=f"Unsupported mimetype: {req.mimetype}")


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


def _pypdf_extract(file_bytes: bytes) -> str:
    """Extract text from a text-based PDF using pypdf.
    Tries both 'layout' and 'plain' modes and returns whichever gives more text."""
    reader = PdfReader(io.BytesIO(file_bytes))
    best = ""
    for mode in ("layout", "plain"):
        pages: list[str] = []
        for page in reader.pages:
            try:
                pages.append(page.extract_text(extraction_mode=mode) or "")  # type: ignore[call-arg]
            except Exception:
                pages.append(page.extract_text() or "")
        combined = "\n\n".join(pages).strip()
        if len(combined) > len(best):
            best = combined
    return best


def _pdf2image_ocr(file_bytes: bytes) -> str:
    """Render PDF pages to images via poppler then OCR each page."""
    from pdf2image import convert_from_bytes  # requires poppler
    images = convert_from_bytes(file_bytes, dpi=300)
    return _ocr_images(images)


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


def _extract_pdf_text(file_bytes: bytes) -> str:
    """Extract text from a PDF with layered fallbacks and detailed logging."""
    # Path 1: pypdf direct text extraction (works for text-based PDFs)
    try:
        text = _pypdf_extract(file_bytes)
        if len(text) > 150:
            _log.info("pypdf extracted %d chars", len(text))
            return _clean_extracted_text(text)
        _log.info("pypdf returned %d chars — trying OCR", len(text))
    except Exception as exc:
        _log.warning("pypdf failed: %s", exc)

    # Path 2: pdf2image + EasyOCR (scanned PDFs — requires poppler)
    try:
        text = _pdf2image_ocr(file_bytes)
        if text.strip():
            _log.info("pdf2image+OCR extracted %d chars", len(text))
            return _clean_extracted_text(text)
        _log.warning("pdf2image+OCR returned empty text")
    except ImportError:
        _log.warning("pdf2image unavailable — poppler not installed, skipping")
    except Exception as exc:
        _log.warning("pdf2image+OCR failed: %s", exc)

    # Path 3: OCR any images embedded directly in the PDF pages
    try:
        page_images = _extract_embedded_images(file_bytes)
        if page_images:
            text = _ocr_images(page_images)
            if text.strip():
                _log.info("embedded-image OCR extracted %d chars", len(text))
                return _clean_extracted_text(text)
        _log.warning("no usable embedded images found in PDF")
    except Exception as exc:
        _log.warning("embedded-image OCR failed: %s", exc)

    _log.error("all PDF extraction paths failed")
    return ""


def _extract_image_text(file_bytes: bytes) -> str:
    """OCR an image, upscaling first if it is too small for accurate recognition."""
    image = Image.open(io.BytesIO(file_bytes))
    w, h = image.size
    if w < 1200:
        scale = 1200 / w
        image = image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    reader_ocr = _get_ocr_reader()
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        image.save(tmp.name)
        results = reader_ocr.readtext(tmp.name, detail=0, paragraph=True)
        os.unlink(tmp.name)
    return _clean_extracted_text("\n".join(results))


def _extract_raw_text(file_bytes: bytes, mimetype: str) -> str:
    """Dispatch to the correct extractor based on MIME type."""
    mimetype = mimetype.lower()
    if mimetype == "text/plain":
        return file_bytes.decode("utf-8", errors="replace")
    if mimetype == "application/pdf":
        return _extract_pdf_text(file_bytes)
    if mimetype in ("image/png", "image/jpeg", "image/jpg"):
        return _extract_image_text(file_bytes)
    raise HTTPException(status_code=400, detail=f"Unsupported mimetype: {mimetype}")


def _llm_call(prompt: str, max_tokens: int = 4000) -> str:
    """Call GPT-4o-mini and strip markdown fences from the response."""
    response = github_client.chat.completions.create(
        model=GITHUB_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.0,
        max_tokens=max_tokens,
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return raw.strip()


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
        return {**empty, "summary": raw_text[:500]}
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

    raw_text = _extract_raw_text(file_bytes, req.mimetype)
    if not raw_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract any text from the file.")

    pre_links = _pre_extract_links(raw_text)
    sections = _parse_cv_sections_with_llm(raw_text, pre_links)
    return {
        "raw_text": raw_text,
        "sections": sections,
    }


@app.post("/analyze-response")
def analyze_response(req: AnalyseResponseRequest):
    if not GITHUB_TOKEN:
        return {
            "score": 72,
            "feedback": "Good understanding demonstrated. Try to be more specific with concrete examples and measurable outcomes.",
            "engagement_score": 68,
            "emotion_summary": {"dominant": "Confident", "distribution": {"Confident": 45, "Neutral": 30, "Nervous": 15, "Engaged": 10}},
        }

    try:
        prompt = (
            f"You are an interview coach. Evaluate this candidate response.\n\n"
            f"Response: \"{req.response_text}\"\n\n"
            "Return ONLY valid JSON — no markdown:\n"
            '{"score": 0-100, "feedback": "...", "engagement_score": 0-100, "emotion_summary": {"dominant": "...", "distribution": {}}}'
        )
        response = github_client.chat.completions.create(
            model=GITHUB_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=512,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


class PredictRequest(BaseModel):
    frame: str  # base64-encoded JPEG from the browser webcam


@app.post("/predict")
def predict(req: PredictRequest):
    """Accept a base64 JPEG frame, detect face, run Keras emotion model."""
    _fallback = {"face": False, "interview_state": "Confident", "confidence": 0.0, "probs": {}, "bbox": None}

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

        preds      = _emotion_model.predict(roi, verbose=0)[0]
        idx        = int(np.argmax(preds))
        label      = _EMOTION_LABELS[idx]
        confidence = float(preds[idx])
        probs      = {_EMOTION_LABELS[i]: round(float(preds[i]), 4) for i in range(len(_EMOTION_LABELS))}
        state      = _EMOTION_TO_STATE.get(label, "Confident")

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
