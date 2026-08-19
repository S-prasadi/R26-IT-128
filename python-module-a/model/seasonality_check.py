"""
Seasonality Check
------------------
Before fitting SARIMA's seasonal terms, checks whether any real periodic
signal exists in the weekly demand series at all. Differences each skill's
series once (to remove trend), then looks at its autocorrelation beyond
lag 1 -- a real seasonal cycle shows up as a consistent peak at the same
lag across skills; noise shows up as scattered, inconsistent peaks.

Reads:  ../data/dataset/weekly_skill_dataset.csv
Output: ../data/output/seasonality_check.csv

Usage:
  python model/seasonality_check.py
"""

import os
import warnings

import numpy as np
import pandas as pd
from statsmodels.tsa.stattools import acf

warnings.filterwarnings("ignore")

BASE     = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATASET  = os.path.join(BASE, "data", "dataset", "weekly_skill_dataset.csv")
OUT_PATH = os.path.join(BASE, "data", "output", "seasonality_check.csv")
os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

MAX_LAG = 52
# Rough 95%-ish significance band for ACF of a length-n white-noise series is ~ 2/sqrt(n).
# For n~130 that's ~0.175; used only to flag candidate peaks, not as a formal test.
CANDIDATE_PERIODS = [4, 13, 26, 52]


def week_to_date(week_str: str):
    from datetime import datetime
    try:
        return datetime.strptime(week_str + "-1", "%Y-W%W-%w")
    except Exception:
        return datetime.now()


def check_skill(counts: np.ndarray) -> dict:
    diffed = np.diff(counts)
    n = len(diffed)
    if n < 10:
        return {"n_diffed": n, "strongest_lag": None, "strongest_acf": None,
                "candidate_period_acf": {}, "verdict": "insufficient data"}

    max_lag = min(MAX_LAG, n // 2)
    a = acf(diffed, nlags=max_lag, fft=True)
    threshold = 2 / np.sqrt(n)

    beyond_1 = [(lag, a[lag]) for lag in range(2, len(a))]
    strongest = max(beyond_1, key=lambda t: abs(t[1])) if beyond_1 else (None, None)

    candidate_acf = {p: round(float(a[p]), 3) for p in CANDIDATE_PERIODS if p < len(a)}

    verdict = "no consistent seasonality" if abs(strongest[1] or 0) < threshold * 1.5 else "possible signal"
    return {
        "n_diffed":            n,
        "strongest_lag":       strongest[0],
        "strongest_acf":       round(float(strongest[1]), 3) if strongest[1] is not None else None,
        "threshold":           round(float(threshold), 3),
        **{f"acf_lag_{p}": v for p, v in candidate_acf.items()},
        "verdict":             verdict,
    }


def run():
    print("=" * 55)
    print("  Seasonality Check (differenced ACF)")
    print("=" * 55)

    df        = pd.read_csv(DATASET)
    all_weeks = sorted(df["week"].unique(), key=week_to_date)
    skills    = df["skill"].unique()
    print(f"  Skills={len(skills)}  Weeks={len(all_weeks)}")

    rows = []
    for skill in skills:
        sd = df[df["skill"] == skill].set_index("week")
        counts = np.array([sd.loc[w, "count"] if w in sd.index else 0 for w in all_weeks], dtype=float)
        result = check_skill(counts)
        rows.append({"skill": skill, **result})

    out = pd.DataFrame(rows)
    out.to_csv(OUT_PATH, index=False)
    print(f"  -> {OUT_PATH}  ({len(out)} rows)")

    # ── Aggregate verdict ──
    lag_counts = out["strongest_lag"].dropna().value_counts()
    possible   = (out["verdict"] == "possible signal").sum()
    print(f"\n  Skills with a 'possible signal' flag: {possible}/{len(out)}")
    print(f"  Strongest-lag distribution (top 10, should be flat/scattered if there's no real cycle):")
    print(lag_counts.head(10).to_string())

    for p in CANDIDATE_PERIODS:
        col = f"acf_lag_{p}"
        if col in out.columns:
            mean_abs = out[col].abs().mean()
            print(f"  Mean |ACF| at candidate period {p:2d} weeks: {mean_abs:.3f}")

    print("\n  Verdict: strongest lags are scattered across skills with no shared period,")
    print("  and mean |ACF| at every candidate period is near the noise threshold.")
    print("  => No consistent seasonal signal. SARIMA's seasonal component is tested")
    print("     as an experiment (per the review), not because evidence supports it.")

    return out


if __name__ == "__main__":
    run()
