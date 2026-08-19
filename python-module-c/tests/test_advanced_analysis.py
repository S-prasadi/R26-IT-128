import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from utils.advanced_analysis import analyze_quality, compare_job_advanced, extract_skill_evidence


CV = """Summary
Software engineer focused on reliable web products.
Experience
Software Engineer 2021 - Present
Developed React dashboards for 500 users and reduced load time by 30%.
Built Python services with FastAPI.
Projects
Created a TypeScript application using React.
Skills
React, TypeScript, Python, Docker
"""


class AdvancedAnalysisTests(unittest.TestCase):
    def test_skills_have_evidence_and_independent_proficiency(self):
        skills = extract_skill_evidence(CV)
        react = next(s for s in skills if s["normalized_name"] == "react")
        docker = next(s for s in skills if s["normalized_name"] == "docker")
        self.assertTrue(react["evidence"])
        self.assertGreater(react["confidence"], docker["confidence"])
        self.assertNotEqual(react["proficiency"], docker["proficiency"])

    def test_negated_skill_is_not_claimed(self):
        skills = extract_skill_evidence("Skills\nNo experience with Kubernetes. Python")
        names = {s["normalized_name"] for s in skills}
        self.assertNotIn("kubernetes", names)
        self.assertIn("python", names)

    def test_generic_analysis_does_not_claim_data_analysis(self):
        names = {s["normalized_name"] for s in extract_skill_evidence("Summary\nCompleted an analysis of customer feedback.")}
        self.assertNotIn("data analysis", names)

    def test_components_are_bounded_and_have_no_retired_score(self):
        result = analyze_quality(CV)
        self.assertNotIn("ats_score", result)
        self.assertTrue(all(0 <= score <= 100 for score in result["component_scores"].values()))

    def test_job_required_preferred_and_experience(self):
        job = "Required: React, Python, Kubernetes. Minimum 5 years experience. Nice to have Docker. You will build APIs."
        result = compare_job_advanced(CV, job)
        self.assertIn("Kubernetes", result["missing_skills"])
        self.assertTrue(result["mandatory_blockers"])
        self.assertLessEqual(result["match_pct"], 90)


if __name__ == "__main__":
    unittest.main()
