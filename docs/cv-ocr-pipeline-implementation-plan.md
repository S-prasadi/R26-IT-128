# Module C CV OCR Pipeline — Phase-Wise Implementation Plan

Companion document to `docs/cv-ocr-gap-analysis.md`. That document explains *what's missing and why it matters*; this document specifies *what to build*, in what order, and how to know each phase is actually done.

Scope: `python-module-c` only. No phase below adds an import, HTTP call, or any other runtime dependency on `python-module-d` — every capability is built as Module C's own independent code, calling only open-source libraries and locally-installed infrastructure (e.g. a local Ollama server) directly.

```
Phase 0 (harden existing extractor)
   │
   ├──▶ Phase 1 (OCR engine) ──▶ Phase 3 (wire into endpoints) ──▶ Phase 4 (ops/perf)
   │                                     ▲
   └──▶ Phase 2 (LLM structuring) ───────┘
                                          Phase 5 (testing) — validates all of the above
```

Phase 1 and Phase 2 are independent of each other (one adds image/OCR input capability, the other adds LLM-based output structuring) and can be built in either order or in parallel, but both must land before Phase 3 wires them into the live endpoints. Phase 0 is the prerequisite for everything — no point layering OCR onto an extractor that still crashes on a plain corrupt PDF.

Each phase below uses the same five subsections: **Goal**, **Tasks**, **Files touched**, **Dependencies added**, **Exit criteria**.

---

## Phase 0 — Harden the existing lightweight extractor ✅ done

**As built.** Implemented exactly as scoped below, plus one bug found and fixed during testing that wasn't anticipated in this plan: the `.txt` encoding fallback chain originally tried `cp1252` before `utf-16`. `cp1252` is a single-byte codec that "succeeds" (silently, garbled) on almost any byte sequence, so a genuinely UTF-16-encoded file (e.g. a Windows Notepad save) never reached the `utf-16` branch — it decoded as garbage without ever raising the exception the fallback chain relies on to move to the next encoding. Fixed with explicit BOM detection first (`codecs.BOM_UTF8`, `codecs.BOM_UTF16_LE/BE`) before falling back to a plain `utf-8`/`cp1252` try-chain — verified against real BOM'd UTF-16, BOM'd UTF-8, cp1252-no-BOM, and plain-ASCII fixtures. All other tasks (pypdf swap + layout mode, encrypted-PDF handling, DOCX table extraction with merged-cell dedup, `CVExtractionError` + both `app.py` call sites, broadened `SECTION_HEADERS` + heuristic matcher) match this plan as written. All exit criteria verified live (server running, corrupt PDF/DOCX, unsupported extension, table DOCX, real text PDF) plus the full pre-existing test suite (28 tests, unchanged, still passing).

**Goal.** Fix the concrete, already-identified bugs in Module C's current extractor (§2 of the gap analysis, "Weak"/"Absent" rows for crash safety, DOCX tables, TXT encoding, and header coverage) before building OCR on top of it. Everything in this phase stays within the file types Module C already claims to support (PDF/DOCX/TXT) — it makes the existing surface area actually correct, without adding new surface area yet.

**Tasks.**
1. Swap the PDF library: `from PyPDF2 import PdfReader` → `from pypdf import PdfReader` (`cv_parser.py:5`). `pypdf` is the actively maintained successor with the same `PdfReader` API, so this is close to a drop-in change. Use `page.extract_text(extraction_mode="layout")` first (preserves column/whitespace structure for multi-column resumes), falling back to default-mode `page.extract_text()` if layout mode raises or returns only whitespace.
2. Add encrypted-PDF handling: check `reader.is_encrypted` after construction; attempt `reader.decrypt("")` for the common empty-user-password case produced by some export tools; if still encrypted, fail with a clear, specific message rather than silently returning empty text.
3. Wrap `PdfReader(file_path)` construction and the per-page extraction loop in `try/except`, converting any exception into one new shared error type (see task 6).
4. Extend `extract_text_from_docx` (`cv_parser.py:247-255`) to also read `document.tables`: for each row, collect non-empty cell text, skip a cell whose text is identical to the immediately preceding cell in that row (merged cells repeat the same cell object across the columns they span), join a row's distinct cell texts with `" | "`, and append as a line alongside the existing paragraph text. Wrap `Document(file_path)` construction and this whole extraction body in `try/except`.
5. Replace `extract_text_from_txt`'s `errors="ignore"` (`cv_parser.py:258-260`) with an encoding fallback chain: try `utf-8`, then `utf-8-sig`, `cp1252`, `utf-16`, and finally `latin-1` (which never raises `UnicodeDecodeError`, so the chain always terminates), returning on the first strict decode that succeeds. Raise the shared error type only on a genuine `OSError` (file unreadable), not on encoding mismatches.
6. Add one shared `CVExtractionError(Exception)` type (top of `cv_parser.py`). Every extractor function raises this instead of letting a library-specific exception propagate. Update `extract_text_from_file` (`cv_parser.py:263-275`) to catch it and re-raise unchanged, and to wrap any other unexpected exception into it too — one consistent error type for every caller to catch. Unsupported extensions still return `""` unchanged (that's a legitimate "nothing to dispatch to" case, not a crash).
7. In `app.py`, import `CVExtractionError` and wrap both existing call sites:
   - `/analyze-cv` (`app.py:107`): catch `CVExtractionError`, return `jsonify({"error": str(error)}), 400` instead of letting it crash.
   - `_resolve_cv_text` (`app.py:208`): catch it inside the existing `try/finally` (so the temp-file `os.unlink` cleanup in the `finally` block still always runs), returning the same `(jsonify({"error": str(error)}), 400)` shape the function already uses for its `download_cv` failure case.
8. Broaden `SECTION_HEADERS` (`cv_parser.py:207-230`) with realistic synonyms: `"career objective"`, `"objective"`, `"professional summary"`, `"personal profile"`, `"about me"`, `"relevant experience"`, `"academic qualifications"`, `"educational background"`, `"personal projects"`, `"academic projects"`, `"key projects"`, `"key skills"`, `"core competencies"`, `"competencies"`, `"technical proficiencies"`, `"areas of expertise"`, `"courses"`, `"trainings"`, `"training"`, `"professional development"`, plus standalone buckets that currently have nowhere to go: `"achievements"`, `"accomplishments"`, `"awards"`, `"languages"`, `"publications"`, `"volunteer experience"`, `"activities"`, `"contact information"`, `"personal details"`, `"interests"`, `"hobbies"`.
9. Wire every new synonym that extends an *existing scored bucket* into the relevant `possible_names` list, or it'll be correctly split out of "general" but still invisible to the estimator reading it: `estimate_experience_months`'s list (`cv_parser.py:419-426`, add `"relevant experience"`), `estimate_project_count`'s list (`cv_parser.py:488-491`, add the three project synonyms), `estimate_certificate_count`'s list (`cv_parser.py:529-534`, add the four training/course synonyms), and `estimate_ats_quality_score`'s inline `or "..." in sections` chains (`cv_parser.py:583, 586-593, 596, 599, 602, 605-610`, extend each with its matching synonyms).
10. Add a heuristic fallback to `split_into_sections` (`cv_parser.py:322-350`) for headers that don't hit the exact-match check. Keep exact match as the fast path; only try the heuristic when it misses. A line qualifies as a heuristic header match only if **all** of: raw length ≤ 35 chars; ≤ 4 words after normalization; doesn't end in `.`/`,`/`;` (body sentences and bullets do, headers don't); and, after stripping (a) leading numbering/bullets (`^\s*([0-9]{1,2}[\.\)]|[ivxIVX]{1,4}[\.\)]|[-*•])\s*`), (b) leading/trailing banner-symbol runs (`-`, `=`, `*`, `_`, `~`), and (c) a single trailing colon, the cleaned line is an **exact** match (never a substring/contains match) against a `SECTION_HEADERS` entry. The exactness requirement after stripping is what prevents a body sentence like "I have strong analytical skills and clear communication." from ever matching — it fails the length/word-count/punctuation gates before decoration-stripping is even attempted.

**Files touched.** `python-module-c/backend/utils/cv_parser.py`, `python-module-c/backend/app.py`, `python-module-c/backend/requirements.txt`.

**Dependencies added.** `pypdf>=4.2.0` (replaces `PyPDF2` on `requirements.txt:6`).

**Exit criteria.**
- A corrupted or truncated PDF, and a `.docx`-named file that isn't valid OOXML, both return a clean `400 {"error": "..."}` from both `/analyze-cv` and `/analyze` — never a raw 500/traceback.
- A password-protected PDF with an empty user password extracts normally; one with a real password returns a specific "password-protected" message.
- A table-layout DOCX's table content appears in the extracted text.
- A cp1252- or UTF-16-saved `.txt` file decodes correctly (no dropped/garbled characters).
- A CV using "Career Objective," "Key Skills," or a numbered/colon-decorated header ("2. Skills:") is split into the correct section instead of falling into "general."
- A body sentence that happens to mention "skills" or "experience" mid-sentence is **not** misdetected as a section boundary (regression check for task 10).

---

## Phase 1 — Image / scanned-PDF OCR engine ✅ done

**As built.** Implemented as scoped: `EasyOCR` chosen as the default engine (task 1's rationale held up — installed and ran cleanly on this machine, matching Module D's proven track record). Built `python-module-c/backend/utils/ocr.py` with a `functools.lru_cache(maxsize=1)`-wrapped lazy reader singleton (plus the same SSL-CA-bundle retry safety net Module D needed in this environment), a `text_quality` heuristic (45% printable-char ratio / 35% alpha-word count / 20% heading-keyword hits — reused as-is, it's a well-designed generic scorer, not Module-D-specific), 3-variant image preprocessing (original/contrast/adaptive), and reading-order reconstruction with simple 2-column detection. `extract_text_from_pdf` now rasterizes and OCRs only pages whose direct `pypdf` text scores below quality 55 or under 120 characters, via `pdf2image.convert_from_path(..., first_page=N, last_page=N)` per weak page — poppler confirmed already installed on this machine (Homebrew), no setup needed. Verified live and standalone (Module D not running): a real text-based PDF extracts via the fast direct-text path with no OCR triggered; a pure image-only PDF and a standalone PNG both correctly trigger the OCR fallback and return accurate (if imperfect on exact line ordering — expected for CPU EasyOCR) text, end-to-end through both `/analyze-cv` and `/analyze`'s `file_url` path. Measured latency: ~70-80s per image on this CPU-only machine (3 preprocessing variants × EasyOCR inference) — slow, flagged as Phase 4's problem to address, not a regression here.

**Goal.** Give Module C the ability to read scanned or photographed CVs and plain image files — the single largest capability gap identified in §2 of the gap analysis, and the one no amount of Phase 0 hardening can close, since it requires genuinely new code, not bug fixes.

**Tasks.**
1. Choose an OCR engine. Recommendation: **EasyOCR** — it's deep-learning-based (materially better accuracy than classical OCR on varied fonts/scan quality) and this exact environment has already proven it installs and runs correctly (Module D uses it). Record two alternatives and why they were not chosen as the default, so the choice is auditable: **PaddleOCR** (often higher accuracy still, especially on dense/small text, but a heavier and less-tested install in this environment) as an upgrade path if EasyOCR's accuracy proves insufficient in testing; **Tesseract/pytesseract** (much lighter weight, faster on CPU, lower accuracy on noisy scans) as a fallback if EasyOCR's model size or CPU latency turns out to be a real problem in Phase 4.
2. Build `python-module-c/backend/utils/ocr.py`:
   - A lazily-initialized, module-level OCR reader singleton (constructed once on first use or at startup — see Phase 4 — never per-request; model loading is the expensive part).
   - `extract_text_from_image(file_path) -> str` for PNG/JPG, raising `CVExtractionError` (from `cv_parser.py`, Phase 0) on genuine failure (corrupt image, unreadable file).
   - A page/text quality check — e.g. a simple heuristic on character count and alphanumeric-character ratio — used to decide whether a PDF page's existing text layer is usable or needs OCR.
3. Extend `extract_text_from_pdf` (`cv_parser.py`, already hardened in Phase 0) to run the quality check per page: pages with a good text layer keep using the Phase-0 `pypdf` extraction; pages that fail the check get rasterized via `pdf2image` (which shells out to the `poppler` system binary) and OCR'd via the new `ocr.py`. Merge results back together in original page order so a partially-scanned PDF (e.g. one scanned page inserted into an otherwise-digital document) still comes out coherent.
4. Extend Module C's accepted file types: add `.png`, `.jpg`, `.jpeg` to `/analyze-cv`'s `allowed_extensions` (`app.py:96`) and to `extract_text_from_file`'s dispatch (`cv_parser.py:263-275`, new branch calling `ocr.extract_text_from_image`).

**Files touched.** New: `python-module-c/backend/utils/ocr.py`. Modified: `cv_parser.py`, `app.py`, `requirements.txt`.

**Dependencies added.** `easyocr` (or the chosen alternative), `pdf2image`, `Pillow`, `opencv-python-headless`. System-level: the `poppler` binary (`pdftoppm`/`pdftocairo`) — verify it's already installed (Module D's environment needs it too, so it likely is on this machine) rather than assuming; document the install command for a fresh environment either way.

**Exit criteria.** With Module D stopped/unreachable, a scanned-image-only PDF and a plain PNG/JPG photo of a CV both return non-empty, reasonably accurate extracted text through Module C's `/analyze-cv` or `/analyze` alone.

---

## Phase 2 — LLM-based section structuring ✅ done

**As built — one correction to this plan's original scoping.** This section originally said "Files touched: new `llm_structurer.py`; modified `app.py` (calls the new module)." That was wrong: `app.py` never touches CV sections at all — the four estimator functions in `cv_parser.py` (`estimate_experience_months`, `estimate_project_count`, `estimate_certificate_count`, `estimate_ats_quality_score`) each independently call `split_into_sections(text)` themselves. So the actual integration point is `cv_parser.py`, not `app.py`. Rather than threading a pre-computed `sections` value through all four estimator signatures, `split_into_sections` itself was upgraded in place: the old regex logic was renamed to a private `_split_into_sections_regex`, and `split_into_sections(text)` now tries the LLM first via a `functools.lru_cache(maxsize=8)`-wrapped `_resolve_sections(text)`, falling back to the regex version on any failure. Every existing caller benefits with zero signature changes. The cache also solves a real problem the original plan didn't anticipate: without it, one `build_cv_data_from_text` call would trigger 4 separate (identical, redundant) Ollama calls — one per estimator — needlessly multiplying latency. Verified directly: 4 calls to `split_into_sections` with identical text now trigger exactly 1 real Ollama call.

**Goal.** Replace reliance on the purely regex-based `split_into_sections` for turning raw text into structured CV data with an LLM-driven structuring step — this is the "working Ollama gemma4" capability the user specifically asked for, and it's independent of (can be built in parallel with) Phase 1.

**Tasks.**
1. Build `python-module-c/backend/utils/llm_structurer.py`. It calls a **local Ollama HTTP endpoint directly** — `OLLAMA_URL`, default `http://localhost:11434`, configurable via environment variable — with the model tag also configurable via environment variable, defaulting to `gemma4:e2b` (the tag already validated as working on this machine). This is a direct call to the shared local Ollama runtime, the same way any local tool would call it — not a call to Module D's FastAPI service or any of its code.
2. Design a CV-structuring prompt and a JSON schema: `summary`, `experience`, `education`, `skills`, `projects`, `certifications` — chosen because these exact key strings already appear verbatim in `cv_parser.py`'s `SECTION_HEADERS` and the estimators' `possible_names` lists, so the LLM's output slots directly into the existing analysis code with no further translation layer needed.
3. Cap long CV text at a generous character limit (12,000 chars) rather than building multi-chunk-and-merge machinery — CVs are realistically 1-3 pages, so this is a documented, deliberate tradeoff, not a silent bug. Use Ollama's `format: "json"` structured-output mode (measurably improves first-try valid-JSON odds), validate the response is a dict of strings for the expected keys (extra/unexpected keys — observed in testing, e.g. the model adding its own `"achievements"` key — are simply ignored, not treated as invalid), and retry once on invalid/malformed output.
4. On Ollama being unreachable, or failing validation twice, fall back to the Phase-0 hardened `_split_into_sections_regex` — Module C's own fallback, independent of Module D's equivalent fallback logic. This makes the LLM step a pure quality upgrade, not a hard dependency: the pipeline still functions with Ollama stopped.

**Files touched.** New: `python-module-c/backend/utils/llm_structurer.py`. Modified: `cv_parser.py` (not `app.py` — see correction above).

**Dependencies added.** None — `requests` was already a dependency.

**Exit criteria — all verified.**
- Measured real Ollama latency on this machine: ~12-15s cold (model load dominates), ~1.6-2.5s warm — informed the 45s request timeout (generous margin over a cold-load-plus-generate call).
- With Ollama running, a real CV (a fixture using "Career Objective," "Employment History," "Academic Qualifications," "Courses" — none of which are exact matches in the original `SECTION_HEADERS` list) comes back through `build_cv_data_from_text` with correct experience months, certificate count, and skills — confirming the LLM path is actually wired in and doing real work, not just present as dead code.
- With `OLLAMA_URL` pointed at an unreachable port, `split_into_sections` falls back to the regex splitter in ~0ms (connection-refused fails fast, doesn't wait out the timeout) with no crash and correct output.
- Full pre-existing test suite (28 tests) still passes with Ollama running live (total runtime ~2.3s, up from ~0.26s with Ollama off — the added cost is exactly the one real LLM call the two `/analyze*` tests now trigger, not a regression).

---

## Phase 3 — Wire into Module C's existing endpoints ✅ done

**As built — two corrections to this plan's original scoping.**

Task 1 needed no code change: because Phases 0-2 upgraded `extract_text_from_file` and `split_into_sections` themselves (rather than adding new call sites), both endpoints had already been calling the full OCR+LLM pipeline since Phase 2 landed.

The "mirrors the frontend extraction-preview UI" claim in task 2 doesn't hold and was corrected rather than silently dropped: that UI reads `extraction` from the **upload** response (`cv.service.ts uploadCV()`, which only ever calls Module D), not the **analyze** response (`cv.service.ts analyzeCV()`, which calls Module C's `/analyze`) — different endpoints, different response shapes. Adding `extraction` to Module C's own responses is still real, useful work (a diagnostic signal for direct API callers, and groundwork if the Node layer is ever wired to consume it), it just doesn't automatically appear in the existing upload-time banner. Also scoped `method` to the extraction stage only (`"text-layer"` / `"ocr"` / `"mixed"` / `"direct"` / `"upstream"` / `"none"` / `"unsupported"`) rather than the originally-sketched blended `"ocr+llm"`/`"ocr+regex"` values — those would require threading Phase 2's LLM-vs-regex signal through all four estimator call sites, a materially bigger change than "add metadata to two endpoints."

`extract_text_from_pdf`, `extract_text_from_docx`, `extract_text_from_txt`, and `cv_parser.py`'s `extract_text_from_image` wrapper now all return `(text, method)`; `extract_text_from_file` returns `(text, {"method", "quality"})`. `_resolve_cv_text` returns a 3-tuple including extraction metadata, computing `{"method": "upstream", "quality": text_quality(cv_text)}` when `cv_text` arrived pre-extracted in the request body. Verified live for every method value end-to-end through both endpoints: text-based PDF → `"text-layer"`, DOCX → `"direct"`, standalone PNG and a rendered image-only PDF → `"ocr"`, `cv_text` passed directly to `/analyze` → `"upstream"`, unresolvable extension → `"none"`. Corrupt-file and missing-input error paths (unaffected by this change) re-verified still 400 cleanly. Full 28-test suite still passes.

**Goal.** Make `/analyze-cv` and `/analyze` (via `_resolve_cv_text`) actually use the new pipeline end-to-end, and make the improvement visible to callers.

**Tasks.**
1. Replace the direct `extract_text_from_file(...)` calls in `/analyze-cv` (`app.py:107`) and `_resolve_cv_text` (`app.py:208`) with the full Phase 0–2 pipeline: OCR-aware extraction (Phase 1) feeding into LLM-based structuring with regex fallback (Phase 2).
2. Add an `extraction` metadata block to both endpoints' responses — `quality` (a rough confidence score) and `method` (one of `"text-layer"`, `"ocr"`, `"ocr+llm"`, `"ocr+regex"`) — mirroring the shape the Node backend and frontend already know how to render from Module D's `/extract-cv` response, so the existing "extraction preview" UI in the frontend works the same regardless of which module actually produced the result, with no frontend changes required.

**Files touched.** `app.py`.

**Dependencies added.** None new.

**Exit criteria.** Both endpoints return the richer extraction result — correct text, correct structured sections, and a populated `extraction` metadata block — for every case in the Phase 5 test matrix below.

---

## Phase 4 — Ops / performance ✅ done

**As built.** `requirements.txt` needed no change (task list said "None new" dependencies but also listed it under "Files touched" — a doc inconsistency, left untouched here since nothing new was actually needed). While touching the Ollama env var, renamed `llm_structurer.py`'s `OLLAMA_URL` → `OLLAMA_BASE_URL` to match Module D's already-documented name (`README.md:236`) — pure operator ergonomics, still two fully independent env var reads, no coupling introduced.

`ocr.py` gained a `warm_up()` (calls the existing `_get_ocr_reader()`) and an `OCR_USE_GPU` env var (default `false` — this dev machine is Apple Silicon with no CUDA, so the default must stay off). `llm_structurer.py` gained a `warm_up()` that POSTs a minimal `num_predict: 1` prompt to force the model into memory without spending time on real generation. Both are called at module level in `app.py`, alongside the existing `joblib.load(...)`/`load_score_distributions()` startup work — no reloader-double-execution guard was added (see plan file reasoning: `app.debug` isn't set yet at module-import time, and a correct guard needs `WERKZEUG_RUN_MAIN`, which is never set outside the dev reloader and would silently disable warm-up in production if used as the sole condition — not worth the complexity for a dev-only ~15-30s extra startup cost that the codebase already accepts for its sklearn model load).

**Real measured latency** (this machine, CPU-only, Ollama already warm from recent use): server startup with warm-up ≈ 8s; a single scanned page (3 preprocessing variants × EasyOCR) ≈ 44-48s, consistent between the first request after startup and a second identical one — confirming warm-up eliminates the extra cold-load stacking Phase 1 originally had; a 3-page scanned CV ≈ 202s total (~67s/page, roughly linear); text-based PDF/DOCX (no OCR needed) ≈ 2-3s regardless of warm-up state.

**Also corrected two now-false claims Phases 0-3 left behind**, per this plan's stated scope: `python-module-c/README.md`'s "cannot read scanned or image CVs" line, and the same claim duplicated in the root `README.md` (capability note + a troubleshooting row). Added a "Configuration (environment variables)" section to `python-module-c/README.md` and a matching Module C block to the root README's §6, plus the Flask-dev-server-is-synchronous / gunicorn-follow-up note in `python-module-c/README.md`'s "Known limitations."

**Goal.** Make the pipeline usable under real request load and predictable latency, not just correct when tested in isolation.

**Tasks.**
1. Warm-load the OCR reader singleton (Phase 1) and verify Ollama connectivity (Phase 2) once at Flask process startup, mirroring the pattern Module D already uses to avoid stacking model-load time onto the first real request.
2. Add a CPU/GPU configuration flag for the OCR engine (`easyocr.Reader(..., gpu=...)`), and document realistic latency for a representative multi-page scanned CV on this hardware — OCR plus a local LLM call on CPU is genuinely slow, and callers (Node backend timeout settings, frontend loading states) need real numbers, not guesses.
3. Document that Flask's default synchronous development server will not handle concurrent long-running OCR requests well, and record the production recommendation (e.g. a WSGI server such as gunicorn with worker count and timeout tuned for this workload) as a follow-up — implementing the production server swap is out of scope for this pass, but leaving it undocumented would silently reintroduce a bottleneck later.

**Files touched.** `app.py` (startup hook), `requirements.txt`, README/env-var documentation for Module C.

**Dependencies added.** None new.

**Exit criteria.** The first real request after a fresh process start is not measurably slower than subsequent requests (confirms warm-up worked); documented latency numbers exist for at least one representative scanned CV.

---

## Phase 5 — Testing & validation plan ✅ done

**As built.** Every matrix row below is covered by a permanent test, plus a real fixture the user provided (`tests/samplecv/dulina-indrawansha-cv-2025.pdf`, a genuine 2-page CV) that turned out to be a harder test than any synthetic one built this session — its page 2 has a real 2×2-grid multi-column skills layout, and building fixtures around it surfaced three real bugs, all found and fixed during this phase (not left as findings):

1. **`pypdf`'s `decrypt()` return value, not `reader.is_encrypted` afterward, is the real success signal.** `is_encrypted` stays `True` even after a *successful* decrypt in this pypdf version — the original Phase 0 code re-checked `is_encrypted` and would have rejected every correctly-decrypted empty-password PDF as "password-protected." Only surfaced once a real encrypted PDF was actually built and tested (`PdfWriter(clone_from=...).encrypt(...)`) — every prior test of this path had only been reasoned about, not executed against a real encrypted file. Fixed in `cv_parser.py` (`extract_text_from_pdf`).
2. **Some PDF export pipelines position every glyph individually**, which `pypdf` extracts as `"D U L I N A"` (a space between every letter) — this scored the sample CV's genuinely good text layer *below* the OCR-fallback quality threshold, triggering minutes of needless OCR on a PDF that already had perfectly good text. Fixed with a detect-and-collapse step (`_looks_letter_spaced`/`_collapse_letter_spacing` in `cv_parser.py`) applied to both `pypdf` extraction modes before scoring.
3. **The LLM structuring step (Phase 2) wasn't preserving line breaks** despite the prompt saying "copy verbatim" — it collapsed multi-line project entries into one continuous run, which broke the (pre-existing, line-based) project-counting heuristic downstream. Fixed by making the prompt explicit about preserving `"\n"` at every original line break; verified the fix by comparing line counts before/after against the regex path's line-preserving baseline.

**Known limitations found but *not* fixed** (out of scope — pre-existing scoring-heuristic behavior or a `pypdf` limitation, not part of the OCR/extraction pipeline this plan covers), documented in `python-module-c/README.md`'s "Known limitations":
- Multi-column PDFs can extract out of visual reading order when `pypdf`'s `layout` mode returns empty (it does for this sample CV) and the `plain`-mode fallback's raw content-stream order doesn't match the visual column order. Skill extraction is unaffected (order-independent); section-content attribution can be.
- The project/certificate line-counting heuristics assume bulleted lines or a `"project"`/`"|"` keyword in the title line — a CV with bare project-name titles (like the sample CV's) undercounts. Pre-existing logic, not touched by this work.
- `estimate_experience_months` sums every date range found rather than merging overlaps — the sample CV's two overlapping employment periods inflate its computed tenure. Pre-existing, not touched.

**Matrix coverage** (every row from the original table below, plus where it landed):

**Goal.** Prove the pipeline actually solves "any type of CV needs to extract properly" as originally reported, and that Phase 0's fixes haven't regressed under the weight of Phases 1–3.

**Tasks.** Extend `python-module-c/tests/` (existing `unittest`-based suite: `test_app.py`, `test_scoring.py`, `test_relative_eval.py`, `test_advanced_analysis.py`) with cases covering the full matrix below. Follow the existing test file's pattern (Flask test client, `assertIn`/`assertEqual` against JSON responses) rather than introducing a new test framework.

| Case | Expected result | Where it landed |
|---|---|---|
| Text-based PDF (normal resume) | Correct extraction; no column-scrambling regression from the Phase 0 layout-mode switch | `test_cv_parser.RealSampleCvTests`, `test_app.test_real_sample_cv_end_to_end` — the real sample CV |
| Scanned/image-only PDF | Non-empty, reasonably accurate text via Phase 1's OCR path | `test_app.test_extraction_method_ocr_via_analyze_file_url` (PDF-wrapped synthetic image), `RUN_SLOW_TESTS`-gated |
| PNG/JPG photo of a CV | Same as above | `test_ocr.RealOcrTests`, `test_app.test_extraction_method_ocr_via_analyze_cv`, `RUN_SLOW_TESTS`-gated |
| Password-protected PDF (empty-password and real-password variants) | Empty-password auto-decrypts and extracts; real-password gives a specific, clean error | `test_cv_parser.EncryptedPdfTests`, `test_app` password tests — **fast, not gated**, since the decrypt check short-circuits before any per-page/OCR work; this is also where the real `decrypt()` bug was found |
| Table-layout DOCX | Table content present in extracted text (previously silently dropped) | `test_cv_parser.DocxTableExtractionTests`, `test_app.test_extraction_method_direct_for_docx` |
| Non-UTF-8 `.txt` (cp1252 and UTF-16 samples) | Correctly decoded, no corrupted characters | `test_cv_parser.TxtEncodingTests` (cp1252, UTF-16-BOM, UTF-8-BOM, plain ASCII) |
| CV with unconventional headers ("Career Objective," numbered/colon-decorated headers) | Sections split correctly; estimators reflect that content instead of dumping into "general" | `test_cv_parser.SectionHeaderMatchingTests` (synthetic) + `RealSampleCvTests` (the real CV's actual headers) |
| Corrupted/truncated PDF or DOCX | Clean 4xx JSON error, never a raw 500/crash | `test_cv_parser.CrashSafetyTests`, `test_app` corrupt-file tests (both `/analyze-cv` and `/analyze`'s `file_url` path) |
| Oversized file | Handled per the app's existing upload size limit, with a clean error | **Not applicable at Module C's level** — confirmed Module C's Flask app sets no `MAX_CONTENT_LENGTH`, so there is no size-limit code path here to test; any such limit lives in the Node backend's multer config, outside this module's scope |
| Body sentence mentioning "skills"/"experience" mid-sentence | Not misdetected as a section header (Phase 0 heuristic regression check) | `test_cv_parser.SectionHeaderMatchingTests.test_body_sentence_is_not_misdetected_as_a_header` |

**Files touched.** New: `python-module-c/tests/fixture_builders.py`, `test_cv_parser.py`, `test_ocr.py`, `test_llm_structurer.py`. Modified: `test_app.py` (new cases), `cv_parser.py` (the `decrypt()` and letter-spacing fixes found while building these tests), `llm_structurer.py` (the line-break-preservation prompt fix), `python-module-c/README.md` (Known limitations + a new Testing section), `docs/cv-ocr-pipeline-implementation-plan.md` (this file).

**Dependencies added.** None new — every fixture (corrupt files, encrypted PDFs, table DOCX, encoding variants, a synthetic scanned-CV image) is built from `pypdf`/`python-docx`/`Pillow`/stdlib, already present.

**Exit criteria — met.** Every row in the matrix above passes, cross-checked by name against the original table so nothing silently dropped. Default run (no env var): 73 tests, ~29s, 4 skipped (the real-OCR/real-Ollama cases). `RUN_SLOW_TESTS=1`: all 73 run for real, 100s total, all pass — confirming the gated tests are real coverage, not stubs. The pre-existing test suite (`test_scoring.py`, `test_relative_eval.py`, `test_advanced_analysis.py`) still passes unchanged.
