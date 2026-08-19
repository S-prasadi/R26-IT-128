# Module C CV OCR — Gap Analysis

Companion document to `docs/cv-ocr-pipeline-implementation-plan.md`. This document establishes *what's missing*; that one specifies *what to build*. Every claim below is cited to a file and line, checked directly against the current repo state; nothing here is carried over unverified from an earlier pass.

**Scope note.** This covers `python-module-c` (the CV Job Analyzer, Flask, port 8003) only. `python-module-d` (the Interview & Document Intelligence service, FastAPI, port 8004) already has a working OCR + LLM pipeline and is referenced below purely as a capability comparison — this document does not propose calling it, importing from it, or otherwise depending on it. Module D also has in-progress uncommitted changes on this branch as of this writing, so its own line numbers below are a snapshot, not a guarantee.

## 1. Where Module C sits in the CV pipeline today

CV handling in this app is split across two services. At upload time, the Node backend sends the file to Module D's `/extract-cv`, which OCRs (if needed) and LLM-structures it into sections. Module C never sees that step — it only receives the *result* of it, as `cv_text` in its `/analyze` request body.

Module C's own extractor only runs when that upstream text is unavailable. `_resolve_cv_text` (`python-module-c/backend/app.py:186-213`) prefers the `cv_text` passed in and only falls back to downloading `file_url` and extracting it itself when that's empty — and its own docstring already says why that fallback is weak (`app.py:189-190`):

> "Prefers `cv_text` (already extracted by Module D's OCR pipeline at upload time — this module's own extractor, PyPDF2, cannot read scanned/image CVs)."

That fallback path — `extract_text_from_file` in `python-module-c/backend/utils/cv_parser.py:263-275` — is also the *only* extractor Module C's other endpoint, `/analyze-cv` (`app.py:75-160`, a direct-file-upload endpoint), uses. It is the entire subject of this gap analysis: everything below is about upgrading this one code path from "thin fallback" to "Module C's own full pipeline."

## 2. Capability checklist

| Capability | Status | Evidence |
|---|---|---|
| Image OCR (scanned PDF, PNG/JPG) | **Absent** | `extract_text_from_file` (`cv_parser.py:263-275`) dispatches on `.pdf`/`.docx`/`.txt` only — there is no image branch, and no OCR library is imported anywhere in the file. |
| Text-layer PDF extraction robustness | **Weak** | `extract_text_from_pdf` (`cv_parser.py:233-244`) calls `PdfReader(file_path)` (from `PyPDF2`, line 5) and `page.extract_text()` with no `try/except` anywhere in the function. `PyPDF2` is also the deprecated predecessor of `pypdf` — the same maintainers folded PyPDF2 into `pypdf` and stopped independent development on it — so this module is on the weaker, unmaintained fork of the library Module D already uses successfully. No layout-aware extraction mode is used, so multi-column resume templates commonly extract with words run together or columns interleaved. |
| DOCX full-content extraction | **Weak** | `extract_text_from_docx` (`cv_parser.py:247-255`) iterates `document.paragraphs` only. `document.tables` is never read. Word resume templates very commonly put a skills list or a two-column contact-info block in a table — that content is silently absent from the extracted text, not degraded, *gone*. |
| Plain-text encoding handling | **Weak** | `extract_text_from_txt` (`cv_parser.py:258-260`) opens with `encoding="utf-8", errors="ignore"`. Any byte sequence that isn't valid UTF-8 — common in older Windows-saved `.txt` files (cp1252) or Notepad UTF-16 saves — is silently dropped, not replaced or flagged, producing quietly truncated/garbled text. |
| Crash safety on malformed input | **Absent** | Neither `/analyze-cv` (`app.py:107`, `cv_text = extract_text_from_file(file_path)`) nor `_resolve_cv_text` (`app.py:208`, same call) wraps that call in `try/except`. A corrupt PDF, an encrypted PDF, or a `.docx`-named file that isn't valid OOXML currently throws an unhandled Python exception straight through Flask, returning a raw 500 with a stack trace instead of a clean, actionable error. |
| LLM-based section structuring | **Absent** | The only structuring logic in Module C is `split_into_sections` (`cv_parser.py:322-350`), a plain regex/exact-header-match splitter. There is no JSON-schema-driven LLM step anywhere in this module — nothing analogous to Module D's Ollama-based CV structuring exists here at all. |
| Section-header coverage | **Weak** | `SECTION_HEADERS` (`cv_parser.py:207-230`) is a fixed list of ~21 phrases. `split_into_sections` requires a line's normalized text to be **exactly equal** to one of them (`normalized_line == normalize_for_phrase(header)`, line 335) — no fuzzy or synonym matching. Real CVs routinely use headers this list doesn't contain: "Career Objective," "Key Skills," "Core Competencies," "Achievements," "Awards," "Languages," "Publications," "Volunteer Experience," numbered headers ("2. Skills"), or decorated headers ("— SKILLS —"). Any of these fail the exact-match check and get absorbed into whatever section is currently open (often "general"), which then corrupts the section-aware estimators below. |
| Downstream estimator accuracy under weak section detection | **Weak (derived)** | `estimate_experience_months`, `estimate_project_count`, `estimate_certificate_count`, and `estimate_ats_quality_score` (`cv_parser.py:414-468, 483-521, 524-572, 575-628`) all call `get_section_text`/check `sections` by exact key name. When `split_into_sections` misses a header (previous row), these functions silently fall back to weaker whole-document heuristics or simply don't award ATS points for a section that's actually present in the CV, just under an unrecognized name. |
| Extraction quality/confidence signal | **Absent** | There is no equivalent of a `quality` score or `method` field anywhere in Module C's extraction path. Callers (`/analyze-cv`, `_resolve_cv_text`) can only tell "got text" vs. "got empty string" (`app.py:109`, `app.py:225`) — there's no way to distinguish "this CV genuinely has no useful content," "this is a scanned image we can't read," and "extraction partially succeeded but is low-confidence." |

## 3. Why this matters for "any type of CV"

Each row above maps to a real, common CV shape that fails today, entirely within Module C's own extraction path:

- **A photographed or scanned CV** (phone photo, flatbed-scanned PDF) — returns empty text; the caller only sees a generic "could not read this CV" message with no indication that OCR would fix it.
- **A password-protected PDF export** (some CV builders default to this) — currently an unhandled crash, not a clean message.
- **A Word-template CV with a skills/contact table** — silently loses that entire block of content; the candidate's skills list may look thin or empty in the analysis even though it's present in the file.
- **An older Windows-saved `.txt` CV, or a UTF-16 Notepad save** — silently corrupted characters, not a clean error and not correct text.
- **A CV using any header vocabulary outside the fixed 21-phrase list** — sections don't split correctly, degrading experience/project/certificate estimates and the ATS score regardless of how good the underlying content actually is.
- **A corrupted or partially-uploaded file** — currently a raw 500, giving the caller (and end user) no actionable information.

None of these require touching Module D. All of them are inside Module C's own ~400-line `cv_parser.py` and the two call sites in `app.py`.

## 4. What "full, accurate OCR" requires that doesn't exist yet

To close the "Absent" rows above, Module C needs, as genuinely new capability (not present in any form today):

1. An **OCR engine** (image → text) — nothing in Module C's dependency list (`python-module-c/backend/requirements.txt`) does this today.
2. A **PDF-to-image rasterization step** for pages with no usable text layer, to feed the OCR engine — also absent.
3. An **LLM-based structuring step** — a prompt + schema + validation + fallback loop that turns raw text into the summary/experience/education/skills/projects shape `build_cv_data_from_text` (`cv_parser.py:641-659`) already expects downstream. Nothing like this exists in Module C; `split_into_sections` is a much shallower mechanism and was never designed to replace it.

`docs/cv-ocr-pipeline-implementation-plan.md` phases these in, starting from hardening what already exists (§2's "Weak" rows) before adding the genuinely new OCR/LLM capability (§2's "Absent" rows).

## 5. Explicit boundary

Everything proposed in the companion implementation plan is built using open-source libraries (`pypdf`, an OCR engine such as `EasyOCR`, `pdf2image`) and locally-installed infrastructure (a local Ollama server) called **directly from Module C's own code**. No part of this plan imports from, sends requests to, or otherwise creates a runtime dependency on `python-module-d`. Where Module C ends up using the same underlying tool Module D also happens to use (e.g. both independently calling a local Ollama instance, or both using EasyOCR as a Python library), that is coincidental infrastructure/library reuse — the same way both already independently use `requests` — not module coupling.
