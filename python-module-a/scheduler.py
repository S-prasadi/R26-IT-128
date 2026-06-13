"""
Weekly Scheduler
================
Runs weekly_scraper.py every Monday at 08:00 automatically.
Uses APScheduler (lightweight, pure Python, no external services needed).

Install:  pip install apscheduler
Usage:
  python scheduler.py          # start the scheduler (runs as daemon)
  python scheduler.py --now    # run the scraper once immediately, then exit
  python scheduler.py --status # show next scheduled run time
"""

import os
import sys
import argparse
import subprocess
from datetime import datetime

BASE = os.path.dirname(os.path.abspath(__file__))


def run_scraper():
    """Called by the scheduler every Monday at 08:00."""
    print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Scheduled scrape starting...")
    result = subprocess.run(
        [sys.executable, os.path.join(BASE, "scraping", "weekly_scraper.py")],
        capture_output=False   # let output print to terminal
    )
    if result.returncode == 0:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Scrape finished OK.\n")
    else:
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Scrape finished with errors.\n")


def main():
    parser = argparse.ArgumentParser(description="Weekly scraper scheduler")
    parser.add_argument("--now",    action="store_true", help="Run scraper once immediately and exit")
    parser.add_argument("--status", action="store_true", help="Show next scheduled run time and exit")
    args = parser.parse_args()

    if args.now:
        print("Running scraper immediately (--now mode)...")
        run_scraper()
        return

    try:
        from apscheduler.schedulers.blocking import BlockingScheduler
        from apscheduler.triggers.cron import CronTrigger
    except ImportError:
        print("ERROR: APScheduler not installed.")
        print("Run:  pip install apscheduler")
        sys.exit(1)

    scheduler = BlockingScheduler(timezone="Asia/Colombo")

    # Every Monday at 08:00 Sri Lanka time
    scheduler.add_job(
        run_scraper,
        trigger=CronTrigger(day_of_week="mon", hour=8, minute=0),
        id="weekly_scrape",
        name="Weekly Skill Demand Scraper",
        misfire_grace_time=3600,    # allow up to 1h late if system was off
        replace_existing=True,
    )

    if args.status:
        job  = scheduler.get_job("weekly_scrape")
        # Compute next run without starting
        from apscheduler.triggers.cron import CronTrigger as CT
        trigger = CT(day_of_week="mon", hour=8, minute=0, timezone="Asia/Colombo")
        next_run = trigger.get_next_fire_time(None, datetime.now())
        print(f"\n  Scheduler status")
        print(f"  Job          : Weekly Skill Demand Scraper")
        print(f"  Schedule     : Every Monday at 08:00 (Asia/Colombo)")
        print(f"  Next run     : {next_run.strftime('%Y-%m-%d %H:%M:%S %Z') if next_run else 'unknown'}")
        print(f"  Scraper path : {os.path.join(BASE, 'scraping', 'weekly_scraper.py')}\n")
        return

    print("\n" + "=" * 55)
    print("  Skill Forecasting Engine — Weekly Scheduler")
    print("=" * 55)
    print(f"  Schedule  : Every Monday at 08:00 (Asia/Colombo)")
    print(f"  Timezone  : Asia/Colombo (Sri Lanka)")
    print(f"  Scraper   : scraping/weekly_scraper.py")
    print(f"  Started   : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Press Ctrl+C to stop")
    print("=" * 55 + "\n")

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        print("\n  Scheduler stopped.")


if __name__ == "__main__":
    main()
