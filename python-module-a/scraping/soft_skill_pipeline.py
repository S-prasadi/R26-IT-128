"""
Soft-Skill Aggregation Pipeline (Phase 5)
--------------------------------------------
Turns a set of (job_ref, description_text) pairs into the same
week/skill/trend_index/source/provenance shape Phase 3's technical pipeline
already uses (see scraping/topjobs_scraper.py::run()) -- same schema, so
build_trends_dataset.py's existing merge pattern would work unchanged once
this has real input to run on.

Not wired into anything yet: there is currently no caller that produces real
(job_ref, description) pairs -- that's topjobs_scraper.py's
fetch_full_description(), which is intentionally stubbed pending a decision
on the ~270+-request footprint that fetching full descriptions requires. See
docs/skill-forecasting-improvement-plan.md Phase 5.

Usage (once a real source exists):
    from soft_skill_pipeline import aggregate_soft_skills
    postings = [(job_ref, fetch_full_description(job_ref)) for job_ref in job_refs]
    rows = aggregate_soft_skills(postings, week="2026-W34")
"""

import os
import sys
from datetime import datetime

import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
from soft_skills import extract_soft_skills, SOFT_SKILLS

OUT_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "data", "raw", "local", "soft_skills_real.csv")
)


def aggregate_soft_skills(postings: list, week: str = None) -> pd.DataFrame:
    """postings: list of (job_ref, description_text) tuples.
    Returns a DataFrame with columns: week, skill, trend_index, source, provenance
    -- one row per soft skill mentioned in at least one posting that week.
    Score = % of postings mentioning the skill, same convention
    topjobs_scraper.py uses for technical skills."""
    week = week or datetime.now().strftime("%Y-W%W")
    total = len(postings)

    mentions = dict.fromkeys(SOFT_SKILLS, 0)
    for _, text in postings:
        for skill in extract_soft_skills(text):
            mentions[skill] += 1

    rows = [
        {
            "week":        week,
            "skill":       skill,
            "trend_index": round(100 * count / total, 1) if total else 0.0,
            "source":      "topjobs_lk_soft",
            "provenance":  "real",
        }
        for skill, count in mentions.items()
        if count > 0
    ]
    return pd.DataFrame(rows).sort_values("trend_index", ascending=False) if rows else pd.DataFrame(
        columns=["week", "skill", "trend_index", "source", "provenance"]
    )


def write_soft_skills(postings: list, week: str = None) -> pd.DataFrame:
    out = aggregate_soft_skills(postings, week)
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    if os.path.exists(OUT_PATH) and not out.empty:
        existing = pd.read_csv(OUT_PATH)
        existing = existing[existing["week"] != out["week"].iloc[0]]
        out = pd.concat([existing, out], ignore_index=True)
    out.to_csv(OUT_PATH, index=False)
    return out
