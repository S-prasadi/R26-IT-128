import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import fixture_builders as fb
from utils.cv_parser import (
    CVExtractionError,
    _split_into_sections_regex,
    build_cv_data_from_text,
    extract_skills_from_text,
    extract_text_from_file,
)


class CrashSafetyTests(unittest.TestCase):
    """A malformed file must raise a clean CVExtractionError, never a raw
    library exception — the Phase 0 crash-safety guarantee."""

    def test_corrupt_pdf_raises_cv_extraction_error(self):
        with self.assertRaises(CVExtractionError):
            extract_text_from_file(fb.corrupt_pdf_path())

    def test_corrupt_docx_raises_cv_extraction_error(self):
        with self.assertRaises(CVExtractionError):
            extract_text_from_file(fb.corrupt_docx_path())

    def test_unsupported_extension_returns_empty_not_an_error(self):
        fd, path = tempfile.mkstemp(suffix=".xyz")
        with os.fdopen(fd, "wb") as f:
            f.write(b"whatever")
        text, meta = extract_text_from_file(path)
        self.assertEqual(text, "")
        self.assertEqual(meta["method"], "unsupported")


class EncryptedPdfTests(unittest.TestCase):
    def test_empty_password_pdf_decrypts_and_extracts(self):
        text, meta = extract_text_from_file(fb.encrypted_pdf_path(""))
        self.assertGreater(len(text), 100)
        self.assertIn(meta["method"], ("text-layer", "ocr", "mixed"))

    def test_real_password_pdf_raises_clean_error(self):
        with self.assertRaises(CVExtractionError):
            extract_text_from_file(fb.encrypted_pdf_path("secret123"))


class DocxTableExtractionTests(unittest.TestCase):
    def test_table_content_is_extracted(self):
        text, _meta = extract_text_from_file(fb.table_docx_path())
        self.assertIn("Python, SQL, Power BI", text)
        self.assertIn("jane@example.com", text)

    def test_merged_cell_text_is_not_duplicated(self):
        text, _meta = extract_text_from_file(fb.table_docx_path())
        self.assertEqual(text.count("Skills and Tools"), 1)


class TxtEncodingTests(unittest.TestCase):
    """The exact bug found and fixed in Phase 0: cp1252 tried before utf-16
    silently mis-decoded genuinely UTF-16 files."""

    def test_plain_ascii(self):
        text, _meta = extract_text_from_file(fb.TXT_ENCODING_CASES["plain_ascii"]())
        self.assertEqual(text, "Plain ascii text, nothing fancy.")

    def test_cp1252_no_bom(self):
        text, _meta = extract_text_from_file(fb.TXT_ENCODING_CASES["cp1252_no_bom"]())
        self.assertIn("Café", text)
        self.assertIn("résumé", text)

    def test_utf8_bom(self):
        text, _meta = extract_text_from_file(fb.TXT_ENCODING_CASES["utf8_bom"]())
        self.assertEqual(text, "Software Engineer résumé")

    def test_utf16_bom(self):
        text, _meta = extract_text_from_file(fb.TXT_ENCODING_CASES["utf16_bom"]())
        self.assertEqual(text, "Data Analyst — 3 years experience")


class SectionHeaderMatchingTests(unittest.TestCase):
    """Phase 0's broadened SECTION_HEADERS + decoration-stripping heuristic."""

    CV_TEXT = (
        "Career Objective\n"
        "Looking for a data analyst role.\n"
        "\n"
        "Key Skills\n"
        "Python, SQL\n"
        "\n"
        "2. Achievements\n"
        "Won a hackathon.\n"
        "\n"
        "--- CORE COMPETENCIES ---\n"
        "Communication, Leadership\n"
        "\n"
        "I have strong analytical skills and clear communication in my daily work.\n"
    )

    def test_synonym_headers_are_recognized(self):
        sections = _split_into_sections_regex(self.CV_TEXT)
        for header in ("career objective", "key skills", "achievements", "core competencies"):
            self.assertIn(header, sections)

    def test_body_sentence_is_not_misdetected_as_a_header(self):
        sections = _split_into_sections_regex(self.CV_TEXT)
        self.assertIn(
            "I have strong analytical skills and clear communication in my daily work.",
            sections["core competencies"],
        )


class RealSampleCvTests(unittest.TestCase):
    """The user's own real CV — samplecv/dulina-indrawansha-cv-2025.pdf.
    Two pages, a genuinely hard 2x2-grid multi-column skills layout on page
    2, and (as found while building this suite) a PDF export pipeline that
    positions every glyph individually, which pypdf's plain-mode extraction
    turns into single-space-separated letters ('D U L I N A') — Phase 5
    found and fixed this (_collapse_letter_spacing in cv_parser.py); this
    test is what caught it in the first place.
    """

    @classmethod
    def setUpClass(cls):
        cls.text, cls.extraction = extract_text_from_file(fb.SAMPLE_CV_PATH)

    def test_extracts_via_text_layer_not_ocr(self):
        # Confirms the letter-spacing fix worked: before it, this PDF's
        # per-page quality scored below the OCR-fallback threshold despite
        # having a perfectly good, substantial text layer.
        self.assertEqual(self.extraction["method"], "text-layer")
        self.assertGreater(self.extraction["quality"], 90)

    def test_letter_spacing_is_collapsed(self):
        self.assertIn("DULINA HEJITHA INDRAWANSHA", self.text)
        self.assertNotIn("D U L I N A", self.text)

    def test_skills_from_both_halves_of_the_two_column_grid_are_found(self):
        skills = extract_skills_from_text(self.text)
        # left sub-column (Backend Development / Database Management)
        for skill in ("nodejs", "mongodb", "mysql"):
            self.assertIn(skill, skills)
        # right sub-column (Frontend Development / Tools & Version Control)
        for skill in ("react", "javascript", "docker", "kubernetes", "git"):
            self.assertIn(skill, skills)

    def test_top_level_sections_are_detected(self):
        sections = _split_into_sections_regex(self.text)
        for header in ("summary", "work experience", "projects", "references",
                       "technical skills", "education", "soft skills"):
            self.assertIn(header, sections)

    def test_sub_headers_are_not_split_out_as_top_level_sections(self):
        # "Frontend Development" etc. are sub-groupings inside Technical
        # Skills, not CV sections — must not be misdetected as one.
        sections = _split_into_sections_regex(self.text)
        for not_a_section in ("frontend development", "backend development",
                               "database management", "tools version control"):
            self.assertNotIn(not_a_section, sections)

    def test_build_cv_data_produces_sane_output(self):
        # Loose bounds are deliberate: build_cv_data_from_text goes through
        # split_into_sections, which prefers the LLM (Phase 2) when Ollama
        # is reachable — its section split has real run-to-run sampling
        # variance (documented in python-module-c/README.md's Determinism
        # section), so a tight assertion here would be a flaky test, not a
        # real regression check. estimate_experience_months also has a
        # known, pre-existing limitation surfaced by this CV specifically:
        # its two work-experience entries overlap in time (Aug 2023-Present
        # and Jun 2024-Aug 2025), and the estimator sums every date range it
        # finds rather than merging overlaps — so the true value varies with
        # how much of both entries the LLM captured, anywhere from ~15
        # months (one entry only) up to ~52 (both, double-counted).
        data = build_cv_data_from_text(self.text)
        self.assertGreater(len(data["cleaned_all_skills"]), 5)
        self.assertGreaterEqual(data["experience_months"], 12)
        self.assertIn(data["experience_level"], ("Mid", "Senior"))


if __name__ == "__main__":
    unittest.main()
