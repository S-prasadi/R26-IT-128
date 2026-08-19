"""
Module C — CV Job Analyzer
Training script (Phase 1 of ../IMPROVEMENT_PLAN.md)
=====================================================
Reproduces `models/CV_Job_Model (3).ipynb` (Steps 3, 6-11) as a script that
reads local files instead of Colab upload, and builds labels through the
live `utils/scoring.py` matching logic instead of a stale copy of the
notebook's own Step 4 helpers — so training-time labels and serving-time
features never disagree (see IMPROVEMENT_PLAN.md Phase 1 findings).

Each step reads its inputs from disk and writes its outputs to disk, so any
step can be re-run on its own once the earlier steps have produced their
files at least once (mirrors python-module-a/train.py's pattern).

Steps:
  1. load   — read Dataset/combined_resumes.json + models/job_role_profiles.json,
              adapt each CV record into the shape utils.scoring expects
  2. label  — build the 18-feature row + final_score/level per CV, save
              Dataset/scored_training_dataset.csv
  3. train  — fit a RandomForestRegressor baseline (same hyperparameters as
              the deployed model), report MAE/R²
  4. save   — write models/cv_job_score_model_baseline.pkl (does NOT touch
              the live deployed models/cv_job_score_model.pkl)

Usage:
  python train.py                # run all steps
  python train.py --step load
  python train.py --step label   # implies load
  python train.py --step train   # reads scored_training_dataset.csv from disk
  python train.py --step save    # implies train
"""

import os
import sys
import json
import argparse

import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
import joblib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.scoring import FEATURE_COLUMNS, build_feature_row, get_level

# ── Paths ─────────────────────────────────────────────────────────────────────

BASE = os.path.dirname(os.path.abspath(__file__))
CV_DATASET_PATH = os.path.join(BASE, "Dataset", "combined_resumes.json")
PROFILES_PATH = os.path.join(BASE, "models", "job_role_profiles.json")
LABELED_CSV_PATH = os.path.join(BASE, "Dataset", "scored_training_dataset.csv")
MODEL_OUT_PATH = os.path.join(BASE, "models", "cv_job_score_model_baseline.pkl")

# Reported by the original notebook (Step 10) on cleaned_cv_dataset.json —
# printed alongside this script's own numbers as a sanity-check reference,
# not asserted against (scoring.py's updated normalize_skill is expected to
# shift match ratios slightly from the notebook's stale mapping).
NOTEBOOK_REFERENCE_MAE = 1.22
NOTEBOOK_REFERENCE_R2 = 0.9851

CATEGORICAL_FEATURES = ["target_role", "experience_level"]
NUMERIC_FEATURES = [c for c in FEATURE_COLUMNS if c not in CATEGORICAL_FEATURES]


# ── Step 1: load + adapt ────────────────────────────────────────────────────────

def _adapt_cv_record(record):
    """Reshape one combined_resumes.json record into the columns
    utils.scoring's compare_cv_with_role / build_feature_row expect.
    """
    num_projects = record.get("num_projects", 0) or 0
    certificates = record.get("certificates_or_qualifications") or []
    num_certificates = len(certificates)

    project_technologies = []
    for project in record.get("projects_and_technologies_involved") or []:
        project_technologies.extend(project.get("technologies_used") or [])

    adapted = dict(record)
    adapted["cleaned_all_skills"] = record.get("all_skills") or []
    adapted["project_technologies"] = project_technologies
    adapted["has_projects"] = 1 if num_projects > 0 else 0
    adapted["num_certificates"] = num_certificates
    adapted["has_certificates"] = 1 if num_certificates > 0 else 0

    return adapted


def step_load():
    with open(CV_DATASET_PATH, "r", encoding="utf-8") as file:
        raw_records = json.load(file)

    with open(PROFILES_PATH, "r", encoding="utf-8") as file:
        job_role_profiles = json.load(file)

    cv_records = [_adapt_cv_record(record) for record in raw_records]

    print(f"Loaded {len(cv_records)} CVs from {os.path.relpath(CV_DATASET_PATH, BASE)}")
    print(f"Loaded {len(job_role_profiles)} role profiles from {os.path.relpath(PROFILES_PATH, BASE)}")

    return cv_records, job_role_profiles


# ── Step 2: label ────────────────────────────────────────────────────────────────

def compute_final_score(comparison, experience_months, num_projects, num_certificates, evaluation_score):
    """The hand-written label formula from the notebook's Step 7.

    Training-only logic (see IMPROVEMENT_PLAN.md / TRAINING_GUIDE.md §2.2):
    the trained model only learns to approximate this formula, it is never
    re-derived at inference time, so it does not belong in utils/scoring.py.
    """
    skill_score_component = (
        comparison["required_match_ratio"] * 40 +
        comparison["preferred_match_ratio"] * 10
    )

    project_score_component = (
        comparison["project_match_ratio"] * 15 +
        min(num_projects / 3, 1) * 5
    )

    experience_score_component = min(experience_months / 24, 1) * 15

    certificate_score_component = min(num_certificates / 5, 1) * 10

    ats_score_component = min(evaluation_score, 100) / 100 * 5

    return round(
        skill_score_component +
        project_score_component +
        experience_score_component +
        certificate_score_component +
        ats_score_component,
        2
    )


def step_label(cv_records, job_role_profiles):
    scored_rows = []

    for record in cv_records:
        target_role = record.get("target_role", "")
        feature_row, comparison = build_feature_row(record, target_role, job_role_profiles)

        experience_months = float(record.get("experience_months", 0) or 0)
        num_projects = float(record.get("num_projects", 0) or 0)
        num_certificates = float(record.get("num_certificates", 0) or 0)
        evaluation_score = float(record.get("evaluation_score", 0) or 0)

        final_score = compute_final_score(
            comparison, experience_months, num_projects, num_certificates, evaluation_score
        )

        scored_rows.append({
            "candidate_id": record.get("candidate_id", ""),
            **feature_row,
            "final_score": final_score,
            "level": get_level(final_score),
        })

    scored_df = pd.DataFrame(scored_rows)

    print("Scoring completed successfully")
    print("Scored dataset shape:", scored_df.shape)
    print("\nLevel distribution:")
    print(scored_df["level"].value_counts())
    print("\nScore summary:")
    print(scored_df["final_score"].describe())
    print("\nAverage score by target role:")
    print(scored_df.groupby("target_role")["final_score"].mean().sort_values(ascending=False))

    scored_df.to_csv(LABELED_CSV_PATH, index=False)
    print(f"\nLabeled training dataset saved to {os.path.relpath(LABELED_CSV_PATH, BASE)}")

    return scored_df


def _load_scored_df():
    if not os.path.exists(LABELED_CSV_PATH):
        raise SystemExit(
            f"{os.path.relpath(LABELED_CSV_PATH, BASE)} not found — "
            "run `python train.py --step label` (or `--step all`) first."
        )
    return pd.read_csv(LABELED_CSV_PATH)


# ── Step 3: train ────────────────────────────────────────────────────────────────

def build_preprocessor():
    """Shared ColumnTransformer: one-hot the categorical features, pass the
    rest through. Used by both this script and compare_models.py so every
    candidate model sees identical preprocessing.
    """
    return ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
            ("num", "passthrough", NUMERIC_FEATURES),
        ]
    )


def step_train(scored_df):
    X = scored_df[FEATURE_COLUMNS]
    y = scored_df["final_score"]

    preprocessor = build_preprocessor()

    pipeline = Pipeline(steps=[
        ("preprocessor", preprocessor),
        ("model", RandomForestRegressor(n_estimators=200, random_state=42)),
    ])

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    pipeline.fit(X_train, y_train)
    y_pred = pipeline.predict(X_test)

    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)

    print("Model trained successfully")
    print(f"Mean Absolute Error: {round(mae, 2)}  (notebook reference: {NOTEBOOK_REFERENCE_MAE})")
    print(f"R2 Score: {round(r2, 4)}  (notebook reference: {NOTEBOOK_REFERENCE_R2})")

    return pipeline


# ── Step 4: save ─────────────────────────────────────────────────────────────────

def step_save(pipeline):
    joblib.dump(pipeline, MODEL_OUT_PATH)
    print(f"Baseline model saved to {os.path.relpath(MODEL_OUT_PATH, BASE)}")
    print("(the live deployed models/cv_job_score_model.pkl was not touched)")


# ── CLI ──────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Module C training script (Phase 1)")
    parser.add_argument(
        "--step",
        choices=["load", "label", "train", "save", "all"],
        default="all",
    )
    args = parser.parse_args()

    print("\n" + "#" * 55)
    print("#   Module C - CV Job Analyzer - Training           #")
    print("#   SLIIT R26-IT-128                                #")
    print("#" * 55 + "\n")

    if args.step == "load":
        step_load()
        return

    if args.step == "label":
        cv_records, job_role_profiles = step_load()
        step_label(cv_records, job_role_profiles)
        return

    if args.step == "train":
        scored_df = _load_scored_df()
        step_train(scored_df)
        return

    if args.step == "save":
        scored_df = _load_scored_df()
        pipeline = step_train(scored_df)
        step_save(pipeline)
        return

    # all
    cv_records, job_role_profiles = step_load()
    scored_df = step_label(cv_records, job_role_profiles)
    pipeline = step_train(scored_df)
    step_save(pipeline)


if __name__ == "__main__":
    main()
