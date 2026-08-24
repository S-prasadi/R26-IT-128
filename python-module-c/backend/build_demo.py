"""
Module C — CV Job Analyzer
Model testing & demo script (Phase 5 of ../IMPROVEMENT_PLAN.md)
===================================================================
Picks one representative CV per role across 5 well-populated roles and
scores each with the live deployed model (the same one app.py's
/analyze-cv serves), producing a per-role breakdown instead of one
averaged number — the supervisor's original "~58% average" complaint.

Roles are deliberately drawn from the 18 well-populated roles found in
Phase 4 (93-174 CVs each) — 6 other roles (AI Engineer, Software Developer,
etc.) have only 1-2 CVs each due to near-duplicate labels and are excluded.

Candidates are scored by replicating /analyze-cv's own logic directly on
the adapted structured record (train._adapt_cv_record -> build_feature_row
-> predict), the same approach Phase 1 and Phase 4 used — combined_resumes.json
has no raw CV prose text to run through /analyze-cv's file-upload endpoint.

Usage:
  python build_demo.py
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
from utils.scoring import build_feature_row, get_level, generate_recommendations
from utils.relative_eval import (
    DISTRIBUTIONS_PATH,
    load_score_distributions,
    percentile_for_score,
    percentile_label,
)

BASE = os.path.dirname(os.path.abspath(__file__))
MODULE_ROOT = os.path.dirname(BASE)
MODEL_PATH = os.path.join(BASE, "models", "cv_job_score_model_v2.pkl")

REPORT_DIR = os.path.join(MODULE_ROOT, "reports", "phase5-model-testing-demo")
os.makedirs(REPORT_DIR, exist_ok=True)

RESULTS_PATH = os.path.join(REPORT_DIR, "demo_results.json")
CHART_PATH = os.path.join(REPORT_DIR, "demo_scores_chart.png")

# Well-populated roles only (93-174 CVs each) — see IMPROVEMENT_PLAN.md
# Phase 4 findings for the 6 roles excluded (1-2 CVs each).
DEMO_ROLES = ["Data Analyst", "Frontend Developer", "Full Stack Developer", "AI ML", "DevOps Engineer"]

sns.set_theme(style="whitegrid")


def score_candidate(record, role, job_role_profiles, score_model, distributions):
    adapted = _adapt_cv_record(record)
    feature_row, comparison = build_feature_row(adapted, role, job_role_profiles)

    predicted_score = round(float(score_model.predict(pd.DataFrame([feature_row]))[0]), 2)
    predicted_level = get_level(predicted_score)
    recommendations = generate_recommendations(comparison)
    percentile = percentile_for_score(role, predicted_score, distributions)

    return {
        "candidate_id": record.get("candidate_id", ""),
        "candidate_name": record.get("candidate_name", ""),
        "target_role": role,
        "predicted_score": predicted_score,
        "predicted_level": predicted_level,
        "percentile": percentile,
        "percentile_label": percentile_label(percentile),
        "experience_level": adapted.get("experience_level", ""),
        "experience_months": adapted.get("experience_months", 0),
        "num_projects": adapted.get("num_projects", 0),
        "num_certificates": adapted.get("num_certificates", 0),
        "matched_required_skills": comparison["matched_required_skills"],
        "matched_preferred_skills": comparison["matched_preferred_skills"],
        "missing_required_skills": comparison["missing_required_skills"],
        "missing_preferred_skills": comparison["missing_preferred_skills"],
        "recommendations": recommendations,
    }


def chart_demo_scores(results):
    labels = [f"{r['target_role']}\n({r['candidate_id']})" for r in results]
    scores = [r["predicted_score"] for r in results]
    percentiles = [r["percentile"] for r in results]

    fig, ax = plt.subplots(figsize=(10, 6))
    bars = ax.bar(labels, scores, color="#4C72B0")

    for bar, score, pct in zip(bars, scores, percentiles):
        pct_text = f"{pct}th pct" if pct is not None else "n/a"
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5,
                 f"{score:.1f} ({pct_text})", ha="center", va="bottom")

    ax.set_ylabel("Predicted final_score")
    ax.set_title("Phase 5 — Demo Candidates: Score & Percentile by Role")
    fig.tight_layout()
    fig.savefig(CHART_PATH, dpi=150)
    plt.close(fig)
    print(f"Saved {os.path.relpath(CHART_PATH, MODULE_ROOT)}")


def main():
    for path in (CV_DATASET_PATH, PROFILES_PATH, MODEL_PATH, DISTRIBUTIONS_PATH):
        if not os.path.exists(path):
            raise SystemExit(f"{path} not found — run earlier phase scripts first.")

    with open(CV_DATASET_PATH, "r", encoding="utf-8") as file:
        raw_records = json.load(file)

    with open(PROFILES_PATH, "r", encoding="utf-8") as file:
        job_role_profiles = json.load(file)

    score_model = joblib.load(MODEL_PATH)
    distributions = load_score_distributions()

    results = []
    for role in DEMO_ROLES:
        record = next(r for r in raw_records if r["target_role"] == role)
        result = score_candidate(record, role, job_role_profiles, score_model, distributions)
        results.append(result)
        print(f"{role}: {result['candidate_id']} -> score={result['predicted_score']}, "
              f"level={result['predicted_level']}, percentile={result['percentile']}")

    with open(RESULTS_PATH, "w", encoding="utf-8") as file:
        json.dump(results, file, indent=2)
    print(f"\nSaved {os.path.relpath(RESULTS_PATH, MODULE_ROOT)}")

    chart_demo_scores(results)


if __name__ == "__main__":
    main()
