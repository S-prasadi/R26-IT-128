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
    """Historical-slope classification. Used only as a fallback when a
    confidence interval can't be computed (see classify_trend_ci below,
    which is what run() actually uses)."""
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


def classify_trend_ci(last_actual: float, ci_lower, ci_upper, historical: list) -> str:
    """Trend label gated on the forecast's own confidence interval, not just
    historical slope: 'rising' only when the *entire* plausible range at the
    final forecast step is above today's level, 'falling' only when it's
    entirely below. A point estimate that moves but has a wide interval
    straddling today's level reads as 'stable' -- the interval not crossing
    flat is exactly what makes a rising/falling label trustworthy."""
    if ci_lower is None or ci_upper is None:
        return classify_trend(historical)
    if ci_lower > last_actual:
        return "rising"
    if ci_upper < last_actual:
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


def guard_against_endpoint_anomaly(series: list):
    """If a series' final point is a radical scale outlier relative to its own
    recent trailing average, exclude it from model fitting. An ES/ARIMA fit
    anchors heavily on the last observed level, so a single corrupted or
    incompatible-scale endpoint would otherwise distort the whole forecast,
    not just that one point -- concretely, Phase 3's real-data pilot writes
    values on a 0-100 percentage-of-postings scale into a series that's
    otherwise a 0-300ish synthetic index, until enough real weeks accumulate
    to properly recalibrate. Returns (series_to_fit, excluded_value_or_None).
    """
    if len(series) < 6:
        return series, None
    recent_avg = np.mean(series[-6:-1])
    last = series[-1]
    if recent_avg > 0 and last < 0.2 * recent_avg:
        return series[:-1], last
    return series, None


def confidence_interval_step12(result, method: str):
    """95% CI for the final (12th) forecast step. ARIMA reports this
    analytically; Holt-Winters (ES) results don't support get_prediction()/
    conf_int() in this statsmodels version, so it's built from simulated
    forecast paths instead. Returns (lower, upper), or (None, None) if
    neither approach succeeds."""
    try:
        if method == "ARIMA":
            ci = result.get_forecast(steps=FORECAST_WEEKS).conf_int(alpha=0.05)
            lower, upper = ci[-1][0], ci[-1][1]
        else:
            sims = np.asarray(result.simulate(nsimulations=FORECAST_WEEKS, repetitions=500, error="add"))
            final_step = sims[-1]
            lower, upper = np.percentile(final_step, [2.5, 97.5])
        return max(0.0, float(lower)), max(0.0, float(upper))
    except Exception:
        return None, None


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

        # Guard the fit against a corrupted/incompatible-scale final point
        # (see guard_against_endpoint_anomaly) -- fit on the series with that
        # point held out so it can't distort the level the model anchors on.
        fit_series, excluded_point = guard_against_endpoint_anomaly(count_series)
        n_fit = len(fit_series)
        if n_fit < MIN_ES:
            continue

        # ── Choose and fit model ──
        # Phase 2 model comparison (docs/skill-forecasting-model-comparison.md):
        # Exponential Smoothing beat ARIMA(1,1,1) on overall MAE/MAPE and won
        # per-skill 4x more often (27/57 vs 6/57) on a walk-forward backtest
        # across all shape categories. ARIMA is kept only as a fallback for the
        # rare case ES itself fails to fit.
        result = fit_es(fit_series)
        method = "ES"
        if result is None and n_fit >= MIN_ARIMA:
            result = fit_arima(fit_series)
            method = "ARIMA"

        if result is None:
            count_fore = [max(0, round(fit_series[-1], 2))] * FORECAST_WEEKS
            ci_lower = ci_upper = None
        else:
            count_fore = forecast_from_result(result, method, fit_series[-1])
            ci_lower, ci_upper = confidence_interval_step12(result, method)

        # Trend/growth are judged against the guarded series' last point, not the
        # raw one -- comparing a forecast to a known scale-anomalous endpoint would
        # misclassify every such skill as "rising" (see guard_against_endpoint_anomaly).
        # last_actual_count in the output still reports what was actually observed.
        trend        = classify_trend_ci(fit_series[-1], ci_lower, ci_upper, fit_series)
        future_weeks = next_week_labels(all_weeks[-1], FORECAST_WEEKS)

        # Growth score: forecast steps 9-12 vs the last 4 *actual* weeks (from the
        # guarded series), relative to the historical mean. Deliberately looks at
        # the far end of the 12-week horizon rather than the near end (steps 1-4,
        # what predicted_weekly_demand already uses) so a skill isn't called
        # "growing" just from short-term noise.
        historical_mean    = np.mean(fit_series) + 1e-9
        far_horizon_avg    = np.mean(count_fore[8:12])
        recent_actual_avg  = np.mean(fit_series[-4:])
        growth_score = round(float((far_horizon_avg - recent_actual_avg) / historical_mean), 4)

        # ── Save to results ──
        for i, (fw, fc) in enumerate(zip(future_weeks, count_fore)):
            results.append({
                "skill":                    skill,
                "forecast_week":            fw,
                "forecast_step":            i + 1,
                "predicted_count":          fc,
                "trend":                    trend,
                "method":                   method,
                "data_points_used":         n_fit,
                "last_actual_count":        count_series[-1],
                "avg_actual_count":         round(np.mean(count_series), 2),
                "growth_score":             growth_score,
                "ci_lower_step12":          round(ci_lower, 2) if ci_lower is not None else None,
                "ci_upper_step12":          round(ci_upper, 2) if ci_upper is not None else None,
                "endpoint_anomaly_excluded": excluded_point is not None,
            })

        # ── Store artifacts for predict.py ──
        skill_series[skill] = {
            "weeks":  all_weeks,
            "counts": count_series,
        }
        model_registry[skill] = {
            "method":      method,
            "data_points": n_fit,
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
