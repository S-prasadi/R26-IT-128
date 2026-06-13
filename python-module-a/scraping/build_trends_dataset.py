"""
Multi-Source Trends -> Pipeline Dataset Builder
================================================
Reads all 4 source CSVs and produces:

  1. data/dataset/weekly_skill_dataset.csv
       week | skill | count | co_skills

  2. data/processed/jobs_with_skills.csv
       id | title | company | skills | week | post_date | source
       (weighted rows for lead_lag.py — row count proportional to trend_index)

Sources consumed:
  data/raw/global/trends_global.csv    -> google_trends_global
  data/raw/global/linkedin_jobs.csv    -> linkedin_jobs
  data/raw/local/trends_lk.csv         -> google_trends_lk
  data/raw/local/topjobs_lk.csv        -> topjobs_lk

Usage:
  python scraping/build_trends_dataset.py
"""

import os
import ast
import numpy as np
import pandas as pd
from collections import defaultdict
from itertools import combinations
from datetime import datetime

BASE        = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SOURCES     = {
    "google_trends_global": os.path.join(BASE, "data", "raw", "global", "trends_global.csv"),
    "linkedin_jobs":         os.path.join(BASE, "data", "raw", "global", "linkedin_jobs.csv"),
    "google_trends_lk":      os.path.join(BASE, "data", "raw", "local",  "trends_lk.csv"),
    "topjobs_lk":            os.path.join(BASE, "data", "raw", "local",  "topjobs_lk.csv"),
}
DATASET_OUT = os.path.join(BASE, "data", "dataset", "weekly_skill_dataset.csv")
JOBS_OUT    = os.path.join(BASE, "data", "processed", "jobs_with_skills.csv")

os.makedirs(os.path.dirname(DATASET_OUT), exist_ok=True)
os.makedirs(os.path.dirname(JOBS_OUT),    exist_ok=True)


def week_to_date(week_str: str):
    try:
        return datetime.strptime(week_str + "-1", "%Y-W%W-%w")
    except Exception:
        return datetime.min


# ── Step 1: Load all sources ──────────────────────────────────────────────────

def load_all_sources() -> pd.DataFrame:
    frames = []
    for src, path in SOURCES.items():
        if not os.path.exists(path):
            print(f"  WARNING: {path} not found — skipping {src}.")
            continue
        df = pd.read_csv(path)
        df["trend_index"] = pd.to_numeric(df["trend_index"], errors="coerce").fillna(0)
        print(f"  Loaded {len(df):>6,} rows  [{src}]")
        frames.append(df)

    if not frames:
        raise FileNotFoundError(
            "No source files found. Run generate_trends_dataset.py first."
        )
    combined = pd.concat(frames, ignore_index=True)
    return combined


# ── Step 2: Build weekly_skill_dataset ───────────────────────────────────────

def build_weekly_dataset(df: pd.DataFrame) -> pd.DataFrame:
    # Sum trend_index across all sources for each week-skill pair
    weekly = (
        df.groupby(["week", "skill"])["trend_index"]
        .sum()
        .reset_index()
        .rename(columns={"trend_index": "count"})
    )
    weekly["count"] = weekly["count"].round(2)

    # Co-skills: within each week find skills that peak together
    # (both above their own median over the period)
    skill_medians = df.groupby("skill")["trend_index"].median().to_dict()
    coskill_map   = defaultdict(lambda: defaultdict(float))

    for week, wdf in df.groupby("week"):
        active = [
            row["skill"]
            for _, row in wdf.iterrows()
            if row["trend_index"] >= skill_medians.get(row["skill"], 0)
        ]
        active = list(set(active))
        for s1, s2 in combinations(sorted(active), 2):
            coskill_map[(week, s1)][s2] += 1
            coskill_map[(week, s2)][s1] += 1

    def top_coskills(week, skill, n=3):
        pairs = coskill_map.get((week, skill), {})
        return [s for s, _ in sorted(pairs.items(), key=lambda x: -x[1])[:n]]

    weekly["co_skills"] = weekly.apply(
        lambda r: str(top_coskills(r["week"], r["skill"])), axis=1
    )

    return weekly.sort_values(["week", "count"], ascending=[True, False]).reset_index(drop=True)


# ── Step 4: Build jobs_with_skills (weighted rows) ────────────────────────────

def build_jobs_with_skills(df: pd.DataFrame) -> pd.DataFrame:
    """
    One row per skill per week per source, repeated proportionally to
    trend_index (divided by 5, minimum 1).  Row count variation is what
    lead_lag.py's row-count aggregation uses as the skill frequency signal.
    """
    rows = []
    uid  = 0

    for _, row in df.iterrows():
        if row["trend_index"] <= 0:
            continue
        repeats = max(1, round(float(row["trend_index"]) / 5))
        post_dt = str(week_to_date(row["week"]).date())
        for _ in range(repeats):
            rows.append({
                "id":         f"tr_{uid:07d}",
                "title":      f"{row['skill']} role",
                "company":    str(row["source"]),
                "skills":     str([row["skill"]]),
                "week":       row["week"],
                "post_date":  post_dt,
                "source":     row["source"],
            })
            uid += 1

    return pd.DataFrame(rows)


# ── Main ──────────────────────────────────────────────────────────────────────

def run():
    print("\n" + "=" * 58)
    print("  Multi-Source Trends -> Pipeline Dataset Builder")
    print("=" * 58)

    # 1. Load
    df = load_all_sources()
    print(f"\n  Combined : {len(df):,} rows | {df['skill'].nunique()} skills "
          f"| {df['week'].nunique()} weeks")
    src_counts = df["source"].value_counts().to_dict()
    for s, c in src_counts.items():
        print(f"    {s:<30s}: {c:,}")

    # 2. Weekly dataset
    print("\n  Building weekly_skill_dataset.csv ...")
    weekly_df = build_weekly_dataset(df)
    weekly_df.to_csv(DATASET_OUT, index=False)
    print(f"  Saved {len(weekly_df):,} rows -> {DATASET_OUT}")
    print(f"  Skills: {weekly_df['skill'].nunique()}   "
          f"Weeks: {weekly_df['week'].nunique()}")

    # 4. Jobs with skills
    print("\n  Building jobs_with_skills.csv ...")
    jobs_df = build_jobs_with_skills(df)
    jobs_df.to_csv(JOBS_OUT, index=False)
    print(f"  Saved {len(jobs_df):,} rows -> {JOBS_OUT}")
    src_j = jobs_df["source"].value_counts().to_dict()
    for s, c in src_j.items():
        print(f"    {s:<30s}: {c:,}")

    # 5. Preview
    print("\n  Weekly dataset preview (top skills, first week):")
    first_week = weekly_df["week"].min()
    print(weekly_df[weekly_df["week"] == first_week][
        ["week", "skill", "count"]
    ].head(10).to_string(index=False))

    print("\n  Done. Next step:")
    print("    python train.py --skip-dataset")


if __name__ == "__main__":
    run()
