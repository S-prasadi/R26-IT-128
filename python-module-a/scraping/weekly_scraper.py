"""
Weekly Auto-Scraper
===================
Simulates new weekly skill demand data by continuing each skill's trend
with realistic noise (random walk + momentum). Appends to all 4 raw source
CSVs, rebuilds weekly_skill_dataset.csv, then calls predict.py to update
forecasts.csv.

In a real deployment this script would scrape TopJobs.lk / LinkedIn etc.
and write the same CSV format. The pipeline below is identical either way.

Usage:
  python scraping/weekly_scraper.py           # generate 1 next week
  python scraping/weekly_scraper.py --weeks 4 # generate 4 weeks ahead
  python scraping/weekly_scraper.py --dry-run # show what would be added
"""

import os
import sys
import argparse
import subprocess
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

SOURCES = {
    "google_trends_global": os.path.join(BASE, "data", "raw", "global", "trends_global.csv"),
    "linkedin_jobs":         os.path.join(BASE, "data", "raw", "global", "linkedin_jobs.csv"),
    "google_trends_lk":      os.path.join(BASE, "data", "raw", "local",  "trends_lk.csv"),
    "topjobs_lk":            os.path.join(BASE, "data", "raw", "local",  "topjobs_lk.csv"),
}

SCRAPE_LOG = os.path.join(BASE, "data", "scrape_log.csv")


# ── Week helpers ──────────────────────────────────────────────────────────────

def week_to_date(w: str) -> datetime:
    try:
        return datetime.strptime(w + "-1", "%Y-W%W-%w")
    except Exception:
        return datetime.min


def next_week(w: str) -> str:
    d = week_to_date(w) + timedelta(weeks=1)
    return d.strftime("%Y-W%W")


def current_iso_week() -> str:
    return datetime.now().strftime("%Y-W%W")


# ── Trend continuation ────────────────────────────────────────────────────────

def continue_series(last_values: list, n_steps: int = 1, min_val: float = 1.0,
                    max_val: float = 100.0, noise_pct: float = 0.08) -> list:
    """
    Continues a time series by n_steps using momentum + random walk.
    - Computes short-term slope from last 4 values
    - Applies that slope + gaussian noise each step
    - Clamps to [min_val, max_val]
    """
    vals = list(last_values[-4:]) if len(last_values) >= 4 else list(last_values)
    result = []
    for _ in range(n_steps):
        if len(vals) >= 2:
            slope = (vals[-1] - vals[0]) / max(len(vals) - 1, 1)
        else:
            slope = 0.0
        last   = vals[-1]
        noise  = np.random.normal(0, abs(last) * noise_pct + 0.5)
        new_v  = last + slope * 0.4 + noise          # damped momentum
        new_v  = float(np.clip(new_v, min_val, max_val))
        new_v  = round(new_v, 1)
        vals.append(new_v)
        result.append(new_v)
    return result


# ── Per-source noise profiles ─────────────────────────────────────────────────

SOURCE_NOISE = {
    "google_trends_global": 0.06,
    "linkedin_jobs":         0.07,
    "google_trends_lk":      0.08,
    "topjobs_lk":            0.09,
}


# ── Generate one week for all sources ────────────────────────────────────────

def generate_new_weeks(n_weeks: int = 1, dry_run: bool = False):
    print(f"\n{'='*55}")
    print(f"  Weekly Scraper — generating {n_weeks} new week(s)")
    print(f"{'='*55}\n")

    for source_name, csv_path in SOURCES.items():
        if not os.path.exists(csv_path):
            print(f"  SKIP  {source_name}: file not found")
            continue

        df = pd.read_csv(csv_path)
        df["trend_index"] = pd.to_numeric(df["trend_index"], errors="coerce").fillna(0)

        all_weeks    = sorted(df["week"].unique(), key=week_to_date)
        last_week    = all_weeks[-1]
        noise_factor = SOURCE_NOISE.get(source_name, 0.08)
        skills       = df["skill"].unique()

        new_rows = []
        current_week = last_week

        for step in range(n_weeks):
            current_week = next_week(current_week)
            for skill in skills:
                skill_series = df[df["skill"] == skill]["trend_index"].tolist()
                if not skill_series:
                    continue
                [new_val] = continue_series(
                    skill_series, n_steps=1,
                    min_val=1.0, max_val=100.0,
                    noise_pct=noise_factor
                )
                new_rows.append({
                    "week":        current_week,
                    "skill":       skill,
                    "trend_index": new_val,
                    "source":      source_name,
                })

        if dry_run:
            print(f"  [DRY RUN] {source_name}: would add {len(new_rows)} rows "
                  f"({all_weeks[-1]} -> {current_week})")
            continue

        new_df    = pd.DataFrame(new_rows)
        updated   = pd.concat([df, new_df], ignore_index=True)
        updated.to_csv(csv_path, index=False)
        print(f"  OK  {source_name:30s}  "
              f"+{len(new_rows)} rows  ({last_week} -> {current_week})")

    return current_week   # last week generated


# ── Rebuild dataset & forecasts ───────────────────────────────────────────────

def rebuild_dataset():
    print("\n  Rebuilding weekly_skill_dataset.csv ...")
    result = subprocess.run(
        [sys.executable, os.path.join(BASE, "scraping", "build_trends_dataset.py")],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print("  ERROR in build_trends_dataset.py:")
        print(result.stderr[-800:])
        return False
    last_line = [l for l in result.stdout.strip().splitlines() if l.strip()]
    print(f"  {last_line[-1]}" if last_line else "  Done.")
    return True


def update_forecasts():
    print("\n  Updating forecasts via predict.py ...")
    result = subprocess.run(
        [sys.executable, os.path.join(BASE, "predict.py")],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print("  ERROR in predict.py:")
        print(result.stderr[-800:])
        return False
    for line in result.stdout.strip().splitlines():
        if any(k in line for k in ["Forecast saved", "FORECAST SUMMARY",
                                    "Rising", "Falling", "Total skills"]):
            print(f"  {line.strip()}")
    return True


# ── Scrape log ────────────────────────────────────────────────────────────────

def write_log(week: str, rows_added: int, status: str):
    log_row = {
        "timestamp":  datetime.now().isoformat(timespec="seconds"),
        "week":       week,
        "rows_added": rows_added,
        "status":     status,
    }
    if os.path.exists(SCRAPE_LOG):
        log_df = pd.read_csv(SCRAPE_LOG)
        log_df = pd.concat([log_df, pd.DataFrame([log_row])], ignore_index=True)
    else:
        log_df = pd.DataFrame([log_row])
    log_df.to_csv(SCRAPE_LOG, index=False)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Weekly skill demand data generator")
    parser.add_argument("--weeks",   type=int, default=1, help="How many new weeks to generate (default: 1)")
    parser.add_argument("--dry-run", action="store_true",  help="Show what would be added without writing")
    args = parser.parse_args()

    np.random.seed(int(datetime.now().strftime("%Y%W")))   # deterministic per week

    last_week = generate_new_weeks(n_weeks=args.weeks, dry_run=args.dry_run)

    if args.dry_run:
        print("\n  [DRY RUN] No files were written.")
        return

    # Compute how many rows were added (4 sources * 57 skills * n_weeks)
    rows_added = 4 * 57 * args.weeks

    ok1 = rebuild_dataset()
    ok2 = update_forecasts() if ok1 else False

    status = "ok" if (ok1 and ok2) else "partial"
    write_log(last_week, rows_added, status)

    print(f"\n{'='*55}")
    print(f"  Weekly scrape complete")
    print(f"  New data through : {last_week}")
    print(f"  Scrape log       : {SCRAPE_LOG}")
    print(f"  Status           : {status}")
    print(f"{'='*55}\n")


if __name__ == "__main__":
    main()
