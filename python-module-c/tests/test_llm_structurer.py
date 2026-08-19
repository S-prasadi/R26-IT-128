import json
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from utils import llm_structurer
from utils.llm_structurer import SECTION_KEYS, _parse_llm_json

RUN_SLOW = os.environ.get("RUN_SLOW_TESTS") == "1"
SLOW_REASON = "real Ollama call — set RUN_SLOW_TESTS=1 to run"


class ParseLlmJsonTests(unittest.TestCase):
    """Fast, deterministic tests of the actual parsing/validation logic —
    no network call, fed hand-written strings covering the real shapes an
    LLM response can take."""

    def test_valid_json(self):
        raw = json.dumps({"summary": "hi", "skills": "python"})
        result = _parse_llm_json(raw)
        self.assertEqual(result, {"summary": "hi", "skills": "python"})

    def test_json_wrapped_in_prose_uses_regex_fallback(self):
        raw = 'Sure! Here is the JSON:\n{"summary": "hi"}\nHope that helps.'
        result = _parse_llm_json(raw)
        self.assertEqual(result, {"summary": "hi"})

    def test_extra_unexpected_keys_are_ignored_not_rejected(self):
        # Real behavior observed against the live model: it sometimes adds
        # its own bucket (e.g. "achievements") beyond the requested keys.
        raw = json.dumps({"summary": "hi", "achievements": "won a hackathon"})
        result = _parse_llm_json(raw)
        self.assertEqual(result, {"summary": "hi"})
        self.assertNotIn("achievements", result)

    def test_empty_values_are_dropped(self):
        raw = json.dumps({"summary": "hi", "projects": "", "education": "   "})
        result = _parse_llm_json(raw)
        self.assertEqual(result, {"summary": "hi"})

    def test_malformed_json_returns_none(self):
        self.assertIsNone(_parse_llm_json("{not valid json at all"))

    def test_non_dict_json_returns_none(self):
        self.assertIsNone(_parse_llm_json(json.dumps(["summary", "hi"])))

    def test_non_string_value_returns_none(self):
        raw = json.dumps({"summary": {"nested": "object"}})
        self.assertIsNone(_parse_llm_json(raw))

    def test_all_section_keys_survive_a_full_response(self):
        raw = json.dumps({key: f"content for {key}" for key in SECTION_KEYS})
        result = _parse_llm_json(raw)
        self.assertEqual(set(result.keys()), set(SECTION_KEYS))


class UnreachableOllamaTests(unittest.TestCase):
    """No gate needed — connection-refused fails in ~0ms, confirmed ad hoc
    during Phase 2. This must stay fast even without RUN_SLOW_TESTS."""

    def test_unreachable_ollama_returns_none_quickly(self):
        original = llm_structurer._OLLAMA_BASE_URL
        llm_structurer._OLLAMA_BASE_URL = "http://localhost:1"
        try:
            start = time.time()
            result = llm_structurer.structure_sections("Summary\nSome CV text.")
            elapsed = time.time() - start
        finally:
            llm_structurer._OLLAMA_BASE_URL = original

        self.assertIsNone(result)
        self.assertLess(elapsed, 5)


@unittest.skipUnless(RUN_SLOW, SLOW_REASON)
class RealOllamaTests(unittest.TestCase):
    def test_structure_sections_against_a_real_cv(self):
        cv_text = (
            "Career Objective\nSeeking a data analyst role.\n\n"
            "Key Skills\nPython, SQL, Power BI, Tableau\n\n"
            "Employment History\nData Analyst, Acme Corp, Jan 2022 - Present\n"
        )
        sections = llm_structurer.structure_sections(cv_text)
        self.assertIsNotNone(sections)
        self.assertIn("skills", sections)
        self.assertIn("python", sections["skills"].lower())


if __name__ == "__main__":
    unittest.main()
