"""
Skill Forecasting Engine — API + Auto-Scheduler
=================================================
Single entry point. Run this one file and everything starts:
  - FastAPI serves the dashboard and all data endpoints
  - APScheduler runs the weekly scraper every Monday 08:00 automatically
  - No need to run scheduler.py separately

Usage:
  python api/app.py

Dashboard : http://localhost:8001
API docs  : http://localhost:8001/docs
"""

import os
import sys
import json
import subprocess
import logging
import joblib
import pandas as pd
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Paths ─────────────────────────────────────────────────────────────────────

BASE        = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE)
from train import SKILL_ALIASES  # noqa: E402 -- canonical name-matching table (Phase 4b)
DATA_OUT    = os.path.join(BASE, "data", "output")
DATA_MODELS = os.path.join(BASE, "data", "models")
DATA_DS     = os.path.join(BASE, "data", "dataset")
SCRAPE_LOG  = os.path.join(BASE, "data", "scrape_log.csv")
DASHBOARD   = os.path.join(BASE, "dashboard", "index.html")
SCRAPER     = os.path.join(BASE, "scraping", "weekly_scraper.py")

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("forecasting-engine")


# ── Scheduled job ─────────────────────────────────────────────────────────────

REAL_SCRAPER = os.path.join(BASE, "scraping", "topjobs_scraper.py")


def run_weekly_scrape():
    """Called automatically by APScheduler every Monday at 08:00.
    Refreshes the real TopJobs.lk pilot data first (Phase 3), then the
    synthetic continuation -- weekly_scraper.py's own rebuild step already
    merges whatever's in topjobs_lk_real.csv, so running the real scraper
    first is all that's needed for real data to keep accumulating on its
    own instead of only growing when someone runs it by hand."""
    log.info("Scheduled weekly scrape starting...")
    try:
        real_result = subprocess.run(
            [sys.executable, REAL_SCRAPER],
            capture_output=True, text=True, timeout=120
        )
        if real_result.returncode == 0:
            log.info("Real data scrape (TopJobs.lk) completed successfully.")
        else:
            # Non-fatal: the synthetic continuation below still runs, and last
            # week's real data (if any) stays in place for the merge step.
            log.warning(f"Real data scrape failed, continuing with synthetic only:\n{real_result.stderr[-400:]}")
    except Exception as e:
        log.warning(f"Real data scrape exception, continuing with synthetic only: {e}")

    try:
        result = subprocess.run(
            [sys.executable, SCRAPER],
            capture_output=True, text=True, timeout=600
        )
        if result.returncode == 0:
            log.info("Weekly scrape completed successfully.")
        else:
            log.error(f"Weekly scrape failed:\n{result.stderr[-400:]}")
    except Exception as e:
        log.error(f"Weekly scrape exception: {e}")


# ── Lifespan: start/stop scheduler with the server ───────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── STARTUP ──
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger

        scheduler = BackgroundScheduler(timezone="Asia/Colombo")
        scheduler.add_job(
            run_weekly_scrape,
            trigger=CronTrigger(day_of_week="mon", hour=8, minute=0),
            id="weekly_scrape",
            name="Weekly Skill Demand Scraper",
            misfire_grace_time=3600,
            replace_existing=True,
        )
        scheduler.start()

        # Calculate next run for display
        job      = scheduler.get_job("weekly_scrape")
        next_run = job.next_run_time
        log.info(f"Scheduler started. Next scrape: {next_run.strftime('%Y-%m-%d %H:%M') if next_run else 'unknown'}")
        app.state.scheduler = scheduler

    except ImportError:
        log.warning("APScheduler not installed — scheduler disabled. Run: pip install apscheduler")
        app.state.scheduler = None

    yield   # server is running

    # ── SHUTDOWN ──
    if getattr(app.state, "scheduler", None):
        app.state.scheduler.shutdown(wait=False)
        log.info("Scheduler stopped.")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Skill Forecasting Engine",
    description="Component 1 · SLIIT R26-IT-128",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def read_csv(path: str) -> pd.DataFrame:
    if not os.path.exists(path):
        return pd.DataFrame()
    return pd.read_csv(path)


def to_json(df: pd.DataFrame) -> list:
    return json.loads(df.to_json(orient="records"))


# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def serve_dashboard():
    if not os.path.exists(DASHBOARD):
        return HTMLResponse("<h1>Dashboard not found</h1>", status_code=404)
    with open(DASHBOARD, encoding="utf-8") as f:
        return HTMLResponse(f.read())


# ── API: Status ───────────────────────────────────────────────────────────────

@app.get("/api/status")
def get_status():
    """Server status, last scrape time, dataset range, next scheduled run."""
    dataset_df = read_csv(os.path.join(DATA_DS, "weekly_skill_dataset.csv"))

    last_scrape, last_week, total_scrapes = None, None, 0
    if os.path.exists(SCRAPE_LOG):
        log_df = pd.read_csv(SCRAPE_LOG)
        if not log_df.empty:
            r             = log_df.iloc[-1]
            last_scrape   = r.get("timestamp")
            last_week     = r.get("week")
            total_scrapes = len(log_df)

    week_range = {}
    if not dataset_df.empty and "week" in dataset_df.columns:
        weeks      = sorted(dataset_df["week"].unique())
        week_range = {"from": weeks[0], "to": weeks[-1], "total_weeks": len(weeks)}

    model_info = {}
    reg_path   = os.path.join(DATA_MODELS, "model_registry.json")
    if os.path.exists(reg_path):
        with open(reg_path) as f:
            reg = json.load(f)
        methods = {}
        for meta in reg.values():
            m = meta.get("method", "?")
            methods[m] = methods.get(m, 0) + 1
        model_info = {"total_skills": len(reg), "methods": methods}

    # Next scheduled run
    next_run = None
    sched = getattr(app.state, "scheduler", None)
    if sched:
        job = sched.get_job("weekly_scrape")
        if job and job.next_run_time:
            next_run = job.next_run_time.strftime("%Y-%m-%d %H:%M %Z")

    return {
        "status":         "ok",
        "server_time":    datetime.now().isoformat(timespec="seconds"),
        "last_scrape":    last_scrape,
        "last_week_data": last_week or week_range.get("to"),
        "total_scrapes":  total_scrapes,
        "next_scrape":    next_run,
        "dataset":        week_range,
        "models":         model_info,
    }


# ── API: Forecasts ────────────────────────────────────────────────────────────

@app.get("/api/forecasts/top")
def get_top_forecasts(n: int = Query(20, ge=1, le=57)):
    """Top N skills by avg predicted demand over next 4 weeks."""
    df = read_csv(os.path.join(DATA_OUT, "forecasts.csv"))
    if df.empty:
        raise HTTPException(404, "No forecast data found. Run train.py first.")
    top = (
        df[df["forecast_step"] <= 4]
        .groupby("skill")
        .agg(
            avg_predicted_count=("predicted_count", "mean"),
            trend=("trend", "first"),
            method=("method", "first"),
            last_actual_count=("last_actual_count", "first"),
            avg_actual_count=("avg_actual_count", "first"),
        )
        .reset_index()
        .sort_values("avg_predicted_count", ascending=False)
        .head(n)
        .round(2)
    )
    return to_json(top)


@app.get("/api/forecasts/chart/{skill}")
def get_skill_chart(skill: str):
    """Historical + 12-week forecast for one skill, ready for Chart.js."""
    series_path = os.path.join(DATA_MODELS, "skill_series.pkl")
    if not os.path.exists(series_path):
        raise HTTPException(404, "Model artifacts not found. Run train.py first.")

    skill_series = joblib.load(series_path)
    if skill not in skill_series:
        raise HTTPException(404, f"Skill '{skill}' not found.")

    info       = skill_series[skill]
    historical = [{"week": w, "count": c}
                  for w, c in zip(info["weeks"], info["counts"])]

    df       = read_csv(os.path.join(DATA_OUT, "forecasts.csv"))
    skill_fc = df[df["skill"] == skill].sort_values("forecast_step")
    forecast = [{"week": r["forecast_week"], "count": r["predicted_count"], "step": r["forecast_step"]}
                for _, r in skill_fc.iterrows()]
    trend    = skill_fc["trend"].iloc[0] if not skill_fc.empty else "stable"

    return {"skill": skill, "trend": trend, "historical": historical, "forecast": forecast}


@app.get("/api/forecasts/all")
def get_all_skills_summary():
    """All 57 skills — trend, predicted demand, actual demand."""
    df = read_csv(os.path.join(DATA_OUT, "forecasts.csv"))
    if df.empty:
        raise HTTPException(404, "No forecast data found.")
    summary = (
        df[df["forecast_step"] == 1]
        .sort_values("predicted_count", ascending=False)[
            ["skill", "trend", "method", "predicted_count",
             "last_actual_count", "avg_actual_count"]
        ]
    )
    return to_json(summary)


# ── API: Personalised Forecast (called by the backend) ────────────────────────

class ForecastRequest(BaseModel):
    user_id: str = ""
    skills: list[str] = []


def _canonical_skill_name(name: str) -> str:
    """Maps a display name (frontend/Supabase) or an internal forecast key to
    one canonical string for matching. Prefers an explicit alias lookup
    (train.py's SKILL_ALIASES -- the same table scraping/topjobs_scraper.py
    already uses) over a blanket string transform, so matching is auditable
    rather than implicit. Falls back to the old lowercase/strip heuristic
    only when no explicit alias applies, so nothing that matched before
    (e.g. "React Native" <-> "react native") stops matching now."""
    key = name.strip().lower()
    if key in SKILL_ALIASES:
        return SKILL_ALIASES[key]
    return key.replace(".js", "").replace(" ", "").replace(".", "")


def _build_trending_tier(pool: pd.DataFrame) -> list:
    items = []
    for i, r in pool.reset_index(drop=True).iterrows():
        actual   = r["avg_actual"] or 1
        change   = round((r["avg_pred"] - actual) / actual * 100)
        velocity = r["trend"] if r["trend"] in ("rising", "stable", "falling") else "stable"
        items.append({
            "skill":                   r["skill"],
            "rank":                    i + 1,
            # avg predicted job-ad mentions per week over the next 4 weeks
            "predicted_weekly_demand": round(r["avg_pred"]),
            "current_weekly_demand":   round(r["avg_actual"]),
            "velocity":                velocity,
            "change_pct":              int(change),
            "growth_score":            round(float(r["growth_score"]), 4) if pd.notna(r["growth_score"]) else 0.0,
        })
    return items


@app.post("/forecast")
def personalised_forecast(req: ForecastRequest):
    """
    Build the trending / early_warnings / forecast_chart payload the backend
    expects, from the existing forecast + lead-lag artifacts.
    If `skills` is provided, trending is filtered to those skills; otherwise
    (or when none of them have forecast data) the top skills overall are
    returned and `matched` is False so the UI can say so.

    `trending` is split into two tiers rather than one flat ranking (Phase 4a,
    see docs/skill-forecasting-improvement-plan.md): a flat ranking by raw
    predicted volume always buries small, fast-growing skills below large,
    flat ones. `established` ranks by predicted volume among skills already
    at/above the candidate pool's median demand; `emerging` ranks by
    growth_score (the forecast's own steps-9-12-vs-recent trajectory, not
    historical slope) among skills below that median.
    """
    fc = read_csv(os.path.join(DATA_OUT, "forecasts.csv"))
    if fc.empty:
        raise HTTPException(404, "No forecast data. Run train.py first.")

    # ── candidate pool: avg predicted weekly job-ad count over next 4 weeks,
    #    plus the forecast-based growth score computed once per skill ──
    agg = (
        fc[fc["forecast_step"] <= 4]
        .groupby("skill")
        .agg(
            avg_pred=("predicted_count", "mean"),
            trend=("trend", "first"),
            avg_actual=("avg_actual_count", "first"),
            growth_score=("growth_score", "first"),
        )
        .reset_index()
    )

    # optional filter to the user's skills (canonical alias-table match)
    matched = False
    matched_skills: list[str] = []
    if req.skills:
        wanted = {_canonical_skill_name(s): s for s in req.skills}
        filtered = agg[agg["skill"].apply(lambda s: _canonical_skill_name(s) in wanted)]
        if not filtered.empty:
            matched = True
            matched_skills = [wanted[_canonical_skill_name(s)] for s in filtered["skill"]]
            agg = filtered.reset_index(drop=True)

    median_actual = agg["avg_actual"].median() if not agg.empty else 0
    established_pool = agg[agg["avg_actual"] >= median_actual].sort_values("avg_pred", ascending=False)
    emerging_pool     = agg[agg["avg_actual"] <  median_actual].sort_values("growth_score", ascending=False)

    established = _build_trending_tier(established_pool.head(8))
    emerging    = _build_trending_tier(emerging_pool.head(8))

    trending = {"established": established, "emerging": emerging}

    # ── early_warnings: significant global→local leads, straight from the
    #    lead-lag analysis — no fabricated dates. Granger significance alone
    #    is not enough (weakly-correlated skills pass it), so also require a
    #    meaningful correlation and a positive lead. ──
    ll = read_csv(os.path.join(DATA_OUT, "lead_lag_analysis.csv"))
    early_warnings = []
    if not ll.empty:
        sig = ll[
            (ll["granger_sig"] == True)
            & (ll["ccf_correlation"] >= 0.5)
            & (ll["best_lag_weeks"] >= 1)
        ].sort_values("ccf_correlation", ascending=False)
        for _, r in sig.head(5).iterrows():
            early_warnings.append({
                "skill":          r["skill"],
                "weeks_ahead":    int(r["best_lag_weeks"]),
                "correlation":    round(float(r["ccf_correlation"]), 2),
                "interpretation": r.get("interpretation", ""),
            })

    # ── forecast_chart: 12-week predicted series for a representative mix
    #    (top established + top emerging), labelled with the real forecast
    #    week (e.g. 2026-W27) ──
    chart_skills = [t["skill"] for t in (established[:2] + emerging[:1])]
    chart = []
    for step in range(1, 13):
        step_df = fc[fc["forecast_step"] == step]
        week_label = (
            step_df["forecast_week"].iloc[0]
            if not step_df.empty and "forecast_week" in step_df.columns
            else f"W{step}"
        )
        row = {"week": week_label}
        for sk in chart_skills:
            val     = step_df[step_df["skill"] == sk]["predicted_count"]
            row[sk] = round(float(val.iloc[0])) if not val.empty else 0
        chart.append(row)

    return {
        "trending":       trending,
        "early_warnings": early_warnings,
        "forecast_chart": chart,
        "matched":        matched,
        "matched_skills": matched_skills,
    }


# ── API: Lead-Lag ─────────────────────────────────────────────────────────────

@app.get("/api/lead-lag")
def get_lead_lag(significant_only: bool = Query(False)):
    """CCF + Granger lead-lag results, sorted by correlation strength."""
    df = read_csv(os.path.join(DATA_OUT, "lead_lag_analysis.csv"))
    if df.empty:
        raise HTTPException(404, "No lead-lag data found.")
    if significant_only:
        df = df[df["granger_sig"] == True]
    return to_json(df.sort_values("ccf_correlation", ascending=False))


# ── API: Bundles ──────────────────────────────────────────────────────────────

@app.get("/api/bundles")
def get_bundles():
    """Trending skill co-occurrence bundles."""
    df = read_csv(os.path.join(DATA_OUT, "skill_bundles.csv"))
    if df.empty:
        raise HTTPException(404, "No bundle data found.")
    return to_json(df)


# ── API: Clusters ─────────────────────────────────────────────────────────────

@app.get("/api/clusters")
def get_clusters():
    """BERTopic + KMeans cluster assignments."""
    df = read_csv(os.path.join(DATA_OUT, "skill_clusters.csv"))
    if df.empty:
        raise HTTPException(404, "No cluster data found.")
    return to_json(df.sort_values("total_count", ascending=False))


# ── API: History ──────────────────────────────────────────────────────────────

@app.get("/api/history/{skill}")
def get_history(skill: str):
    """Full historical weekly series for one skill."""
    series_path = os.path.join(DATA_MODELS, "skill_series.pkl")
    if not os.path.exists(series_path):
        raise HTTPException(404, "Model artifacts not found.")
    skill_series = joblib.load(series_path)
    if skill not in skill_series:
        raise HTTPException(404, f"Skill '{skill}' not found.")
    info = skill_series[skill]
    return {"skill": skill, "weeks": info["weeks"], "counts": info["counts"]}


# ── Run ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    print()
    print("=" * 55)
    print("  Skill Forecasting Engine")
    print("  Component 1 · SLIIT R26-IT-128")
    print("=" * 55)
    print("  Dashboard  : http://localhost:8001")
    print("  API docs   : http://localhost:8001/docs")
    print("  Scheduler  : starts automatically (every Mon 08:00)")
    print("  Press Ctrl+C to stop")
    print("=" * 55)
    print()
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8001,
        reload=False,          # set True only in dev (reload breaks scheduler)
        app_dir=os.path.dirname(__file__),
    )
