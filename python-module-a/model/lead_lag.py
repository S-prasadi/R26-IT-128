"""
Global-Local Lead-Lag Analysis
--------------------------------
Uses CCF (Cross-Correlation Function) and Granger Causality to detect
whether global (Remote OK) skill trends LEAD local (TopJobs.lk) trends.

A positive lag means global predicts local N weeks ahead.

Reads:  data/processed/jobs_with_skills.csv
Output: data/output/lead_lag_analysis.csv
"""

import os
import ast
import warnings
import numpy as np
import pandas as pd
from datetime import datetime

from statsmodels.tsa.stattools import ccf, grangercausalitytests

warnings.filterwarnings("ignore")

JOBS_PATH = os.path.join(os.path.dirname(__file__), "../data/processed/jobs_with_skills.csv")
OUT_PATH  = os.path.join(os.path.dirname(__file__), "../data/output/lead_lag_analysis.csv")
os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

MAX_LAG   = 8   # max weeks to check for lead-lag
MIN_WEEKS = 6   # minimum data points needed per source


def week_to_date(week_str: str) -> datetime:
    try:
        return datetime.strptime(week_str + "-1", "%Y-W%W-%w")
    except Exception:
        return datetime.now()


def parse_skills(s):
    if isinstance(s, list):
        return s
    try:
        return ast.literal_eval(s)
    except Exception:
        return []


def build_weekly_counts(df: pd.DataFrame, source_filter: str) -> pd.DataFrame:
    src = df[df["source"] == source_filter].copy()
    src["skills"] = src["skills"].apply(parse_skills)
    exp = src.explode("skills").rename(columns={"skills": "skill"})
    exp = exp[exp["skill"].notna() & (exp["skill"] != "")]
    counts = (
        exp.groupby(["week", "skill"])
        .size()
        .reset_index(name="count")
    )
    return counts


def get_skill_series(global_counts, local_counts, skill, all_weeks):
    g_df = global_counts[global_counts["skill"] == skill].set_index("week")
    l_df = local_counts[local_counts["skill"] == skill].set_index("week")

    g_series = np.array([g_df.loc[w, "count"] if w in g_df.index else 0 for w in all_weeks], dtype=float)
    l_series = np.array([l_df.loc[w, "count"] if w in l_df.index else 0 for w in all_weeks], dtype=float)
    return g_series, l_series


def run():
    print("=" * 55)
    print("  Global-Local Lead-Lag Analysis (CCF + Granger)")
    print("=" * 55)

    df = pd.read_csv(JOBS_PATH)
    print(f"Loaded {len(df)} jobs")

    # Detect which source labels are present and pick global/local accordingly
    sources = df["source"].unique().tolist()

    def pick_source(candidates):
        for c in candidates:
            if c in sources:
                return c
        return None

    global_src = pick_source(["google_trends_global", "remoteok.com"])
    local_src  = pick_source(["google_trends_lk",     "topjobs.lk"])

    if not global_src or not local_src:
        print(f"  Need both a global and a local source. Found: {sources}")
        return pd.DataFrame()

    print(f"  Global source : {global_src}")
    print(f"  Local  source : {local_src}")

    global_counts = build_weekly_counts(df, global_src)
    local_counts  = build_weekly_counts(df, local_src)

    all_weeks = sorted(
        set(global_counts["week"]) | set(local_counts["week"]),
        key=week_to_date
    )

    global_skills = set(global_counts["skill"].unique())
    local_skills  = set(local_counts["skill"].unique())
    common_skills = global_skills & local_skills

    print(f"Common skills (both sources): {len(common_skills)}")
    print(f"Weeks: {all_weeks[0]} to {all_weeks[-1]} ({len(all_weeks)} total)")

    results = []

    for skill in sorted(common_skills):
        g_series, l_series = get_skill_series(global_counts, local_counts, skill, all_weeks)

        g_nonzero = np.count_nonzero(g_series)
        l_nonzero = np.count_nonzero(l_series)

        if g_nonzero < MIN_WEEKS or l_nonzero < MIN_WEEKS:
            continue

        # ── CCF: find lag where global best predicts local ──
        try:
            corr_values = ccf(g_series, l_series, nlags=MAX_LAG, adjusted=False)
            best_lag = int(np.argmax(np.abs(corr_values[1:]))) + 1
            best_corr = float(corr_values[best_lag])
        except Exception:
            best_lag  = 0
            best_corr = 0.0

        # ── Granger causality: does global Granger-cause local? ──
        granger_sig  = False
        granger_pval = 1.0
        try:
            combined = pd.DataFrame({"local": l_series, "global": g_series})
            max_g    = min(MAX_LAG, len(all_weeks) // 3)
            gc_res   = grangercausalitytests(combined[["local", "global"]], maxlag=max_g, verbose=False)
            # pick the lag with best p-value
            pvals = [gc_res[lag][0]["ssr_ftest"][1] for lag in gc_res]
            granger_pval = float(min(pvals))
            granger_sig  = granger_pval < 0.05
        except Exception:
            pass

        results.append({
            "skill":          skill,
            "best_lag_weeks": best_lag,
            "ccf_correlation": round(best_corr, 4),
            "granger_pval":   round(granger_pval, 4),
            "granger_sig":    granger_sig,
            "interpretation": (
                f"Global leads local by {best_lag}w" if best_corr > 0.3 and granger_sig
                else "No clear lead-lag pattern"
            ),
            "global_weeks_active": int(g_nonzero),
            "local_weeks_active":  int(l_nonzero),
        })

    out = pd.DataFrame(results)

    if not out.empty:
        out = out.sort_values("ccf_correlation", ascending=False).reset_index(drop=True)
        out.to_csv(OUT_PATH, index=False)

        print(f"\nAnalysed {len(out)} skills -> {OUT_PATH}")

        sig = out[out["granger_sig"]]
        print(f"\nSkills where global LEADS local (Granger p<0.05): {len(sig)}")
        if not sig.empty:
            print(sig[["skill", "best_lag_weeks", "ccf_correlation", "granger_pval"]].to_string(index=False))

        print("\n--- Top correlated skills (global -> local) ---")
        print(out[["skill", "best_lag_weeks", "ccf_correlation", "interpretation"]].head(10).to_string(index=False))
    else:
        print("Not enough overlapping data for lead-lag analysis.")

    return out


if __name__ == "__main__":
    run()
