"""
Skill Forecasting Engine — Prediction Script
=============================================
Uses saved model artifacts to generate updated 12-week forecasts
when new weekly data arrives. No full retraining needed.

HOW IT WORKS
------------
1. Loads historical skill series from data/models/skill_series.pkl
2. Appends new week's counts (from a CSV or auto-appended from dataset)
3. Refits ARIMA/ES on the extended series
4. Outputs updated forecasts.csv

USAGE
-----
  # Use the latest data already in weekly_skill_dataset.csv (no new data file):
  python predict.py

  # Append a new week's data from a CSV file:
  python predict.py --new-data path/to/new_week.csv

  # Append a single week inline (skill:count pairs):
  python predict.py --week 2026-W26 --skills "python:340,java:260,llm:230"

NEW DATA CSV FORMAT (--new-data)
---------------------------------
  week,skill,count
  2026-W26,python,340
  2026-W26,java,260
  2026-W26,llm,230
  2026-W26,react,235
  ...

OUTPUT
------
  data/output/forecasts.csv  -- updated 12-week forecast
  data/models/skill_series.pkl -- updated historical series (series extended)
"""

import os
import sys
import json
import argparse
import warnings
import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from statsmodels.tools.sm_exceptions import ConvergenceWarning

warnings.filterwarnings("ignore", category=ConvergenceWarning)
warnings.filterwarnings("ignore", category=UserWarning)

BASE           = os.path.abspath(os.path.dirname(__file__))
MODELS_DIR     = os.path.join(BASE, "data", "models")
SERIES_PATH    = os.path.join(MODELS_DIR, "skill_series.pkl")
REGISTRY_PATH  = os.path.join(MODELS_DIR, "model_registry.json")
DATASET_PATH   = os.path.join(BASE, "data", "dataset", "weekly_skill_dataset.csv")
OUT_PATH       = os.path.join(BASE, "data", "output", "forecasts.csv")
FORECAST_WEEKS = 12


# ── Utilities ──────────────────────────────────────────────────────────────────

def week_to_date(week_str: str) -> datetime:
    try:
        return datetime.strptime(week_str + "-1", "%Y-W%W-%w")
    except Exception:
        return datetime.min


def next_week_labels(last_week: str, steps: int) -> list:
    base = week_to_date(last_week)
    return [(base + timedelta(weeks=i)).strftime("%Y-W%W") for i in range(1, steps + 1)]


def classify_trend(series: list) -> str:
    n = len(series)
    if n < 2:
        return "stable"
    x         = np.arange(n, dtype=float)
    slope     = np.polyfit(x, series, 1)[0]
    mean_val  = np.mean(series) + 1e-9
    rel_slope = slope / mean_val
    if rel_slope > 0.005:
        return "rising"
    if rel_slope < -0.005:
        return "falling"
    return "stable"


def refit_and_forecast(series: list, method: str) -> list:
    """Refit model on (possibly extended) series and return 12-week forecast."""
    n = len(series)
    try:
        if method == "ARIMA" and n >= 8:
            result = ARIMA(series, order=(1, 1, 1)).fit()
            return [max(0, round(float(v), 2)) for v in result.forecast(steps=FORECAST_WEEKS)]
        else:
            result = ExponentialSmoothing(
                series, trend="add", initialization_method="estimated"
            ).fit()
            return [max(0, round(float(v), 2)) for v in result.forecast(FORECAST_WEEKS)]
    except Exception:
        last = series[-1] if series else 0
        return [max(0, round(last, 2))] * FORECAST_WEEKS


# ── Load saved artifacts ───────────────────────────────────────────────────────

def load_artifacts():
    if not os.path.exists(SERIES_PATH):
        print("  ERROR: No saved model artifacts found.")
        print("  Run 'python train.py --skip-dataset' first to train the model.")
        sys.exit(1)

    skill_series   = joblib.load(SERIES_PATH)
    with open(REGISTRY_PATH) as f:
        model_registry = json.load(f)

    print(f"  Loaded {len(skill_series)} skill series  ({SERIES_PATH})")
    return skill_series, model_registry


# ── Parse new data ─────────────────────────────────────────────────────────────

def parse_new_data_csv(path: str) -> dict:
    """Returns {skill: count} from a CSV with columns: week,skill,count"""
    df = pd.read_csv(path)
    required = {"week", "skill", "count"}
    if not required.issubset(df.columns):
        print(f"  ERROR: new-data CSV must have columns: {required}")
        sys.exit(1)
    weeks = df["week"].unique()
    if len(weeks) > 1:
        print(f"  WARNING: multiple weeks in file {list(weeks)}. Using first week only: {weeks[0]}")
    week  = weeks[0]
    data  = dict(zip(df["skill"], df["count"].astype(float)))
    return week, data


def parse_inline_skills(week: str, skills_str: str) -> dict:
    """Parses 'python:340,java:260' -> {python: 340, java: 260}"""
    data = {}
    for item in skills_str.split(","):
        parts = item.strip().split(":")
        if len(parts) == 2:
            skill, count = parts[0].strip(), parts[1].strip()
            try:
                data[skill] = float(count)
            except ValueError:
                pass
    return week, data


def get_latest_week_from_dataset() -> tuple:
    """Read the latest week in weekly_skill_dataset.csv and return its counts."""
    df        = pd.read_csv(DATASET_PATH)
    all_weeks = sorted(df["week"].unique(), key=week_to_date)
    latest    = all_weeks[-1]
    subset    = df[df["week"] == latest]
    data      = dict(zip(subset["skill"], subset["count"].astype(float)))
    return latest, data


# ── Core prediction logic ──────────────────────────────────────────────────────

def predict(skill_series: dict, model_registry: dict,
            new_week: str, new_counts: dict) -> pd.DataFrame:
    """
    Extends historical series with new_week data (if not already present),
    refits each skill's model, and returns a forecasts DataFrame.
    """
    results       = []
    updated_count = 0

    for skill, info in skill_series.items():
        weeks  = list(info["weeks"])
        counts = list(info["counts"])

        # Append new week if it's genuinely new
        if new_week not in weeks:
            new_count = new_counts.get(skill, 0)
            weeks.append(new_week)
            counts.append(int(new_count))
            info["weeks"]  = weeks
            info["counts"] = counts
            updated_count += 1

        method       = model_registry.get(skill, {}).get("method", "ARIMA")
        forecast     = refit_and_forecast(counts, method)
        trend        = classify_trend(counts)
        future_weeks = next_week_labels(weeks[-1], FORECAST_WEEKS)

        for i, (fw, fc) in enumerate(zip(future_weeks, forecast)):
            results.append({
                "skill":             skill,
                "forecast_week":     fw,
                "forecast_step":     i + 1,
                "predicted_count":   fc,
                "trend":             trend,
                "method":            method,
                "data_points_used":  len(counts),
                "last_actual_count": counts[-1],
                "avg_actual_count":  round(np.mean(counts), 2),
            })

    print(f"  Extended series for {updated_count} skills with week: {new_week}")
    return pd.DataFrame(results)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Predict future skill demand using saved model artifacts."
    )
    parser.add_argument(
        "--new-data", type=str, default=None,
        help="Path to a CSV file with columns: week,skill,count"
    )
    parser.add_argument(
        "--week", type=str, default=None,
        help="Week label for inline data, e.g. 2026-W26"
    )
    parser.add_argument(
        "--skills", type=str, default=None,
        help="Inline skill counts, e.g. 'python:340,java:260,llm:230'"
    )
    args = parser.parse_args()

    print("\n" + "=" * 58)
    print("  Skill Forecasting Engine — Prediction")
    print("=" * 58)

    # ── Step 1: Load saved artifacts ──
    print("\n[1/3] Loading saved model artifacts...")
    skill_series, model_registry = load_artifacts()

    # ── Step 2: Determine new week data ──
    print("\n[2/3] Determining new week data...")

    if args.new_data:
        new_week, new_counts = parse_new_data_csv(args.new_data)
        print(f"  Source : CSV file  ({args.new_data})")
        print(f"  Week   : {new_week}")
        print(f"  Skills : {len(new_counts)} skill counts loaded")

    elif args.week and args.skills:
        new_week, new_counts = parse_inline_skills(args.week, args.skills)
        print(f"  Source : inline argument")
        print(f"  Week   : {new_week}")
        print(f"  Skills : {len(new_counts)} skills parsed")

    else:
        # Default: use the latest week already in the dataset
        new_week, new_counts = get_latest_week_from_dataset()
        print(f"  Source : latest week from weekly_skill_dataset.csv")
        print(f"  Week   : {new_week}  ({len(new_counts)} skills)")

    # ── Step 3: Predict ──
    print("\n[3/3] Generating forecasts...")
    forecasts_df = predict(skill_series, model_registry, new_week, new_counts)

    # Save updated forecasts
    forecasts_df.to_csv(OUT_PATH, index=False)

    # Save updated series (extended with new week)
    joblib.dump(skill_series, SERIES_PATH)

    print(f"\n  Forecast saved -> {OUT_PATH}")
    print(f"  Updated series -> {SERIES_PATH}")

    # ── Summary ──
    print("\n" + "=" * 58)
    print("  FORECAST SUMMARY  (next 12 weeks from " + new_week + ")")
    print("=" * 58)

    dedup = forecasts_df.drop_duplicates("skill")
    rising  = dedup[dedup["trend"] == "rising"]["skill"].tolist()
    stable  = dedup[dedup["trend"] == "stable"]["skill"].tolist()
    falling = dedup[dedup["trend"] == "falling"]["skill"].tolist()

    print(f"\n  Total skills forecasted : {len(dedup)}")
    print(f"  Rising  ({len(rising):2d}): {', '.join(rising)}")
    print(f"  Stable  ({len(stable):2d}): {', '.join(stable[:8])} ...")
    print(f"  Falling ({len(falling):2d}): {', '.join(falling) if falling else 'none'}")

    print(f"\n  Top 10 skills by predicted demand (next week):")
    top = (
        forecasts_df[forecasts_df["forecast_step"] == 1]
        .sort_values("predicted_count", ascending=False)
        .head(10)
    )
    for _, row in top.iterrows():
        bar = "#" * int(row["predicted_count"] / 15)
        print(f"  {row['skill']:20s}  {row['predicted_count']:6.1f}/wk  [{row['trend']:7s}]  {bar}")

    print(f"\n  Forecast range: {forecasts_df['forecast_week'].min()} "
          f"to {forecasts_df['forecast_week'].max()}")
    print()


if __name__ == "__main__":
    main()
