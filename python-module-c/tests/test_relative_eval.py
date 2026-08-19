import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from utils.relative_eval import percentile_for_score, percentile_label


DISTRIBUTIONS = {
    "Data Analyst": {
        "count": 6,
        "scores": [10.0, 20.0, 30.0, 40.0, 50.0, 60.0],
    },
    "Tiny Role": {
        "count": 2,
        "scores": [10.0, 20.0],
    },
}


class RelativeEvalTests(unittest.TestCase):
    def test_score_at_max_is_near_100th_percentile(self):
        percentile = percentile_for_score("Data Analyst", 60.0, DISTRIBUTIONS)
        self.assertEqual(percentile, 100)

    def test_score_below_min_is_0th_percentile(self):
        percentile = percentile_for_score("Data Analyst", 5.0, DISTRIBUTIONS)
        self.assertEqual(percentile, 0)

    def test_percentile_is_monotonic_with_score(self):
        low = percentile_for_score("Data Analyst", 15.0, DISTRIBUTIONS)
        mid = percentile_for_score("Data Analyst", 35.0, DISTRIBUTIONS)
        high = percentile_for_score("Data Analyst", 55.0, DISTRIBUTIONS)
        self.assertLess(low, mid)
        self.assertLess(mid, high)

    def test_unknown_role_returns_none(self):
        self.assertIsNone(percentile_for_score("Nonexistent Role", 50.0, DISTRIBUTIONS))

    def test_role_with_too_few_samples_returns_none(self):
        self.assertIsNone(percentile_for_score("Tiny Role", 15.0, DISTRIBUTIONS))

    def test_percentile_label_formatting(self):
        self.assertEqual(
            percentile_label(72),
            "Scored higher than 72% of candidates for this role",
        )
        self.assertIsNone(percentile_label(None))


if __name__ == "__main__":
    unittest.main()
