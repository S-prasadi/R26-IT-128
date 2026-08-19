"""
Exogenous Lead-Lag Experiment (Phase 2 side experiment)
----------------------------------------------------------
Tests whether the global-to-local lead-lag signal model/lead_lag.py already
computes (and surfaces to users as "early warnings") actually improves
forecast accuracy, not just correlation.

Kept separate from the main model comparison in backtest.py: the production
`count` series in weekly_skill_dataset.csv is already a sum across ALL four
sources (global + local), so using "the global series" as an exogenous
predictor of that blended series would partly be a variable predicting
itself. This script reconstructs a clean local-only target
(google_trends_lk + topjobs_lk) and a clean global-only exogenous series
(google_trends_global + linkedin_jobs) from the raw per-source CSVs.

Alignment: if global leads local by `lag` weeks, local[T] is paired with
global[T - lag]. Reindexing both series by dropping the first `lag` weeks
(local_aligned = local[lag:], global_aligned = global[:len-lag]) makes them
directly comparable at the same index. Only skills where lead_lag_analysis
found a statistically significant relationship (granger_sig) AND
best_lag_weeks >= horizon are tested -- that guarantees every exogenous
value a forecast step needs is already-observed history (real week
<= last training week), never something that would itself need forecasting.

Reads:
  data/raw/global/trends_global.csv, data/raw/global/linkedin_jobs.csv
  data/raw/local/trends_lk.csv,      data/raw/local/topjobs_lk.csv
  data/output/lead_lag_analysis.csv   (from model/lead_lag.py)
Output:
  data/output/exog_experiment.csv

Usage:
  python model/exog_experiment.py
  python model/exog_experiment.py --horizon 1 --stride 4
"""

import os
import sys
import argparse
import warnings

import numpy as np
import pandas as pd
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.statespace.sarimax import SARIMAX

sys.path.insert(0, os.path.dirname(__file__))
from forecasting import MIN_ARIMA
from backtest import week_to_date, next_week_labels, safe_pct_error, summarize

warnings.filterwarnings("ignore")

BASE     = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RAW_DIR  = os.path.join(BASE, "data", "raw")
LEADLAG  = os.path.join(BASE, "data", "output", "lead_lag_analysis.csv")
OUT_PATH = os.path.join(BASE, "data", "output", "exog_experiment.csv")

GLOBAL_SOURCES = ["google_trends_global", "linkedin_jobs"]
LOCAL_SOURCES  = ["google_trends_lk", "topjobs_lk"]

RAW_FILES = {
    "google_trends_global": os.path.join(RAW_DIR, "global", "trends_global.csv"),
    "linkedin_jobs":         os.path.join(RAW_DIR, "global", "linkedin_jobs.csv"),
    "google_trends_lk":      os.path.join(RAW_DIR, "local",  "trends_lk.csv"),
    "topjobs_lk":            os.path.join(RAW_DIR, "local",  "topjobs_lk.csv"),
}

DEFAULT_HORIZON = 1   # kept short: the dataset's lead-lag lags are 1-7 weeks (see
                       # lead_lag_analysis.csv), so horizon=1 keeps nearly every
                       # significant skill eligible under the horizon<=lag rule above.
DEFAULT_STRIDE = 4


def load_raw() -> pd.DataFrame:
    frames = []
    for source, path in RAW_FILES.items():
        d = pd.read_csv(path)
        d["source"] = source
        frames.append(d)
    return pd.concat(frames, ignore_index=True)


def build_series(df: pd.DataFrame, skill: str, sources: list, all_weeks: list) -> np.ndarray:
    sub    = df[(df["skill"] == skill) & (df["source"].isin(sources))]
    weekly = sub.groupby("week")["trend_index"].sum()
    return np.array([weekly.get(w, 0.0) for w in all_weeks])


def forecast_arima_local(train: list, horizon: int) -> list:
    try:
        result = ARIMA(train, order=(1, 1, 1)).fit()
        return [max(0, round(float(v), 2)) for v in result.forecast(steps=horizon)]
    except Exception:
        last = train[-1] if train else 0
        return [max(0, round(last, 2))] * horizon


def forecast_arimax_local(train: list, horizon: int, exog_train, exog_future) -> list:
    try:
        result = SARIMAX(
            train, order=(1, 1, 1), exog=exog_train,
            enforce_stationarity=False, enforce_invertibility=False,
        ).fit(disp=False)
        pred = result.forecast(steps=horizon, exog=exog_future)
        return [max(0, round(float(v), 2)) for v in pred]
    except Exception:
        last = train[-1] if train else 0
        return [max(0, round(last, 2))] * horizon


def run(horizon: int = DEFAULT_HORIZON, stride: int = DEFAULT_STRIDE):
    print("=" * 55)
    print("  Exogenous Lead-Lag Experiment")
    print("=" * 55)

    leadlag    = pd.read_csv(LEADLAG)
    qualifying = leadlag[leadlag["granger_sig"] & (leadlag["best_lag_weeks"] >= horizon)]
    print(f"  Horizon={horizon}  Stride={stride}")
    print(f"  Skills with significant lead-lag AND lag >= horizon: {len(qualifying)}/{len(leadlag)}")

    raw       = load_raw()
    all_weeks = sorted(raw["week"].unique(), key=week_to_date)

    rows = []
    for _, r in qualifying.iterrows():
        skill = r["skill"]
        lag   = int(r["best_lag_weeks"])

        local_series  = build_series(raw, skill, LOCAL_SOURCES, all_weeks)
        global_series = build_series(raw, skill, GLOBAL_SOURCES, all_weeks)

        local_aligned  = local_series[lag:]
        global_aligned = global_series[: len(local_series) - lag]
        n = len(local_aligned)

        for origin in range(MIN_ARIMA, n - horizon + 1, stride):
            train_local = local_aligned[:origin].tolist()
            exog_train  = global_aligned[:origin].reshape(-1, 1)
            exog_future = global_aligned[origin: origin + horizon].reshape(-1, 1)
            actuals     = local_aligned[origin: origin + horizon]
            if len(actuals) < horizon:
                continue

            # real calendar week label: local_aligned[origin-1] is local_series[origin-1+lag]
            origin_week  = all_weeks[origin - 1 + lag]
            future_weeks = next_week_labels(origin_week, horizon)

            plain_pred = forecast_arima_local(train_local, horizon)
            exog_pred  = forecast_arimax_local(train_local, horizon, exog_train, exog_future)

            for step, (fw, actual, pp, ep) in enumerate(
                zip(future_weeks, actuals, plain_pred, exog_pred), start=1
            ):
                for variant, pred in (("arima_local", pp), ("arimax_local_exog", ep)):
                    rows.append({
                        "skill":         skill,
                        "lag_weeks":     lag,
                        "origin_week":   origin_week,
                        "train_size":    origin,
                        "variant":       variant,
                        "forecast_week": fw,
                        "horizon_step":  step,
                        "actual":        actual,
                        "predicted":     pred,
                        "abs_error":     abs(actual - pred),
                        "sq_error":      (actual - pred) ** 2,
                        "pct_error":     safe_pct_error(actual, pred),
                    })

    detail = pd.DataFrame(rows)
    detail.to_csv(OUT_PATH, index=False)
    print(f"  -> {OUT_PATH}  ({len(detail)} rows, {detail['skill'].nunique() if not detail.empty else 0} skills)")

    if detail.empty:
        print("  No qualifying skills/folds -- nothing to compare.")
        return detail, pd.DataFrame()

    summary = summarize(detail)
    overall = summary[summary["skill"] == "__overall__"].set_index("variant")

    print("\n" + "-" * 55)
    print("  EXOGENOUS EXPERIMENT SUMMARY")
    print("-" * 55)
    for variant in overall.sort_values("mae").index:
        row = overall.loc[variant]
        mape_str = f"{row['mape']:.2f}%" if pd.notna(row["mape"]) else "n/a"
        print(f"    {variant:20s}  MAE={row['mae']:.2f}  RMSE={row['rmse']:.2f}  MAPE={mape_str}")

    per_skill = summary[summary["skill"] != "__overall__"]
    pivot = per_skill.pivot(index="skill", columns="variant", values="mae").dropna()
    if {"arima_local", "arimax_local_exog"}.issubset(pivot.columns):
        beats = int((pivot["arimax_local_exog"] < pivot["arima_local"]).sum())
        total = len(pivot)
        print(f"\n  Exogenous (global-lead) input beats plain local ARIMA on MAE for "
              f"{beats}/{total} skills ({100*beats/total:.0f}%)")

    return detail, summary


def main():
    parser = argparse.ArgumentParser(description="Exogenous global-lead-lag forecasting experiment")
    parser.add_argument("--horizon", type=int, default=DEFAULT_HORIZON)
    parser.add_argument("--stride", type=int, default=DEFAULT_STRIDE)
    args = parser.parse_args()
    run(horizon=args.horizon, stride=args.stride)


if __name__ == "__main__":
    main()
