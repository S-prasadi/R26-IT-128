"""
Module C — CV Job Analyzer
Model comparison script (Phase 2 of ../IMPROVEMENT_PLAN.md)
==============================================================
Reads the labeled dataset train.py already produced, cross-validates four
candidate algorithms (Random Forest — the current deployed baseline —
Gradient Boosting, Extra Trees, and a Voting Ensemble of the three), tunes
the winner with RandomizedSearchCV, and saves:

  - reports/phase2-model-comparison/model_comparison.csv   (the CV table)
  - reports/phase2-model-comparison/mae_r2_comparison.png
  - reports/phase2-model-comparison/feature_importance.png
  - reports/phase2-model-comparison/predicted_vs_actual.png
  - models/cv_job_score_model_v2.pkl                       (tuned winner,
                                                             refit on all data)
  - models/model_registry.json                             (v1 vs v2 metadata)

Does NOT touch the live deployed models/cv_job_score_model.pkl or app.py —
v2 is a candidate saved alongside it, per IMPROVEMENT_PLAN.md's versioning
discipline. Whether to deploy it is a Phase 6 decision.

Usage:
  python compare_models.py
"""

import os
import sys
import json
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.model_selection import train_test_split, cross_validate, RandomizedSearchCV
from sklearn.pipeline import Pipeline
from sklearn.ensemble import (
    RandomForestRegressor,
    HistGradientBoostingRegressor,
    ExtraTreesRegressor,
    VotingRegressor,
)
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.inspection import permutation_importance
import joblib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.scoring import FEATURE_COLUMNS
from train import LABELED_CSV_PATH, build_preprocessor

# ── Paths ─────────────────────────────────────────────────────────────────────

BASE = os.path.dirname(os.path.abspath(__file__))
MODULE_ROOT = os.path.dirname(BASE)

REPORT_DIR = os.path.join(MODULE_ROOT, "reports", "phase2-model-comparison")
os.makedirs(REPORT_DIR, exist_ok=True)

COMPARISON_CSV_PATH = os.path.join(REPORT_DIR, "model_comparison.csv")
MAE_R2_CHART_PATH = os.path.join(REPORT_DIR, "mae_r2_comparison.png")
FEATURE_IMPORTANCE_CHART_PATH = os.path.join(REPORT_DIR, "feature_importance.png")
PRED_VS_ACTUAL_CHART_PATH = os.path.join(REPORT_DIR, "predicted_vs_actual.png")

MODEL_V2_PATH = os.path.join(BASE, "models", "cv_job_score_model_v2.pkl")
REGISTRY_PATH = os.path.join(BASE, "models", "model_registry.json")

# The currently-deployed model's known metrics (notebook Step 10, on the
# original cleaned_cv_dataset.json) — recorded as v1 in the registry.
V1_HYPERPARAMETERS = {"n_estimators": 200, "random_state": 42}
V1_TEST_MAE = 1.22
V1_TEST_R2 = 0.9851

sns.set_theme(style="whitegrid")


# ── Candidates ───────────────────────────────────────────────────────────────────

def build_candidates():
    """Fresh, unfitted instances — called once for the CV comparison loop
    and again to get a clean instance of the winner before tuning."""
    return {
        "Random Forest": RandomForestRegressor(n_estimators=200, random_state=42),
        "Gradient Boosting": HistGradientBoostingRegressor(random_state=42),
        "Extra Trees": ExtraTreesRegressor(n_estimators=200, random_state=42),
        "Voting Ensemble": VotingRegressor(estimators=[
            ("rf", RandomForestRegressor(n_estimators=200, random_state=42)),
            ("gb", HistGradientBoostingRegressor(random_state=42)),
            ("et", ExtraTreesRegressor(n_estimators=200, random_state=42)),
        ]),
    }


PARAM_DISTRIBUTIONS = {
    "Random Forest": {
        "model__n_estimators": [100, 200, 300, 400],
        "model__max_depth": [None, 5, 10, 15, 20],
        "model__min_samples_leaf": [1, 2, 4, 8],
        "model__max_features": ["sqrt", "log2", None],
    },
    "Extra Trees": {
        "model__n_estimators": [100, 200, 300, 400],
        "model__max_depth": [None, 5, 10, 15, 20],
        "model__min_samples_leaf": [1, 2, 4, 8],
        "model__max_features": ["sqrt", "log2", None],
    },
    "Gradient Boosting": {
        "model__max_iter": [100, 200, 300],
        "model__learning_rate": [0.01, 0.03, 0.05, 0.1, 0.2],
        "model__max_depth": [None, 3, 5, 7, 10],
        "model__min_samples_leaf": [5, 10, 20, 30],
    },
    "Voting Ensemble": {
        "model__weights": [
            (1, 1, 1), (2, 1, 1), (1, 2, 1), (1, 1, 2),
            (2, 2, 1), (2, 1, 2), (1, 2, 2), (3, 1, 1), (1, 3, 1), (1, 1, 3),
        ],
    },
}


# ── Step: compare ────────────────────────────────────────────────────────────────

def compare_candidates(X_train, y_train):
    rows = []

    for name, estimator in build_candidates().items():
        pipeline = Pipeline(steps=[
            ("preprocessor", build_preprocessor()),
            ("model", estimator),
        ])

        print(f"Cross-validating: {name} ...")
        scores = cross_validate(
            pipeline, X_train, y_train, cv=5,
            scoring=["neg_mean_absolute_error", "r2"],
            n_jobs=-1,
        )

        cv_mae = -scores["test_neg_mean_absolute_error"]
        cv_r2 = scores["test_r2"]

        rows.append({
            "model": name,
            "cv_mae_mean": round(cv_mae.mean(), 4),
            "cv_mae_std": round(cv_mae.std(), 4),
            "cv_r2_mean": round(cv_r2.mean(), 4),
            "cv_r2_std": round(cv_r2.std(), 4),
        })

    comparison_df = pd.DataFrame(rows).sort_values("cv_mae_mean").reset_index(drop=True)

    print("\nModel comparison (5-fold CV on the training split):")
    print(comparison_df.to_string(index=False))

    comparison_df.to_csv(COMPARISON_CSV_PATH, index=False)
    print(f"\nSaved comparison table to {os.path.relpath(COMPARISON_CSV_PATH, MODULE_ROOT)}")

    return comparison_df


# ── Step: tune the winner ────────────────────────────────────────────────────────

def tune_winner(winner_name, X_train, y_train, X_test, y_test):
    estimator = build_candidates()[winner_name]
    pipeline = Pipeline(steps=[
        ("preprocessor", build_preprocessor()),
        ("model", estimator),
    ])

    print(f"\nTuning winner ({winner_name}) with RandomizedSearchCV ...")
    search = RandomizedSearchCV(
        pipeline,
        param_distributions=PARAM_DISTRIBUTIONS[winner_name],
        n_iter=20,
        cv=5,
        scoring="neg_mean_absolute_error",
        random_state=42,
        n_jobs=-1,
    )
    search.fit(X_train, y_train)

    tuned_pipeline = search.best_estimator_
    y_pred_test = tuned_pipeline.predict(X_test)

    tuned_test_mae = mean_absolute_error(y_test, y_pred_test)
    tuned_test_r2 = r2_score(y_test, y_pred_test)

    print("Best hyperparameters:", search.best_params_)
    print(f"Tuned held-out test MAE: {round(tuned_test_mae, 4)}")
    print(f"Tuned held-out test R2:  {round(tuned_test_r2, 4)}")

    return tuned_pipeline, search.best_params_, tuned_test_mae, tuned_test_r2, y_pred_test


# ── Step: charts ─────────────────────────────────────────────────────────────────

def chart_mae_r2_comparison(comparison_df):
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))

    order = comparison_df.sort_values("cv_mae_mean")
    axes[0].bar(order["model"], order["cv_mae_mean"], yerr=order["cv_mae_std"], capsize=4, color="#4C72B0")
    axes[0].set_title("Cross-validated MAE (lower is better)")
    axes[0].set_ylabel("MAE")
    axes[0].tick_params(axis="x", rotation=20)

    order_r2 = comparison_df.sort_values("cv_r2_mean", ascending=False)
    axes[1].bar(order_r2["model"], order_r2["cv_r2_mean"], yerr=order_r2["cv_r2_std"], capsize=4, color="#55A868")
    axes[1].set_title("Cross-validated R² (higher is better)")
    axes[1].set_ylabel("R²")
    axes[1].tick_params(axis="x", rotation=20)

    fig.suptitle("Phase 2 — Model Comparison (5-fold CV)")
    fig.tight_layout()
    fig.savefig(MAE_R2_CHART_PATH, dpi=150)
    plt.close(fig)
    print(f"Saved {os.path.relpath(MAE_R2_CHART_PATH, MODULE_ROOT)}")


def chart_feature_importance(tuned_pipeline, X_test, y_test):
    result = permutation_importance(
        tuned_pipeline, X_test, y_test,
        n_repeats=10, random_state=42, scoring="neg_mean_absolute_error",
    )

    importances = pd.Series(result.importances_mean, index=X_test.columns).sort_values()

    fig, ax = plt.subplots(figsize=(9, 7))
    ax.barh(importances.index, importances.values, color="#C44E52")
    ax.set_xlabel("Permutation importance (drop in MAE-scoring when shuffled)")
    ax.set_title("Phase 2 — Feature Importance (tuned winner, held-out test set)")
    fig.tight_layout()
    fig.savefig(FEATURE_IMPORTANCE_CHART_PATH, dpi=150)
    plt.close(fig)
    print(f"Saved {os.path.relpath(FEATURE_IMPORTANCE_CHART_PATH, MODULE_ROOT)}")


def chart_predicted_vs_actual(y_test, y_pred_test):
    fig, ax = plt.subplots(figsize=(7, 7))
    ax.scatter(y_test, y_pred_test, alpha=0.4, s=18, color="#4C72B0")

    lo = min(y_test.min(), y_pred_test.min())
    hi = max(y_test.max(), y_pred_test.max())
    ax.plot([lo, hi], [lo, hi], "r--", linewidth=1.5, label="y = x (perfect prediction)")

    ax.set_xlabel("Actual final_score")
    ax.set_ylabel("Predicted final_score")
    ax.set_title("Phase 2 — Predicted vs. Actual (tuned winner, held-out test set)")
    ax.legend()
    fig.tight_layout()
    fig.savefig(PRED_VS_ACTUAL_CHART_PATH, dpi=150)
    plt.close(fig)
    print(f"Saved {os.path.relpath(PRED_VS_ACTUAL_CHART_PATH, MODULE_ROOT)}")


# ── Step: save model + registry ──────────────────────────────────────────────────

def save_model_and_registry(tuned_pipeline, winner_name, best_params, comparison_df,
                             tuned_test_mae, tuned_test_r2, X, y):
    # Refit on the full dataset for the artifact that gets saved (standard
    # practice once a model/hyperparameters are selected via CV+held-out test).
    tuned_pipeline.fit(X, y)
    joblib.dump(tuned_pipeline, MODEL_V2_PATH)
    print(f"\nSaved tuned model (refit on all data) to {os.path.relpath(MODEL_V2_PATH, MODULE_ROOT)}")

    winner_row = comparison_df[comparison_df["model"] == winner_name].iloc[0]
    clean_params = {k.replace("model__", ""): v for k, v in best_params.items()}

    registry = {}
    if os.path.exists(REGISTRY_PATH):
        with open(REGISTRY_PATH, "r", encoding="utf-8") as file:
            registry = json.load(file)

    registry["v1"] = {
        "file": "cv_job_score_model.pkl",
        "algorithm": "RandomForestRegressor",
        "hyperparameters": V1_HYPERPARAMETERS,
        "trained_on": "notebook CV_Job_Model (3).ipynb, cleaned_cv_dataset.json (pre-2026-08-18)",
        "test_mae": V1_TEST_MAE,
        "test_r2": V1_TEST_R2,
        "status": "deployed (live) — loaded by app.py",
    }
    registry["v2"] = {
        "file": "cv_job_score_model_v2.pkl",
        "algorithm": winner_name,
        "hyperparameters": clean_params,
        "trained_on": "Dataset/combined_resumes.json via backend/train.py + backend/compare_models.py",
        "cv_mae_mean": float(winner_row["cv_mae_mean"]),
        "cv_r2_mean": float(winner_row["cv_r2_mean"]),
        "test_mae": round(float(tuned_test_mae), 4),
        "test_r2": round(float(tuned_test_r2), 4),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "status": "candidate, not yet deployed — see IMPROVEMENT_PLAN.md Phase 6",
    }

    with open(REGISTRY_PATH, "w", encoding="utf-8") as file:
        json.dump(registry, file, indent=2)

    print(f"Updated {os.path.relpath(REGISTRY_PATH, MODULE_ROOT)}")


# ── Main ─────────────────────────────────────────────────────────────────────────

def main():
    print("\n" + "#" * 55)
    print("#   Module C - Phase 2 - Model Comparison           #")
    print("#" * 55 + "\n")

    if not os.path.exists(LABELED_CSV_PATH):
        raise SystemExit(
            f"{os.path.relpath(LABELED_CSV_PATH, BASE)} not found — "
            "run `python train.py` first."
        )

    scored_df = pd.read_csv(LABELED_CSV_PATH)
    X = scored_df[FEATURE_COLUMNS]
    y = scored_df["final_score"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    comparison_df = compare_candidates(X_train, y_train)
    winner_name = comparison_df.iloc[0]["model"]
    print(f"\nWinner (lowest CV MAE): {winner_name}")

    chart_mae_r2_comparison(comparison_df)

    tuned_pipeline, best_params, tuned_test_mae, tuned_test_r2, y_pred_test = tune_winner(
        winner_name, X_train, y_train, X_test, y_test
    )

    chart_feature_importance(tuned_pipeline, X_test, y_test)
    chart_predicted_vs_actual(y_test, pd.Series(y_pred_test, index=y_test.index))

    save_model_and_registry(
        tuned_pipeline, winner_name, best_params, comparison_df,
        tuned_test_mae, tuned_test_r2, X, y
    )

    print("\nDone. The live deployed models/cv_job_score_model.pkl and app.py were not touched.")


if __name__ == "__main__":
    main()
