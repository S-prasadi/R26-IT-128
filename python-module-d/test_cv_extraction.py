import unittest

from main import _clean_extracted_text, _order_ocr_results, _parse_cv_sections_fallback, _text_quality


class CvExtractionTests(unittest.TestCase):
    def test_text_quality_prefers_readable_cv_content(self):
        good = "Professional Experience\nSoftware Engineer\nEducation\nSkills\nPython React Docker"
        bad = "|||| @@@ 11 __ ??"
        self.assertGreater(_text_quality(good), _text_quality(bad))

    def test_ocr_boxes_are_restored_to_line_order(self):
        results = [
            ([[100, 30], [180, 30], [180, 45], [100, 45]], "Engineer", .9),
            ([[10, 30], [90, 30], [90, 45], [10, 45]], "Software", .95),
            ([[10, 60], [80, 60], [80, 75], [10, 75]], "Python", .88),
        ]
        text, confidence = _order_ocr_results(results)
        self.assertIn("Software Engineer", text)
        self.assertGreater(confidence, .8)

    def test_deterministic_sections_work_without_llm(self):
        text = """John Doe
Professional Summary
Backend engineer building reliable services.
Experience
Software Engineer
Jan 2022 - Present
Developed APIs for 500 users.
Education
BSc Computer Science, Example University
Technical Skills
Python, FastAPI, Docker, PostgreSQL
Projects
Recruitment Platform
"""
        result = _parse_cv_sections_fallback(text, {"email": "john@example.com"})
        self.assertTrue(result["summary"])
        self.assertTrue(result["experience"])
        self.assertIn("Python", result["skills"]["languages"])
        self.assertIn("FastAPI", result["skills"]["frameworks"])
        self.assertTrue(result["projects"])

    def test_cleanup_repairs_hyphenated_wrap(self):
        self.assertEqual(_clean_extracted_text("implemen-\ntation"), "implementation")


if __name__ == "__main__":
    unittest.main()
