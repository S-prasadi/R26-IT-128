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

If data/raw/local/topjobs_lk_real.csv exists (from scraping/topjobs_scraper.py,
Phase 3), its rows are merged into weekly_skill_dataset.csv for (week, skill)
pairs that don't already have a synthetic row, tagged provenance="real". All
synthetic rows are tagged provenance="synthetic". A real row overwriting an
existing synthetic (week, skill) pair is logged, never silent.

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


# ── Step 3: Merge real pilot data (Phase 3) ───────────────────────────────────

REAL_DATA_PATH = os.path.join(BASE, "data", "raw", "local", "topjobs_lk_real.csv")


def load_real_data() -> pd.DataFrame:
    """Rows scraped by scraping/topjobs_scraper.py, if any have been collected yet."""
    if not os.path.exists(REAL_DATA_PATH):
        return pd.DataFrame(columns=["week", "skill", "count", "co_skills", "provenance"])
    real = pd.read_csv(REAL_DATA_PATH)
    real = real.rename(columns={"trend_index": "count"})
    real["count"]     = real["count"].round(2)
    # Co-occurrence isn't tracked by the pilot scraper (it only keeps aggregate
    # counts, never per-listing skill sets) -- left empty rather than guessed.
    real["co_skills"] = "[]"
    return real[["week", "skill", "count", "co_skills", "provenance"]]


def merge_real_data(weekly_df: pd.DataFrame) -> pd.DataFrame:
    weekly_df = weekly_df.copy()
    weekly_df["provenance"] = "synthetic"

    real_df = load_real_data()
    if real_df.empty:
        return weekly_df

    existing_keys = set(zip(weekly_df["week"], weekly_df["skill"]))
    new_rows, overwritten = [], []

    for _, row in real_df.iterrows():
        key = (row["week"], row["skill"])
        if key in existing_keys:
            mask = (weekly_df["week"] == row["week"]) & (weekly_df["skill"] == row["skill"])
            weekly_df.loc[mask, "count"]      = row["count"]
            weekly_df.loc[mask, "provenance"] = "real"
            overwritten.append(key)
        else:
            new_rows.append(row)

    if overwritten:
        preview = overwritten[:5]
        more    = f" (+{len(overwritten) - 5} more)" if len(overwritten) > 5 else ""
        print(f"  NOTE: {len(overwritten)} (week,skill) row(s) already had synthetic data "
              f"and were overwritten with real values: {preview}{more}")

    if new_rows:
        new_weeks = sorted({r["week"] for r in new_rows})
        print(f"  Merged {len(new_rows)} new real-data row(s) (provenance=real) for week(s): {new_weeks}")
        weekly_df = pd.concat([weekly_df, pd.DataFrame(new_rows)], ignore_index=True)
        weekly_df = backfill_partial_weeks(weekly_df, new_weeks)

    return weekly_df


def backfill_partial_weeks(weekly_df: pd.DataFrame, new_weeks: list) -> pd.DataFrame:
    """A newly-introduced week only has real rows for the skills the scraper
    actually found that week (often a handful, not all 57). Every other skill
    would otherwise have NO row for that week -- and forecasting.py's series
    builder treats a missing week as count=0, turning a partial pilot scrape
    into a fake demand cliff at the end of every untouched skill's history.
    Carry each untouched skill's last known value forward instead, tagged
    provenance="carried_forward" so it's never mistaken for a real observation.
    """
    all_skills   = set(weekly_df["skill"].unique())
    backfilled   = []
    weekly_sorted = weekly_df.sort_values("week")

    for week in new_weeks:
        covered = set(weekly_df.loc[weekly_df["week"] == week, "skill"])
        missing = all_skills - covered
        for skill in missing:
            prior = weekly_sorted[(weekly_sorted["skill"] == skill) & (weekly_sorted["week"] < week)]
            if prior.empty:
                continue
            last = prior.iloc[-1]
            backfilled.append({
                "week": week, "skill": skill, "count": last["count"],
                "co_skills": last.get("co_skills", "[]"), "provenance": "carried_forward",
            })

    if backfilled:
        print(f"  Carried forward last known value for {len(backfilled)} skill/week pair(s) "
              f"not covered by the real scrape (provenance=carried_forward) -- avoids a false "
              f"zero-demand cliff for skills the pilot scraper didn't observe.")
        weekly_df = pd.concat([weekly_df, pd.DataFrame(backfilled)], ignore_index=True)

    return weekly_df


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

    # 3. Merge in real pilot data, if any has been scraped (Phase 3)
    print("\n  Checking for real pilot data (scraping/topjobs_scraper.py) ...")
    weekly_df = merge_real_data(weekly_df)

    weekly_df.to_csv(DATASET_OUT, index=False)
    print(f"\n  Saved {len(weekly_df):,} rows -> {DATASET_OUT}")
    print(f"  Skills: {weekly_df['skill'].nunique()}   "
          f"Weeks: {weekly_df['week'].nunique()}   "
          f"Real rows: {(weekly_df['provenance'] == 'real').sum()}")

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
