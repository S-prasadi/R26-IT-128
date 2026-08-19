"""
Module C — CV Job Analyzer
Score distribution builder (Phase 4 of ../IMPROVEMENT_PLAN.md)
==================================================================
Reads Phase 1's labeled dataset and writes a per-role distribution of
final_score, used at inference time by utils/relative_eval.py to answer
"how does this candidate compare to other applicants for this role?"

Uses the ground-truth final_score labels from scored_training_dataset.csv
(not combined_resumes.json's evaluation_score/skill_score — those are on a
different scale and don't match what /analyze predicts) so the distribution
is model-agnostic and stays valid across model versions.

Usage:
  python build_score_distributions.py
"""

import os
import json
from datetime import datetime, timezone

import pandas as pd

BASE = os.path.dirname(os.path.abspath(__file__))
LABELED_CSV_PATH = os.path.join(BASE, "Dataset", "scored_training_dataset.csv")
OUT_PATH = os.path.join(BASE, "models", "role_score_distributions.json")

PERCENTILE_MARKS = [10, 25, 50, 75, 90]


def main():
    if not os.path.exists(LABELED_CSV_PATH):
        raise SystemExit(
            f"{os.path.relpath(LABELED_CSV_PATH, BASE)} not found — "
            "run `python train.py` first."
        )

    df = pd.read_csv(LABELED_CSV_PATH)

    roles = {}
    for role, group in df.groupby("target_role"):
        scores = sorted(round(float(s), 2) for s in group["final_score"])
        percentiles = {
            f"p{mark}": round(float(pd.Series(scores).quantile(mark / 100)), 2)
            for mark in PERCENTILE_MARKS
        }
        roles[role] = {
            "count": len(scores),
            "scores": scores,
            "percentiles": percentiles,
        }

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Dataset/scored_training_dataset.csv (Phase 1)",
        "roles": roles,
    }

    with open(OUT_PATH, "w", encoding="utf-8") as file:
        json.dump(output, file, indent=2)

    total = sum(r["count"] for r in roles.values())
    print(f"Wrote {len(roles)} roles ({total} total candidates) to {os.path.relpath(OUT_PATH, BASE)}")


if __name__ == "__main__":
    main()
