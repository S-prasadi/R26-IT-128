import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from utils.scoring import (
    normalize_skill,
    compare_cv_with_role,
    build_feature_row,
    get_level,
    generate_recommendations,
    FEATURE_COLUMNS,
)


ROLE_PROFILES = {
    "Data Analyst": {
        "role": "Data Analyst",
        "required_skills": ["Python", "SQL", "Excel", "Data Analysis"],
        "preferred_skills": ["Power BI", "Tableau"],
    }
}

CV_ROW = {
    "candidate_id": "TEST",
    "target_role": "Data Analyst",
    "experience_level": "Mid",
    "cleaned_all_skills": ["Python", "SQL", "Power BI"],
    "project_technologies": ["Python"],
    "experience_months": 18,
    "num_projects": 2,
    "has_projects": 1,
    "num_certificates": 1,
    "has_certificates": 1,
    "evaluation_score": 60.0,
}


class NormalizeSkillTests(unittest.TestCase):
    def test_known_aliases_map_to_canonical_form(self):
        self.assertEqual(normalize_skill("MySQL"), "sql")
        self.assertEqual(normalize_skill("PostgreSQL"), "sql")
        self.assertEqual(normalize_skill("GitHub"), "git")
        self.assertEqual(normalize_skill("scikit learn"), "scikit-learn")

    def test_unmapped_skill_is_lowercased_and_cleaned(self):
        self.assertEqual(normalize_skill("  React.JS "), "react")


class CompareCvWithRoleTests(unittest.TestCase):
    def test_matched_and_missing_are_correct(self):
        comparison = compare_cv_with_role(CV_ROW, ROLE_PROFILES)
        self.assertIn("Python", comparison["matched_required_skills"])
        self.assertIn("SQL", comparison["matched_required_skills"])
        self.assertIn("Excel", comparison["missing_required_skills"])
        self.assertIn("Power BI", comparison["matched_preferred_skills"])

    def test_ratios_are_between_0_and_1(self):
        comparison = compare_cv_with_role(CV_ROW, ROLE_PROFILES)
        self.assertGreaterEqual(comparison["required_match_ratio"], 0)
        self.assertLessEqual(comparison["required_match_ratio"], 1)

    def test_unknown_role_returns_empty_comparison(self):
        comparison = compare_cv_with_role(CV_ROW, {})
        self.assertEqual(comparison["matched_required_skills"], [])
        self.assertEqual(comparison["required_match_ratio"], 0)


class BuildFeatureRowTests(unittest.TestCase):
    def test_feature_row_has_exactly_the_expected_columns(self):
        feature_row, _ = build_feature_row(CV_ROW, "Data Analyst", ROLE_PROFILES)
        self.assertEqual(set(feature_row.keys()), set(FEATURE_COLUMNS))

    def test_feature_row_uses_the_selected_role_not_the_input_role(self):
        feature_row, _ = build_feature_row(CV_ROW, "Some Other Role", ROLE_PROFILES)
        self.assertEqual(feature_row["target_role"], "Some Other Role")


class GetLevelTests(unittest.TestCase):
    def test_thresholds(self):
        self.assertEqual(get_level(85), "Advanced")
        self.assertEqual(get_level(80), "Advanced")
        self.assertEqual(get_level(79.9), "Intermediate")
        self.assertEqual(get_level(50), "Intermediate")
        self.assertEqual(get_level(49.9), "Beginner")


class GenerateRecommendationsTests(unittest.TestCase):
    def test_missing_required_skills_produce_recommendations(self):
        comparison = compare_cv_with_role(CV_ROW, ROLE_PROFILES)
        recommendations = generate_recommendations(comparison)
        self.assertTrue(any("Excel" in r for r in recommendations))

    def test_no_missing_skills_gives_a_positive_message(self):
        comparison = {
            "missing_required_skills": [],
            "missing_preferred_skills": [],
        }
        recommendations = generate_recommendations(comparison)
        self.assertEqual(len(recommendations), 1)
        self.assertIn("matches", recommendations[0])


if __name__ == "__main__":
    unittest.main()
