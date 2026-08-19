"""
Soft-Skill Extraction (Phase 5)
---------------------------------
Keyword-based soft-skill detection from job-description text. Mirrors
backend/supabase/migrations/0030_soft_skills_catalog.sql exactly -- every
name here has a matching catalog row (category='Soft Skills',
type='competency').

This module is fully functional and tested against sample text on its own.
What's NOT built yet is a real source of full job-description text to run
it on -- see topjobs_scraper.py's fetch_full_description() (stubbed) and
docs/skill-forecasting-improvement-plan.md's Phase 5 entry for why: getting
real descriptions means opening ~270+ individual postings instead of the 2
category-page requests the rest of Module A's scraping uses, a footprint
that needs its own explicit go-ahead rather than being assumed.

Usage (once a text source exists):
    from soft_skills import extract_soft_skills
    found = extract_soft_skills(job_description_text)
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from topjobs_scraper import word_boundary_pattern

# Keyed by canonical name (matches the migration's `name` column, lowercased).
# Each entry lists the phrase(s) that count as a mention -- kept deliberately
# short and unambiguous; broader phrasing can be added once real text shows
# what job descriptions actually say, rather than guessed in advance.
SOFT_SKILLS = {
    "communication":         ["communication", "communication skills"],
    "teamwork":               ["teamwork", "team player", "team-oriented"],
    "leadership":             ["leadership", "leading a team", "team lead"],
    "problem solving":        ["problem solving", "problem-solving"],
    "time management":        ["time management"],
    "adaptability":           ["adaptability", "adaptable"],
    "critical thinking":      ["critical thinking"],
    "collaboration":          ["collaboration", "collaborative"],
    "interpersonal skills":   ["interpersonal skills", "interpersonal"],
    "creativity":             ["creativity", "creative thinking", "creative"],
    "work ethic":             ["work ethic"],
    "emotional intelligence": ["emotional intelligence"],
}


def build_soft_skill_patterns() -> dict:
    return {
        skill: [word_boundary_pattern(phrase) for phrase in phrases]
        for skill, phrases in SOFT_SKILLS.items()
    }


_PATTERNS = build_soft_skill_patterns()


def extract_soft_skills(text: str) -> set:
    """Returns the set of canonical soft-skill names mentioned in `text`."""
    if not text:
        return set()
    return {skill for skill, patterns in _PATTERNS.items() if any(p.search(text) for p in patterns)}
