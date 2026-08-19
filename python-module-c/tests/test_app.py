import io
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import app as app_module
import fixture_builders as fb

CV_TEXT = """Summary
Data analyst with SQL and Python experience.
Experience
Data Analyst, 2 years
Built dashboards using Power BI and Excel, performed data analysis.
Skills
Python, SQL, Excel, Power BI, Data Analysis
"""

JOB_TEXT = "We need a Data Analyst skilled in SQL, Python, Power BI, Excel, and Tableau."

RUN_SLOW = os.environ.get("RUN_SLOW_TESTS") == "1"
SLOW_REASON = "real OCR call (45-80s) — set RUN_SLOW_TESTS=1 to run"


class _FakeHttpResponse:
    def __init__(self, content):
        self.content = content

    def raise_for_status(self):
        pass


def _mock_get_returning(file_path):
    """A requests.get replacement that ignores the URL and returns the
    given local fixture's bytes — avoids needing a real HTTP server just
    to test the file_url download path."""
    with open(file_path, "rb") as f:
        content = f.read()

    def _get(url, timeout=30):
        return _FakeHttpResponse(content)

    return _get


class AppIntegrationTests(unittest.TestCase):
    def setUp(self):
        app_module.app.testing = True
        self.client = app_module.app.test_client()

    def test_phase6_model_swap_took_effect(self):
        self.assertEqual(os.path.basename(app_module.MODEL_PATH), "cv_job_score_model_v2.pkl")

    def test_roles_endpoint_returns_role_list(self):
        resp = self.client.get("/roles")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("Data Analyst", resp.get_json()["roles"])

    def test_analyze_cv_returns_score_level_and_percentile(self):
        resp = self.client.post(
            "/analyze-cv",
            data={
                "target_role": "Data Analyst",
                "cv_file": (io.BytesIO(CV_TEXT.encode("utf-8")), "cv.txt"),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        for key in ("predicted_score", "predicted_level", "percentile", "percentile_label"):
            self.assertIn(key, data)
        self.assertGreaterEqual(data["predicted_score"], 0)

    def test_analyze_returns_job_matches_with_percentile(self):
        resp = self.client.post("/analyze", json={"cv_id": "test", "cv_text": CV_TEXT})
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertTrue(len(data["job_matches"]) > 0)
        for key in ("title", "match_pct", "percentile", "percentile_label"):
            self.assertIn(key, data["job_matches"][0])

    def test_analyze_without_cv_text_or_file_url_is_a_bad_request(self):
        resp = self.client.post("/analyze", json={"cv_id": "test", "cv_text": ""})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("error", resp.get_json())

    def test_compare_job_returns_percentile_alongside_score(self):
        resp = self.client.post("/compare-job", json={"cv_text": CV_TEXT, "job_text": JOB_TEXT})
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        for key in ("predicted_score", "predicted_level", "percentile", "percentile_label", "closest_role"):
            self.assertIn(key, data)

    def test_compare_job_requires_both_fields(self):
        resp = self.client.post("/compare-job", json={"cv_text": CV_TEXT})
        self.assertEqual(resp.status_code, 400)

    # --- Phase 0-3: crash safety, extraction metadata ---------------------

    def test_corrupt_pdf_via_analyze_cv_returns_clean_400(self):
        with open(fb.corrupt_pdf_path(), "rb") as f:
            resp = self.client.post(
                "/analyze-cv",
                data={"target_role": "Data Analyst", "cv_file": (f, "bad.pdf")},
                content_type="multipart/form-data",
            )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("error", resp.get_json())

    def test_corrupt_pdf_via_analyze_file_url_returns_clean_400(self):
        with patch.object(app_module.requests, "get", side_effect=_mock_get_returning(fb.corrupt_pdf_path())):
            resp = self.client.post("/analyze", json={"cv_id": "test", "file_url": "http://fake.test/bad.pdf"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("error", resp.get_json())

    def test_unsupported_extension_via_analyze_cv_returns_400(self):
        resp = self.client.post(
            "/analyze-cv",
            data={"target_role": "Data Analyst", "cv_file": (io.BytesIO(b"whatever"), "cv.xyz")},
            content_type="multipart/form-data",
        )
        self.assertEqual(resp.status_code, 400)

    def test_extraction_method_direct_for_docx(self):
        with open(fb.table_docx_path(), "rb") as f:
            resp = self.client.post(
                "/analyze-cv",
                data={"target_role": "Data Analyst", "cv_file": (f, "cv.docx")},
                content_type="multipart/form-data",
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["extraction"]["method"], "direct")

    def test_extraction_method_upstream_when_cv_text_passed_directly(self):
        resp = self.client.post("/analyze", json={"cv_id": "test", "cv_text": CV_TEXT})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["extraction"]["method"], "upstream")

    def test_extraction_method_none_for_unresolvable_extension(self):
        with patch.object(app_module.requests, "get", side_effect=_mock_get_returning(fb.table_docx_path())):
            resp = self.client.post("/analyze", json={"cv_id": "test", "file_url": "http://fake.test/cv.zip"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["extraction"]["method"], "none")

    # --- Real sample CV -----------------------------------------------------

    def test_real_sample_cv_end_to_end(self):
        with open(fb.SAMPLE_CV_PATH, "rb") as f:
            resp = self.client.post(
                "/analyze-cv",
                data={"target_role": "Data Analyst", "cv_file": (f, "cv.pdf")},
                content_type="multipart/form-data",
            )
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["extraction"]["method"], "text-layer")
        skills = {s.lower() for s in data["extracted_skills"]}
        self.assertTrue({"react", "docker", "mongodb"} & skills)
        self.assertGreater(data["experience_months"], 0)

    # --- Encrypted PDFs (fast — the decrypt check short-circuits before any
    # per-page extraction, so no OCR is ever reached here) -----------------

    def test_empty_password_pdf_via_analyze_cv_extracts_successfully(self):
        with open(fb.encrypted_pdf_path(""), "rb") as f:
            resp = self.client.post(
                "/analyze-cv",
                data={"target_role": "Data Analyst", "cv_file": (f, "cv.pdf")},
                content_type="multipart/form-data",
            )
        self.assertEqual(resp.status_code, 200)

    def test_real_password_pdf_via_analyze_cv_returns_clean_400(self):
        with open(fb.encrypted_pdf_path("secret123"), "rb") as f:
            resp = self.client.post(
                "/analyze-cv",
                data={"target_role": "Data Analyst", "cv_file": (f, "cv.pdf")},
                content_type="multipart/form-data",
            )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("password-protected", resp.get_json()["error"])

    # --- Slow, gated: real OCR paths ----------------------------------------

    @unittest.skipUnless(RUN_SLOW, SLOW_REASON)
    def test_extraction_method_ocr_via_analyze_cv(self):
        with open(fb.synthetic_cv_image_path(fb.SYNTHETIC_CV_LINES), "rb") as f:
            resp = self.client.post(
                "/analyze-cv",
                data={"target_role": "Data Analyst", "cv_file": (f, "cv.png")},
                content_type="multipart/form-data",
            )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["extraction"]["method"], "ocr")

    @unittest.skipUnless(RUN_SLOW, SLOW_REASON)
    def test_extraction_method_ocr_via_analyze_file_url(self):
        with patch.object(
            app_module.requests, "get",
            side_effect=_mock_get_returning(fb.synthetic_cv_image_path(fb.SYNTHETIC_CV_LINES)),
        ):
            resp = self.client.post("/analyze", json={"cv_id": "test", "file_url": "http://fake.test/cv.png"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.get_json()["extraction"]["method"], "ocr")


if __name__ == "__main__":
    unittest.main()
