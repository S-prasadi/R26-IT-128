# Component 1 — Skill Forecasting Engine

| | |
|---|---|
| **Project** | Skill Forecasting and Semantic Career Pathway Optimization Ecosystem for Undergraduates |
| **Project ID** | R26-IT-128 |
| **Student** | Rathnayake K.D.V — IT22154408 |
| **Institution** | SLIIT — Sri Lanka Institute of Information Technology |
| **Supervisors** | Ms. Dushanthi Sadeepa Kuruppu & Ms. Kaushika Kahatapitiya |
| **Year** | March 2026 |

---

## What This Component Does

The Skill Forecasting Engine answers one question:

> **Which IT skills will Sri Lankan undergraduates need most over the next 3 months?**

It collects weekly skill demand data from 4 job portals, trains a time-series model per skill, detects whether global trends are leading local trends, and groups related skills into semantic clusters. A live dashboard shows all results automatically — updated every week without any manual action.

---

## Quick Start (3 commands)

```bash
# 1. Install all dependencies
pip install -r requirements.txt

# 2. Generate data + train all models
python scraping/generate_trends_dataset.py
python scraping/build_trends_dataset.py
python train.py --skip-dataset

# 3. Start the server (dashboard + scheduler — everything runs automatically)
python api/app.py
```

Open **http://localhost:8000** in your browser.

That is all. The scheduler starts automatically inside the server. Every Monday at 08:00 it scrapes new data, rebuilds the dataset, and updates forecasts. The dashboard reflects the latest results.

---

## How the Project Works (Step by Step)

### Step 1 — Data Generation

```
python scraping/generate_trends_dataset.py
```

Generates 131 weeks (2024-W01 to 2026-W26) of synthetic but realistic skill demand data for 57 IT skills across 4 sources.

Each skill is given a realistic trend shape:
- `linear` — steady growth or decline (e.g. Java, PHP)
- `sigmoid_rise` — slow start then rapid adoption (e.g. LLM, LangChain)
- `bump_then_fall` — hype cycle (e.g. Blockchain)

Each source has its own noise profile and scale:

| Source | Type | Noise | Description |
|---|---|---|---|
| `google_trends_global` | Global | 6% | Worldwide search interest index (0–100) |
| `linkedin_jobs` | Global | 7% | Global LinkedIn job posting density (0–100) |
| `google_trends_lk` | Local | 8% | Sri Lanka search interest index (0–100) |
| `topjobs_lk` | Local | 9% | TopJobs.lk posting density (0–100) |

Global sources are built to **lead local sources by 1–4 weeks** — this is the signal detected later by the lead-lag model.

**Output files:**
```
data/raw/global/trends_global.csv   — 7,467 rows
data/raw/global/linkedin_jobs.csv   — 7,467 rows
data/raw/local/trends_lk.csv        — 7,467 rows
data/raw/local/topjobs_lk.csv       — 7,467 rows
```

---

### Step 2 — Dataset Build

```
python scraping/build_trends_dataset.py
```

Reads all 4 raw source CSVs and produces two dataset files used for training.

**weekly_skill_dataset.csv** — one row per skill per week, aggregated across all sources:

| Column | Description |
|---|---|
| `week` | ISO week label e.g. `2024-W01` |
| `skill` | Skill name e.g. `python` |
| `count` | Total trend_index summed across all 4 sources |
| `co_skills` | Top 3 skills that co-occur above their median in the same week |

**jobs_with_skills.csv** — weighted job rows for lead-lag analysis:
- Each skill gets `max(1, round(trend_index / 5))` rows per week per source
- Row count variation is the frequency signal the CCF model reads
- ~182,000 rows total

**Output files:**
```
data/dataset/weekly_skill_dataset.csv   — 7,467 rows
data/processed/jobs_with_skills.csv     — ~182,000 rows
```

---

### Step 3 — Model Training

```
python train.py --skip-dataset
```

Runs 3 models in sequence.

#### Model 1 — Demand Forecasting (ARIMA + Exponential Smoothing)

Reads `weekly_skill_dataset.csv`. For each skill it builds a time series of weekly counts and fits a model:

```
If skill has >= 8 weeks of data  →  ARIMA(1,1,1)
If skill has  4–7 weeks of data  →  Holt's Exponential Smoothing
If skill has  < 4 weeks of data  →  Skipped
```

**ARIMA(1,1,1)** means:
- `p=1` — uses 1 lag of the series
- `d=1` — first-differences the series to make it stationary
- `q=1` — uses 1 lag of the forecast error

Trend direction is classified using **linear regression slope** on the historical series:

```
relative_slope = slope / mean_value

relative_slope > +0.005  →  rising
relative_slope < -0.005  →  falling
otherwise                →  stable
```

Forecasts 12 weeks ahead (3 months) for every skill.

**Output:** `data/output/forecasts.csv`

| Column | Description |
|---|---|
| `skill` | Skill name |
| `forecast_week` | Week being predicted (e.g. `2026-W27`) |
| `forecast_step` | 1 = next week, 12 = 3 months ahead |
| `predicted_count` | Predicted demand count |
| `trend` | `rising` / `stable` / `falling` |
| `method` | `ARIMA` or `ES` |
| `data_points_used` | How many historical weeks were used |
| `last_actual_count` | Most recent actual count |
| `avg_actual_count` | Historical average |

**Saved model artifacts** (used by `predict.py` for fast weekly updates):
```
data/models/skill_series.pkl      — historical count series per skill
data/models/model_registry.json   — method (ARIMA/ES) used per skill
```

---

#### Model 2 — Global-Local Lead-Lag Analysis (CCF + Granger Causality)

Reads `jobs_with_skills.csv`. Compares weekly skill frequencies between `google_trends_global` (global) and `google_trends_lk` (local Sri Lanka) to detect how many weeks global trends lead local demand.

**Two statistical tests are used together:**

**CCF (Cross-Correlation Function)**
- Computes correlation between global and local series at lags 1–8 weeks
- Finds the lag with the highest absolute correlation
- That lag = how many weeks global leads local

**Granger Causality Test**
- Tests whether past values of the global series improve prediction of the local series
- If p-value < 0.05 → global Granger-causes local (statistically significant lead)

A skill is marked as a **confirmed lead-lag signal** only if both conditions hold:
1. CCF finds a positive lag (global leads)
2. Granger p-value < 0.05

**Output:** `data/output/lead_lag_analysis.csv`

| Column | Description |
|---|---|
| `skill` | Skill name |
| `best_lag_weeks` | How many weeks global leads local |
| `ccf_correlation` | Correlation at that lag (0–1) |
| `granger_pval` | Granger causality p-value |
| `granger_sig` | `True` if p < 0.05 |
| `interpretation` | Human-readable result |

**Current result:** 32 out of 57 skills show a confirmed global → local lead.

---

#### Model 3 — Skill Clustering (BERTopic + KMeans)

Groups all 57 skills into semantic clusters using two complementary methods.

**BERTopic (semantic clustering)**
- Encodes skill names using `sentence-transformers/all-MiniLM-L6-v2`
- Clusters by semantic meaning (e.g. `docker`, `kubernetes`, `terraform` grouped by meaning)
- Produces topic labels made of top-3 words per cluster

**KMeans (co-occurrence clustering)**
- Builds a co-occurrence frequency matrix from `jobs_with_skills.csv`
- Normalises with L2 norm
- Fits KMeans with k=8 clusters
- Groups skills that appear together frequently

Both results are stored per skill. BERTopic theme is used as the primary label.

**Output:** `data/output/skill_clusters.csv` and `data/output/skill_bundles.csv`

Skill bundles are pairs that co-occur above their weekly median together — computed from the `co_skills` column and weighted by demand count.

---

### Step 4 — API Server + Auto-Scheduler

```
python api/app.py
```

Starts two things simultaneously:

**FastAPI server** — serves the dashboard at `http://localhost:8000` and all data through REST endpoints.

**APScheduler** — runs inside the server process. No separate command needed. Every Monday at 08:00 (Asia/Colombo) it automatically calls `weekly_scraper.py`.

The automatic weekly scrape does:
1. Reads the last week from each raw CSV
2. Continues each skill's trend with realistic noise (random walk + momentum)
3. Appends new rows to all 4 source CSVs
4. Rebuilds `weekly_skill_dataset.csv` via `build_trends_dataset.py`
5. Loads saved model artifacts and refits ARIMA/ES on the extended series
6. Saves updated `forecasts.csv`
7. Logs the run to `data/scrape_log.csv`

The dashboard auto-refreshes every 5 minutes and reflects the latest data.

---

## File Structure

```
Component_1_Skill_Forecasting/
│
├── api/
│   └── app.py                      ← FastAPI server + embedded scheduler
│
├── dashboard/
│   └── index.html                  ← Live dashboard (auto-fetches from API)
│
├── model/
│   ├── forecasting.py              ← ARIMA + Exponential Smoothing
│   ├── lead_lag.py                 ← CCF + Granger Causality
│   ├── clustering.py               ← BERTopic + KMeans
│   └── pipeline.py                 ← Runs all 3 models in sequence
│
├── scraping/
│   ├── generate_trends_dataset.py  ← Generates base synthetic dataset
│   ├── build_trends_dataset.py     ← Builds training CSV from raw sources
│   ├── weekly_scraper.py           ← Weekly data generator (called by scheduler)
│   └── it_skills_list.py           ← Master list of 57 tracked skills
│
├── data/
│   ├── raw/
│   │   ├── global/
│   │   │   ├── trends_global.csv   ← Google Trends Worldwide
│   │   │   └── linkedin_jobs.csv   ← LinkedIn job postings
│   │   └── local/
│   │       ├── trends_lk.csv       ← Google Trends Sri Lanka
│   │       └── topjobs_lk.csv      ← TopJobs.lk postings
│   │
│   ├── dataset/
│   │   └── weekly_skill_dataset.csv  ← Aggregated training data (7,467 rows)
│   │
│   ├── processed/
│   │   └── jobs_with_skills.csv      ← Weighted rows for lead-lag (~182,000 rows)
│   │
│   ├── models/
│   │   ├── skill_series.pkl          ← Saved historical series (for fast predict)
│   │   └── model_registry.json       ← Which model method was used per skill
│   │
│   ├── output/
│   │   ├── forecasts.csv             ← 12-week demand forecast (684 rows)
│   │   ├── lead_lag_analysis.csv     ← CCF + Granger results (57 rows)
│   │   ├── skill_clusters.csv        ← Cluster assignment (57 rows)
│   │   └── skill_bundles.csv         ← Co-skill pairs (20 rows)
│   │
│   └── scrape_log.csv                ← Log of every weekly scrape
│
├── train.py                        ← Full training pipeline runner
├── predict.py                      ← Fast predict with new weekly data
├── scheduler.py                    ← Standalone scheduler (optional)
├── requirements.txt
└── README.md
```

---

## Running Commands Reference

### First-time setup

```bash
# Install packages
pip install -r requirements.txt

# Generate base dataset (run once)
python scraping/generate_trends_dataset.py

# Build training files from raw data
python scraping/build_trends_dataset.py

# Train all 3 models and save artifacts
python train.py --skip-dataset

# Start the server (dashboard + scheduler auto-starts inside)
python api/app.py
```

### Add new data manually (without waiting for Monday)

```bash
# Add 1 new week
python scraping/weekly_scraper.py

# Add multiple weeks at once
python scraping/weekly_scraper.py --weeks 4

# Preview what would be added without writing
python scraping/weekly_scraper.py --dry-run
```

### Predict with specific new data

```bash
# Uses the latest week already in the dataset
python predict.py

# Pass a CSV file with new week data
python predict.py --new-data new_week.csv

# Pass inline skill counts
python predict.py --week 2026-W27 --skills "python:345,llm:250,react:228"
```

**New week CSV format:**
```csv
week,skill,count
2026-W27,python,345
2026-W27,llm,250
2026-W27,react,228
```

### Retrain from scratch

```bash
python scraping/generate_trends_dataset.py
python scraping/build_trends_dataset.py
python train.py --skip-dataset
```

---

## Dashboard

Open **http://localhost:8000** after running `python api/app.py`.

| Panel | What it shows |
|---|---|
| Header | Last update time · Next scheduled scrape · Current data week |
| Stat cards | Skills tracked · Rising · Stable · Falling · Data weeks · Global lead count |
| Forecast chart | Select any skill → see historical + 12-week forecast line |
| All skills table | Every skill with trend label, predicted demand, actual demand |
| Lead-lag chart | How many weeks global trends lead local for each skill |
| Correlation chart | CCF correlation strength per skill |
| Top demand bar | Top 10 skills by predicted weekly demand |
| Skill bundles | Pairs of skills that co-occur most in job postings |
| Skill clusters | BERTopic + KMeans groupings by theme |

The dashboard auto-refreshes every 5 minutes.

### API Endpoints

| Endpoint | Returns |
|---|---|
| `GET /` | Dashboard HTML |
| `GET /api/status` | Server time, last scrape, next scrape, dataset range |
| `GET /api/forecasts/all` | All 57 skills — trend + predicted/actual demand |
| `GET /api/forecasts/top?n=20` | Top N skills by 4-week average predicted demand |
| `GET /api/forecasts/chart/{skill}` | Historical + forecast series for Chart.js |
| `GET /api/lead-lag` | Full lead-lag results |
| `GET /api/lead-lag?significant_only=true` | Only Granger-confirmed signals |
| `GET /api/bundles` | Co-occurring skill pairs |
| `GET /api/clusters` | BERTopic + KMeans cluster assignments |
| `GET /api/history/{skill}` | Full historical weekly series for one skill |
| `GET /docs` | Auto-generated interactive API documentation |

### `POST /forecast` — personalised forecast (called by the Express backend)

Input: `{ user_id, skills: ["React", "Python", ...] }` — skill names are matched leniently (case/spacing/".js" insensitive).

Returns the payload the main app's Skill Intelligence page renders:

| Field | Meaning |
|---|---|
| `trending[]` | Per skill: `rank`, `predicted_weekly_demand` (avg predicted job-ad mentions/week over the next 4 weeks), `current_weekly_demand`, `velocity` (rising/stable/falling), `change_pct` |
| `matched` / `matched_skills` | Whether the user's skills had forecast data; when `false`, `trending` falls back to the overall market top and the UI says so explicitly |
| `early_warnings[]` | Granger-significant global→local leads with `weeks_ahead`, real `correlation`, and the interpretation string — filtered to correlation ≥ 0.5 and a positive lead (no fabricated dates) |
| `forecast_chart[]` | 12-week predicted series for the top 3 skills, labelled with real ISO weeks (e.g. `2026-W27`) |

This endpoint is read-only over the trained artifacts (`forecasts.csv`, `lead_lag_analysis.csv`); it never triggers a retrain. It is also called by the CV module to annotate job-post skill gaps with market demand.

> ⚠️ The server does not auto-reload — restart `api/app.py` after code changes.

---

## Model Summary

| Model | Input | Output | Validation Target |
|---|---|---|---|
| ARIMA(1,1,1) | Weekly count series per skill | 12-week demand forecast | MAPE < 20% |
| Holt's Exponential Smoothing | Weekly count series (short) | 12-week demand forecast | MAPE < 20% |
| BERTopic | Skill name strings | Semantic cluster labels | Precision/Recall ≥ 85% |
| KMeans (k=8) | Co-occurrence frequency matrix | Cluster ID per skill | — |
| CCF | Global vs local weekly count series | Lead lag in weeks | — |
| Granger Causality | Global vs local weekly count series | Significance (p < 0.05) | — |

---

## Skills Tracked (57 total)

| Category | Skills |
|---|---|
| Languages | Python, Java, JavaScript, TypeScript, Go, Rust, PHP, C#, C++, Kotlin, Swift, Ruby, Scala, Dart |
| Frontend | React, Angular, Vue, Next.js, Svelte, Tailwind, GraphQL |
| Backend | Node.js, Django, Flask, FastAPI, Spring, .NET, Laravel |
| Cloud / DevOps | AWS, Azure, Google Cloud, Docker, Kubernetes, Terraform |
| Databases | PostgreSQL, MySQL, MongoDB, Redis, Elasticsearch |
| Data / ML / AI | Machine Learning, Deep Learning, Data Science, Data Engineering, TensorFlow, PyTorch, scikit-learn, LLM, LangChain |
| Mobile | Flutter, React Native, Android, iOS |
| Other | DevOps, Cybersecurity, Blockchain, Microservices, Agile |

---

## System Integration

Component 1 is the **foundational data layer** of the 4-component platform:

```
Component 1 — Skill Forecasting Engine   (this component)
        |
        ├── rising skill list  ──────────►  Component 2 — Career Pathway Predictor
        └── skill demand data  ──────────►  Component 3 — CV Optimizer / HPVF

Component 4 — Interview Simulator        (standalone)
```

All components share a unified dashboard and analytics database.

---

*SLIIT · R26-IT-128 · 2026*
