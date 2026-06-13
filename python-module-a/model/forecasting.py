"""
Skill Demand Forecaster
-----------------------
Reads: data/dataset/weekly_skill_dataset.csv
Outputs:
  data/output/forecasts.csv        -- 12-week forecast per skill
  data/models/skill_series.pkl     -- historical count series per skill (for predict.py)
  data/models/model_registry.json  -- which method (ARIMA/ES) was used per skill

For each skill with enough data:
  - ARIMA(1,1,1) if >= 8 weeks of data
  - Holt's Exponential Smoothing if 4-7 weeks
  - Skipped if < 4 weeks

Forecasts 12 weeks ahead (3 months).
Classifies trend: rising / stable / falling
"""

import os
import json
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

BASE       = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATASET    = os.path.join(BASE, "data", "dataset", "weekly_skill_dataset.csv")
OUT_PATH   = os.path.join(BASE, "data", "output",  "forecasts.csv")
MODELS_DIR = os.path.join(BASE, "data", "models")

os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

FORECAST_WEEKS = 12
MIN_ARIMA      = 8
MIN_ES         = 4


# ── Utilities ─────────────────────────────────────────────────────────────────

def week_to_date(week_str: str) -> datetime:
    try:
        return datetime.strptime(week_str + "-1", "%Y-W%W-%w")
    except Exception:
        return datetime.now()


def next_week_labels(last_week: str, steps: int) -> list:
    base = week_to_date(last_week)
    return [(base + timedelta(weeks=i)).strftime("%Y-W%W") for i in range(1, steps + 1)]


def classify_trend(historical: list) -> str:
    n = len(historical)
    if n < 2:
        return "stable"
    x         = np.arange(n, dtype=float)
    slope     = np.polyfit(x, historical, 1)[0]
    mean_val  = np.mean(historical) + 1e-9
    rel_slope = slope / mean_val
    if rel_slope > 0.005:
        return "rising"
    if rel_slope < -0.005:
        return "falling"
    return "stable"


# ── Model fitting ──────────────────────────────────────────────────────────────

def fit_arima(series: list):
    """Fit ARIMA(1,1,1) and return the fitted result object."""
    try:
        result = ARIMA(series, order=(1, 1, 1)).fit()
        return result
    except Exception:
        return None


def fit_es(series: list):
    """Fit Holt's Exponential Smoothing and return the fitted result object."""
    try:
        result = ExponentialSmoothing(
            series, trend="add", initialization_method="estimated"
        ).fit()
        return result
    except Exception:
        return None


def forecast_from_result(result, method: str, fallback_last: float) -> list:
    """Generate FORECAST_WEEKS predictions from a fitted model result."""
    try:
        pred = result.forecast(steps=FORECAST_WEEKS)
        return [max(0, round(float(v), 2)) for v in pred]
    except Exception:
        return [max(0, round(fallback_last, 2))] * FORECAST_WEEKS


# ── Main run ───────────────────────────────────────────────────────────────────

def run():
    print("=" * 55)
    print("  Skill Demand Forecaster")
    print("=" * 55)

    df        = pd.read_csv(DATASET)
    all_weeks = sorted(df["week"].unique(), key=week_to_date)
    skills    = df["skill"].unique()

    print(f"  Skills={len(skills)}  Weeks={len(all_weeks)}  "
          f"({all_weeks[0]} to {all_weeks[-1]})")

    results         = []
    skill_series    = {}   # {skill: {"weeks": [...], "counts": [...]}}
    model_registry  = {}   # {skill: {"method": "ARIMA"|"ES", "data_points": n}}

    for skill in skills:
        skill_df     = df[df["skill"] == skill].set_index("week")
        count_series = [
            int(skill_df.loc[w, "count"]) if w in skill_df.index else 0
            for w in all_weeks
        ]
        n = len(count_series)

        if n < MIN_ES:
            continue

        # ── Choose and fit model ──
        result = None
        if n >= MIN_ARIMA:
            result = fit_arima(count_series)
            method = "ARIMA"
            if result is None:                       # fallback to ES
                result = fit_es(count_series)
                method = "ES"
        else:
            result = fit_es(count_series)
            method = "ES"

        if result is None:
            count_fore = [max(0, round(count_series[-1], 2))] * FORECAST_WEEKS
        else:
            count_fore = forecast_from_result(result, method, count_series[-1])

        trend        = classify_trend(count_series)
        future_weeks = next_week_labels(all_weeks[-1], FORECAST_WEEKS)

        # ── Save to results ──
        for i, (fw, fc) in enumerate(zip(future_weeks, count_fore)):
            results.append({
                "skill":             skill,
                "forecast_week":     fw,
                "forecast_step":     i + 1,
                "predicted_count":   fc,
                "trend":             trend,
                "method":            method,
                "data_points_used":  n,
                "last_actual_count": count_series[-1],
                "avg_actual_count":  round(np.mean(count_series), 2),
            })

        # ── Store artifacts for predict.py ──
        skill_series[skill] = {
            "weeks":  all_weeks,
            "counts": count_series,
        }
        model_registry[skill] = {
            "method":      method,
            "data_points": n,
            "last_week":   all_weeks[-1],
            "trend":       trend,
        }

    # ── Save forecast CSV ──
    out = pd.DataFrame(results)
    out.to_csv(OUT_PATH, index=False)

    # ── Save model artifacts ──
    series_path   = os.path.join(MODELS_DIR, "skill_series.pkl")
    registry_path = os.path.join(MODELS_DIR, "model_registry.json")

    joblib.dump(skill_series, series_path)
    with open(registry_path, "w") as f:
        json.dump(model_registry, f, indent=2)

    print(f"  Forecasted {out['skill'].nunique()} skills -> {OUT_PATH}")
    print(f"  Model artifacts saved:")
    print(f"    {series_path}")
    print(f"    {registry_path}")

    # ── Summary ──
    trend_counts = out.drop_duplicates("skill")["trend"].value_counts()
    print(f"\n  Trend breakdown:")
    for t, c in trend_counts.items():
        print(f"    {t:10s}: {c} skills")

    rising = out[out["trend"] == "rising"].drop_duplicates("skill")
    if not rising.empty:
        print("\n  --- Rising skills ---")
        print(rising[["skill", "avg_actual_count", "predicted_count"]].head(10).to_string(index=False))

    falling = out[out["trend"] == "falling"].drop_duplicates("skill")
    if not falling.empty:
        print("\n  --- Falling skills ---")
        print(falling[["skill", "avg_actual_count", "predicted_count"]].head(10).to_string(index=False))

    return out


if __name__ == "__main__":
    run()
