"""
Component 1 - Skill Forecasting Engine: Full Model Pipeline
-------------------------------------------------------------
Runs all three models in sequence:
  1. Demand Forecasting (ARIMA / Exponential Smoothing)
  2. Global-Local Lead-Lag Analysis (CCF + Granger Causality)
  3. Skill Clustering & Bundle Analysis (BERTopic + KMeans)

Then prints a unified summary report.

Usage:
  python model/pipeline.py
  python model/pipeline.py --backtest   # also run the walk-forward backtest
"""

import os
import sys
import argparse
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))

import forecasting
import lead_lag
import clustering


OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "../data/output")


def print_section(title: str):
    print()
    print("=" * 55)
    print(f"  {title}")
    print("=" * 55)


def run(run_backtest: bool = False):
    print("\n" + "#" * 55)
    print("#   Component 1 - Skill Forecasting Engine Pipeline  #")
    print("#" * 55)

    # ── Step 1: Forecasting ────────────────────────────────────
    print_section("Step 1 / 3: Demand Forecasting")
    forecasts_df = forecasting.run()

    # ── Step 2: Lead-Lag ───────────────────────────────────────
    print_section("Step 2 / 3: Global-Local Lead-Lag Analysis")
    leadlag_df = lead_lag.run()

    # ── Step 3: Clustering ─────────────────────────────────────
    print_section("Step 3 / 3: Skill Clustering & Bundle Analysis")
    clusters_df, bundles_df = clustering.run()

    # ── Optional: Backtest Evaluation ───────────────────────────
    if run_backtest:
        print_section("Step 4: Backtest Evaluation")
        import backtest
        backtest.run()

    # ── Final Report ───────────────────────────────────────────
    print_section("FINAL SUMMARY REPORT")

    if not forecasts_df.empty:
        dedup = forecasts_df.drop_duplicates("skill")
        rising  = dedup[dedup["trend"] == "rising"]["skill"].tolist()
        falling = dedup[dedup["trend"] == "falling"]["skill"].tolist()
        stable  = dedup[dedup["trend"] == "stable"]["skill"].tolist()

        print(f"\nTotal skills forecasted : {len(dedup)}")
        print(f"  Rising  ({len(rising):2d}): {', '.join(rising[:8])}")
        print(f"  Stable  ({len(stable):2d}): {', '.join(stable[:8])}")
        print(f"  Falling ({len(falling):2d}): {', '.join(falling[:8])}")

        # Top 5 skills by predicted demand (week 4 avg)
        week4 = forecasts_df[forecasts_df["forecast_step"] <= 4]
        top5  = week4.groupby("skill")["predicted_count"].mean().sort_values(ascending=False).head(5)
        print(f"\nTop 5 predicted high-demand skills (next 4 weeks):")
        for sk, cnt in top5.items():
            trend = dedup[dedup["skill"] == sk]["trend"].values[0]
            print(f"  {sk:20s}  {cnt:.1f}/week  [{trend}]")

    if not leadlag_df.empty:
        sig = leadlag_df[leadlag_df["granger_sig"]]
        if not sig.empty:
            print(f"\nGlobal skills leading local trends:")
            for _, row in sig.head(5).iterrows():
                print(f"  {row['skill']:20s}  lag={row['best_lag_weeks']}w  corr={row['ccf_correlation']:.2f}")

    if not bundles_df.empty:
        print(f"\nTop 5 trending skill bundles:")
        for _, row in bundles_df.head(5).iterrows():
            print(f"  {row['bundle']:35s}  growth={row['growth_rate']:+.1%}")

    print(f"\nAll outputs saved to: {OUTPUT_DIR}")
    print("  forecasts.csv          - 12-week demand forecasts")
    print("  lead_lag_analysis.csv  - global-local skill signals")
    print("  skill_clusters.csv     - semantic skill groupings")
    print("  skill_bundles.csv      - trending co-skill pairs")
    if run_backtest:
        print("  backtest_report.csv    - walk-forward backtest, per skill/origin/step")
        print("  backtest_summary.csv   - aggregated backtest accuracy, per skill")
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Component 1 - Skill Forecasting Engine Pipeline")
    parser.add_argument("--backtest", action="store_true",
                         help="Also run the walk-forward backtest after training")
    args = parser.parse_args()
    run(run_backtest=args.backtest)
