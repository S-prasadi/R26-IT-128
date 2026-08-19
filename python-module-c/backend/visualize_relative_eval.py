"""
Module C — CV Job Analyzer
Relative evaluation chart (Phase 4 addition, ../IMPROVEMENT_PLAN.md)
========================================================================
Phase 4 added a percentile lookup (utils/relative_eval.py) but no visual
component. This script adds a reusable chart: a role's score distribution
with a candidate's score/percentile marked on it, so "how does this
candidate compare to other applicants for this role?" has a picture, not
just a number.

Illustrated with two real candidates from well-populated roles (>100 CVs
each in this dataset, so the histogram is meaningful):
  - CAND_B208BBBB  (Data Analyst, 174 CVs) — the notebook's Step 7 example row
  - CAND_99FD4846  (AI ML, 138 CVs)

Note: CAND_920D187A (AI Engineer), the notebook's own running example
elsewhere in this project, is deliberately NOT used here — "AI Engineer"
turns out to have only 1 CV in this dataset (see IMPROVEMENT_PLAN.md Phase 4
findings), so percentile_for_score correctly declines to report a
percentile for it. Good proof the safety guard works, bad example for a
histogram.

Usage:
  python visualize_relative_eval.py
"""

import os
import sys
import json

import joblib
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from train import CV_DATASET_PATH, PROFILES_PATH, _adapt_cv_record
from utils.scoring import build_feature_row
from utils.relative_eval import (
    DISTRIBUTIONS_PATH,
    load_score_distributions,
    percentile_for_score,
    percentile_label,
)

BASE = os.path.dirname(os.path.abspath(__file__))
MODULE_ROOT = os.path.dirname(BASE)
MODEL_PATH = os.path.join(BASE, "models", "cv_job_score_model.pkl")

REPORT_DIR = os.path.join(MODULE_ROOT, "reports", "phase4-relative-evaluation")
os.makedirs(REPORT_DIR, exist_ok=True)

EXAMPLE_CANDIDATE_IDS = ["CAND_B208BBBB", "CAND_99FD4846"]

sns.set_theme(style="whitegrid")


def chart_percentile(role, score, candidate_label, distributions, output_path):
    scores = distributions.get(role, {}).get("scores", [])
    percentile = percentile_for_score(role, score, distributions)

    fig, ax = plt.subplots(figsize=(8, 5))
    sns.histplot(scores, bins=20, color="#4C72B0", ax=ax)
    ax.axvline(score, color="#C44E52", linestyle="--", linewidth=2,
               label=f"{candidate_label}: {score:.1f}")

    ax.set_title(f"Phase 4 — {role} score distribution ({len(scores)} candidates)")
    ax.set_xlabel("final_score")
    ax.set_ylabel("Number of candidates")

    label = percentile_label(percentile) or "Not enough historical data for this role"
    ax.text(0.02, 0.95, label, transform=ax.transAxes, va="top",
             bbox=dict(boxstyle="round", facecolor="white", alpha=0.85))
    ax.legend(loc="upper right")

    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)
    print(f"Saved {os.path.relpath(output_path, MODULE_ROOT)} "
          f"({candidate_label}, {role}, score={score:.2f}, percentile={percentile})")

    return percentile


def main():
    for path in (CV_DATASET_PATH, PROFILES_PATH, MODEL_PATH, DISTRIBUTIONS_PATH):
        if not os.path.exists(path):
            raise SystemExit(f"{path} not found — run earlier phase scripts first.")

    with open(CV_DATASET_PATH, "r", encoding="utf-8") as file:
        raw_records = {r["candidate_id"]: r for r in json.load(file)}

    with open(PROFILES_PATH, "r", encoding="utf-8") as file:
        job_role_profiles = json.load(file)

    score_model = joblib.load(MODEL_PATH)
    distributions = load_score_distributions()

    for candidate_id in EXAMPLE_CANDIDATE_IDS:
        record = _adapt_cv_record(raw_records[candidate_id])
        role = record["target_role"]

        feature_row, _ = build_feature_row(record, role, job_role_profiles)
        score = round(float(score_model.predict(pd.DataFrame([feature_row]))[0]), 2)

        output_path = os.path.join(REPORT_DIR, f"percentile_{candidate_id}.png")
        chart_percentile(role, score, candidate_id, distributions, output_path)


if __name__ == "__main__":
    main()
