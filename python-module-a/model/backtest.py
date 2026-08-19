"""
Skill Forecast Backtest
------------------------
Walk-forward (rolling-origin) backtest of the production forecasting pipeline
(ARIMA(1,1,1) with Exponential Smoothing fallback -- same method-selection
logic as forecasting.py) against a naive last-value-repeat baseline.

For each skill, at every training-window size from MIN_ES weeks up to
N - horizon (stepping by --stride), the pipeline is asked to forecast the
next --horizon weeks exactly as it would have at that point in history, and
the forecast is compared against the actual values that already exist in
the dataset for those weeks.

Reads:  ../data/dataset/weekly_skill_dataset.csv
Outputs:
  ../data/output/backtest_report.csv   -- one row per skill/origin/step/variant
  ../data/output/backtest_summary.csv  -- aggregated per skill (+ overall) per variant

Candidates are a name -> fit_fn registry (fit_fn(train_series, horizon) ->
(predictions, method)); "arima_es" and "naive" are always available and are
the default when --candidates is omitted. Phase 2's additional candidates
(holt_winters_full, sarima, xgboost) live in forecast_candidates.py and are
registered here by name so this file doesn't need to change to add one.

Usage:
  python model/backtest.py
  python model/backtest.py --horizon 12
  python model/backtest.py --stride 8
  python model/backtest.py --skills python,react,llm
  python model/backtest.py --candidates arima_es,holt_winters_full,sarima,xgboost,naive
"""

import os
import sys
import argparse
import warnings
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
from forecasting import fit_arima, fit_es, MIN_ARIMA, MIN_ES
import forecast_candidates

warnings.filterwarnings("ignore")

BASE    = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATASET = os.path.join(BASE, "data", "dataset", "weekly_skill_dataset.csv")
OUT_DIR = os.path.join(BASE, "data", "output")
os.makedirs(OUT_DIR, exist_ok=True)

DETAIL_PATH  = os.path.join(OUT_DIR, "backtest_report.csv")
SUMMARY_PATH = os.path.join(OUT_DIR, "backtest_summary.csv")

DEFAULT_HORIZON = 4
DEFAULT_STRIDE  = 4


# ── Week helpers (mirrors forecasting.py) ───────────────────────────────────────

def week_to_date(week_str: str) -> datetime:
    try:
        return datetime.strptime(week_str + "-1", "%Y-W%W-%w")
    except Exception:
        return datetime.now()


def next_week_labels(last_week: str, steps: int) -> list:
    base = week_to_date(last_week)
    return [(base + timedelta(weeks=i)).strftime("%Y-W%W") for i in range(1, steps + 1)]


# ── Forecasters ──────────────────────────────────────────────────────────────────

def forecast_at_origin(train_series: list, horizon: int):
    """Reproduce forecasting.py's method selection at a given training window,
    then forecast `horizon` steps ahead instead of the production FORECAST_WEEKS."""
    n = len(train_series)
    if n >= MIN_ARIMA:
        result = fit_arima(train_series)
        method = "ARIMA"
        if result is None:
            result = fit_es(train_series)
            method = "ES"
    else:
        result = fit_es(train_series)
        method = "ES"

    if result is None:
        pred = [max(0, round(train_series[-1], 2))] * horizon
    else:
        try:
            pred = [max(0, round(float(v), 2)) for v in result.forecast(steps=horizon)]
        except Exception:
            pred = [max(0, round(train_series[-1], 2))] * horizon
    return pred, method


def naive_forecast(train_series: list, horizon: int):
    last = train_series[-1] if train_series else 0
    return [max(0, round(last, 2))] * horizon, "naive"


def safe_pct_error(actual: float, predicted: float):
    if actual == 0:
        return None
    return abs(actual - predicted) / abs(actual) * 100.0


# ── Candidate registry ─────────────────────────────────────────────────────────
# name -> fit_fn(train_series, horizon) -> (predictions, method)

CANDIDATES = {
    "arima_es":          forecast_at_origin,
    "naive":              naive_forecast,
    "holt_winters_full": forecast_candidates.forecast_holt_winters_full,
    "sarima":             forecast_candidates.forecast_sarima,
    "xgboost":            forecast_candidates.forecast_xgboost,
}
DEFAULT_CANDIDATES = ["arima_es", "naive"]


# ── Backtest run ───────────────────────────────────────────────────────────────

def run(horizon: int = DEFAULT_HORIZON, stride: int = DEFAULT_STRIDE, skills_filter=None,
        candidate_names=None):
    candidate_names = candidate_names or DEFAULT_CANDIDATES
    unknown = [c for c in candidate_names if c not in CANDIDATES]
    if unknown:
        raise ValueError(f"Unknown candidate(s) {unknown}. Available: {sorted(CANDIDATES)}")

    print("=" * 55)
    print("  Skill Forecast Backtest (walk-forward)")
    print("=" * 55)

    df        = pd.read_csv(DATASET)
    all_weeks = sorted(df["week"].unique(), key=week_to_date)
    skills    = list(df["skill"].unique())
    if skills_filter:
        skills = [s for s in skills if s in skills_filter]

    print(f"  Skills={len(skills)}  Weeks={len(all_weeks)}  Horizon={horizon}  Stride={stride}")
    print(f"  Candidates={candidate_names}")

    detail_rows = []

    for skill in skills:
        sd = df[df["skill"] == skill].set_index("week")
        full_series = [int(sd.loc[w, "count"]) if w in sd.index else 0 for w in all_weeks]
        n = len(full_series)

        for origin in range(MIN_ES, n - horizon + 1, stride):
            train   = full_series[:origin]
            actuals = full_series[origin: origin + horizon]
            if len(actuals) < horizon:
                continue

            origin_week  = all_weeks[origin - 1]
            future_weeks = next_week_labels(origin_week, horizon)

            for variant in candidate_names:
                pred, method = CANDIDATES[variant](train, horizon)

                for step, (fw, actual, p) in enumerate(zip(future_weeks, actuals, pred), start=1):
                    detail_rows.append({
                        "skill":         skill,
                        "origin_week":   origin_week,
                        "train_size":    origin,
                        "method":        method,
                        "variant":       variant,
                        "forecast_week": fw,
                        "horizon_step":  step,
                        "actual":        actual,
                        "predicted":     p,
                        "abs_error":     abs(actual - p),
                        "sq_error":      (actual - p) ** 2,
                        "pct_error":     safe_pct_error(actual, p),
                    })

    detail = pd.DataFrame(detail_rows)
    detail.to_csv(DETAIL_PATH, index=False)
    print(f"  Detail  -> {DETAIL_PATH}  ({len(detail)} rows)")

    summary = summarize(detail)
    summary.to_csv(SUMMARY_PATH, index=False)
    print(f"  Summary -> {SUMMARY_PATH}  ({len(summary)} rows)")

    print_report(summary)

    return detail, summary


# ── Aggregation ────────────────────────────────────────────────────────────────

def aggregate_group(skill: str, variant: str, g: pd.DataFrame) -> dict:
    pct = g["pct_error"].dropna()
    return {
        "skill":                      skill,
        "variant":                    variant,
        "folds":                      int(g["origin_week"].nunique()),
        "n_points":                   int(len(g)),
        "mae":                        round(g["abs_error"].mean(), 3),
        "rmse":                       round(float(np.sqrt(g["sq_error"].mean())), 3),
        "mape":                       round(pct.mean(), 2) if len(pct) else None,
        "mape_excluded_zero_actuals": int(g["pct_error"].isna().sum()),
    }


def summarize(detail: pd.DataFrame) -> pd.DataFrame:
    if detail.empty:
        return pd.DataFrame()
    rows = [aggregate_group(skill, variant, g) for (skill, variant), g in detail.groupby(["skill", "variant"])]
    rows += [aggregate_group("__overall__", variant, g) for variant, g in detail.groupby("variant")]
    return pd.DataFrame(rows)


# ── Reporting ──────────────────────────────────────────────────────────────────

def print_report(summary: pd.DataFrame):
    print("\n" + "-" * 55)
    print("  BACKTEST SUMMARY")
    print("-" * 55)

    if summary.empty:
        print("  No data to summarize.")
        return

    overall = summary[summary["skill"] == "__overall__"].set_index("variant")
    print("  Overall accuracy by candidate (sorted by MAE, best first):")
    for variant in overall.sort_values("mae").index:
        row = overall.loc[variant]
        mape_str = f"{row['mape']:.2f}%" if pd.notna(row["mape"]) else "n/a"
        print(f"    {variant:20s}  MAE={row['mae']:.2f}  RMSE={row['rmse']:.2f}  MAPE={mape_str}")

    per_skill = summary[summary["skill"] != "__overall__"]
    pivot = per_skill.pivot(index="skill", columns="variant", values="mae")

    if "naive" not in pivot.columns:
        return

    challengers = [c for c in pivot.columns if c != "naive"]
    if not challengers:
        return

    print("\n  Skills where each candidate beats the naive baseline on MAE:")
    for c in challengers:
        sub   = pivot[[c, "naive"]].dropna()
        beats = int((sub[c] < sub["naive"]).sum())
        total = len(sub)
        pct   = 100 * beats / total if total else 0
        print(f"    {c:20s}  {beats}/{total} ({pct:.0f}%)")

    best_per_skill = pivot[challengers].dropna(how="all").idxmin(axis=1)
    print("\n  Best candidate per skill (win counts across all skills):")
    print(best_per_skill.value_counts().to_string())

    # For the single best-overall challenger, show where it helps most/least vs naive
    # -- useful for spotting which skill shapes a given method suits.
    top_challenger = overall.loc[challengers].sort_values("mae").index[0]
    sub = pivot[[top_challenger, "naive"]].dropna()
    sub["improvement"] = sub["naive"] - sub[top_challenger]
    ranked = sub.sort_values("improvement", ascending=False)

    print(f"\n  Top 5 -- '{top_challenger}' most outperforms naive:")
    for sk, row in ranked.head(5).iterrows():
        print(f"    {sk:20s}  {top_challenger}={row[top_challenger]:.2f}  naive={row['naive']:.2f}  improvement={row['improvement']:+.2f}")

    print(f"\n  Bottom 5 -- '{top_challenger}' most underperforms naive:")
    for sk, row in ranked.tail(5).sort_values("improvement").iterrows():
        print(f"    {sk:20s}  {top_challenger}={row[top_challenger]:.2f}  naive={row['naive']:.2f}  improvement={row['improvement']:+.2f}")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Walk-forward backtest of the skill forecasting pipeline")
    parser.add_argument("--horizon", type=int, default=DEFAULT_HORIZON,
                         help=f"Forecast horizon in weeks (default: {DEFAULT_HORIZON})")
    parser.add_argument("--stride", type=int, default=DEFAULT_STRIDE,
                         help=f"Weeks between successive origins (default: {DEFAULT_STRIDE})")
    parser.add_argument("--skills", type=str, default=None,
                         help="Comma-separated skill names to limit the run to")
    parser.add_argument("--candidates", type=str, default=",".join(DEFAULT_CANDIDATES),
                         help=f"Comma-separated candidate names. Available: {sorted(CANDIDATES)} "
                              f"(default: {','.join(DEFAULT_CANDIDATES)})")
    args = parser.parse_args()

    skills_filter   = set(s.strip() for s in args.skills.split(",")) if args.skills else None
    candidate_names = [c.strip() for c in args.candidates.split(",")]
    run(horizon=args.horizon, stride=args.stride, skills_filter=skills_filter,
        candidate_names=candidate_names)


if __name__ == "__main__":
    main()
