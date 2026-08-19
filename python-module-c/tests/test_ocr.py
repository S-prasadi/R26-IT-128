import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

import fixture_builders as fb
from utils.ocr import extract_text_from_image, text_quality

RUN_SLOW = os.environ.get("RUN_SLOW_TESTS") == "1"
SLOW_REASON = "real OCR call (45-80s) — set RUN_SLOW_TESTS=1 to run"


class TextQualityTests(unittest.TestCase):
    def test_empty_text_scores_zero(self):
        self.assertEqual(text_quality(""), 0.0)
        self.assertEqual(text_quality(None), 0.0)

    def test_real_cv_shaped_text_scores_high(self):
        text = (
            "Summary\nExperienced data analyst with 3 years of experience.\n"
            "Experience\nData Analyst, Acme Corp, Jan 2022 - Present\n"
            "Built dashboards using Power BI and Excel.\n"
            "Education\nBSc Computer Science, University of Colombo\n"
            "Skills\nPython, SQL, Power BI, Excel\n"
        )
        # Short sample text — the word-count term scales against a 250-word
        # cap, so a realistic score here is well below 100, just clearly
        # above the OCR-fallback quality gate (55) and far above garbage.
        self.assertGreater(text_quality(text), 65)

    def test_garbage_scores_low(self):
        self.assertLess(text_quality("$#@! %^&* ()_+ ~`[]{}"), 20)

    def test_heading_keywords_increase_score(self):
        plain = "Some words here that are not headings at all really."
        with_headings = plain + " Experience Education Skills Projects Summary Profile"
        self.assertGreater(text_quality(with_headings), text_quality(plain))


@unittest.skipUnless(RUN_SLOW, SLOW_REASON)
class RealOcrTests(unittest.TestCase):
    def test_extract_text_from_image_returns_readable_text(self):
        text = extract_text_from_image(fb.synthetic_cv_image_path(fb.SYNTHETIC_CV_LINES))
        self.assertGreater(len(text.strip()), 20)
        self.assertIn("Jane", text)


if __name__ == "__main__":
    unittest.main()
