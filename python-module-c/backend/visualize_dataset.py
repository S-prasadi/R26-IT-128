"""
Module C — CV Job Analyzer
Dataset visualization script (Phase 3 of ../IMPROVEMENT_PLAN.md)
====================================================================
Phase 2's compare_models.py already produced the model-comparison charts
(MAE/R², feature importance, predicted-vs-actual). This script covers the
other half of the "Data Visualization" feedback item: the underlying
evaluation results themselves — score distribution, level breakdown, and
average score by role — data Phase 1's scored_training_dataset.csv already
computed but never visualized.

Usage:
  python visualize_dataset.py
"""

import os
import sys

import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from train import LABELED_CSV_PATH

BASE = os.path.dirname(os.path.abspath(__file__))
MODULE_ROOT = os.path.dirname(BASE)

REPORT_DIR = os.path.join(MODULE_ROOT, "reports", "phase3-data-visualization")
os.makedirs(REPORT_DIR, exist_ok=True)

SCORE_DIST_PATH = os.path.join(REPORT_DIR, "score_distribution.png")
LEVEL_BREAKDOWN_PATH = os.path.join(REPORT_DIR, "level_breakdown.png")
AVG_SCORE_BY_ROLE_PATH = os.path.join(REPORT_DIR, "avg_score_by_role.png")

LEVEL_ORDER = ["Beginner", "Intermediate", "Advanced"]

sns.set_theme(style="whitegrid")


def chart_score_distribution(df):
    fig, ax = plt.subplots(figsize=(9, 5))
    sns.histplot(df["final_score"], bins=30, kde=True, color="#4C72B0", ax=ax)
    ax.set_title(f"Phase 3 — final_score Distribution (n={len(df)})")
    ax.set_xlabel("final_score")
    ax.set_ylabel("Number of CVs")
    fig.tight_layout()
    fig.savefig(SCORE_DIST_PATH, dpi=150)
    plt.close(fig)
    print(f"Saved {os.path.relpath(SCORE_DIST_PATH, MODULE_ROOT)}")


def chart_level_breakdown(df):
    counts = df["level"].value_counts().reindex(LEVEL_ORDER, fill_value=0)

    fig, ax = plt.subplots(figsize=(7, 5))
    bars = ax.bar(counts.index, counts.values, color=["#55A868", "#DD8452", "#C44E52"])
    for bar, count in zip(bars, counts.values):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height(), str(count),
                 ha="center", va="bottom")
    ax.set_title("Phase 3 — Level Breakdown")
    ax.set_ylabel("Number of CVs")
    fig.tight_layout()
    fig.savefig(LEVEL_BREAKDOWN_PATH, dpi=150)
    plt.close(fig)
    print(f"Saved {os.path.relpath(LEVEL_BREAKDOWN_PATH, MODULE_ROOT)}")

    if counts.get("Advanced", 0) == 0:
        print("Note: 0 CVs reached Advanced level (final_score >= 80) in this dataset — "
              "shown honestly as an empty bar, not omitted.")


def chart_avg_score_by_role(df):
    avg_by_role = df.groupby("target_role")["final_score"].mean().sort_values()

    fig, ax = plt.subplots(figsize=(9, 8))
    ax.barh(avg_by_role.index, avg_by_role.values, color="#4C72B0")
    ax.set_xlabel("Average final_score")
    ax.set_title("Phase 3 — Average Score by Target Role")
    fig.tight_layout()
    fig.savefig(AVG_SCORE_BY_ROLE_PATH, dpi=150)
    plt.close(fig)
    print(f"Saved {os.path.relpath(AVG_SCORE_BY_ROLE_PATH, MODULE_ROOT)}")


def main():
    if not os.path.exists(LABELED_CSV_PATH):
        raise SystemExit(
            f"{os.path.relpath(LABELED_CSV_PATH, BASE)} not found — "
            "run `python train.py` first."
        )

    df = pd.read_csv(LABELED_CSV_PATH)

    chart_score_distribution(df)
    chart_level_breakdown(df)
    chart_avg_score_by_role(df)


if __name__ == "__main__":
    main()
