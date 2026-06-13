"""
Component 1 — Skill Forecasting Engine
=======================================
Single-file training script.

Steps (run in order):
  1. Build dataset  — reads remoteok.csv to weekly_skill_dataset.csv
  2. Forecasting    — ARIMA / Exponential Smoothing to forecasts.csv
  3. Lead-lag       — CCF + Granger Causality to lead_lag_analysis.csv
  4. Clustering     — BERTopic + KMeans to skill_clusters.csv / skill_bundles.csv

Usage:
  python train.py                  # run all steps
  python train.py --step dataset   # only build dataset
  python train.py --step forecast  # only run forecasting
  python train.py --step leadlag   # only run lead-lag
  python train.py --step cluster   # only run clustering

Output files land in:  data/output/
"""

import os, sys, ast, warnings, argparse
import numpy as np
import pandas as pd
from collections import defaultdict
from datetime import datetime, timedelta
from itertools import combinations

warnings.filterwarnings("ignore")

# ── Paths ─────────────────────────────────────────────────────────────────────

BASE       = os.path.dirname(__file__)
REMOTEOK   = os.path.join(BASE, "data/raw/global/remoteok.csv")
JOBS_PATH  = os.path.join(BASE, "data/processed/jobs_with_skills.csv")
DATASET    = os.path.join(BASE, "data/dataset/weekly_skill_dataset.csv")
OUT_DIR    = os.path.join(BASE, "data/output")

os.makedirs(os.path.join(BASE, "data/processed"),       exist_ok=True)
os.makedirs(os.path.join(BASE, "data/dataset"),         exist_ok=True)
os.makedirs(OUT_DIR,                                    exist_ok=True)

# ── Hyperparameters ───────────────────────────────────────────────────────────

FORECAST_WEEKS  = 12
MIN_ARIMA       = 8
MIN_ES          = 4
MIN_SKILL_COUNT = 5
MAX_LAG         = 8
MIN_WEEKS_LL    = 6
N_CLUSTERS      = 8
TOP_BUNDLES     = 20

# =============================================================================
# SECTION 1 — IT Skills Master List
# =============================================================================

IT_SKILLS = [
    # Languages
    "python", "java", "javascript", "typescript", "golang", "go", "rust",
    "php", "c++", "c#", "ruby", "swift", "kotlin", "scala", "r",
    "bash", "shell", "perl", "dart", "elixir",
    # Frontend
    "react", "angular", "vue", "vue.js", "next.js", "nuxt", "svelte",
    "html", "css", "sass", "tailwind", "bootstrap", "jquery",
    "redux", "graphql", "webpack",
    # Backend
    "node.js", "nodejs", "express", "django", "flask", "fastapi",
    "spring", "spring boot", "laravel", "rails", "asp.net", ".net",
    "nest.js", "nestjs", "fiber", "gin",
    # Cloud
    "aws", "azure", "gcp", "google cloud", "heroku", "vercel",
    "cloudflare", "digitalocean",
    # DevOps
    "docker", "kubernetes", "k8s", "terraform", "ansible", "jenkins",
    "ci/cd", "github actions", "gitlab ci", "circleci",
    "linux", "nginx", "apache",
    # Databases
    "mysql", "postgresql", "postgres", "mongodb", "redis", "sqlite",
    "elasticsearch", "neo4j", "cassandra", "dynamodb", "firestore",
    "oracle", "mssql", "sql server", "mariadb",
    # Data & ML
    "machine learning", "deep learning", "nlp", "computer vision",
    "tensorflow", "pytorch", "keras", "scikit-learn", "sklearn",
    "pandas", "numpy", "matplotlib", "spark", "hadoop", "kafka",
    "airflow", "dbt", "tableau", "power bi", "looker",
    "llm", "langchain", "openai", "bert", "transformers",
    "mlops", "data engineering", "data science",
    # Mobile
    "android", "ios", "react native", "flutter", "xamarin",
    # Other
    "rest api", "rest", "api", "microservices", "agile", "scrum",
    "git", "jira", "figma", "system design",
    "cybersecurity", "penetration testing", "blockchain", "solidity",
    "selenium", "playwright", "jest", "pytest", "junit",
]

SKILL_ALIASES = {
    "node.js":     "nodejs",
    "nestjs":      "nest.js",
    "golang":      "go",
    "sklearn":     "scikit-learn",
    "postgres":    "postgresql",
    "k8s":         "kubernetes",
    "vue.js":      "vue",
    "spring boot": "spring",
    "asp.net":     "dotnet",
    ".net":        "dotnet",
    "c#":          "csharp",
    "c++":         "cpp",
    "gcp":         "google cloud",
}

IT_SKILLS_SET = set(SKILL_ALIASES.get(s.strip().lower(), s.strip().lower()) for s in IT_SKILLS)


def normalize(skill: str) -> str:
    s = skill.strip().lower()
    return SKILL_ALIASES.get(s, s)


# =============================================================================
# SECTION 2 — Dataset Builder
# =============================================================================

def extract_skills_from_tags(tags_str: str) -> list:
    if pd.isna(tags_str) or not tags_str:
        return []
    tags = [t.strip().lower() for t in tags_str.split(",")]
    return list({normalize(t) for t in tags if normalize(t) in IT_SKILLS_SET})


def load_and_extract(csv_path: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    print(f"  Loaded {len(df)} rows from {csv_path}")

    df["skills"]      = df["tags"].apply(extract_skills_from_tags)
    df["skill_count"] = df["skills"].apply(len)
    df = df[df["skill_count"] > 0].reset_index(drop=True)
    print(f"  Jobs with IT skills: {len(df)}")

    if "week" not in df.columns:
        df["week"] = pd.to_datetime(df["post_date"]).dt.strftime("%Y-W%W")

    return df[["id", "title", "company", "skills", "week", "post_date", "source"]]


def build_weekly_dataset(df: pd.DataFrame) -> pd.DataFrame:
    df_exp = df.explode("skills").rename(columns={"skills": "skill"})
    df_exp = df_exp[df_exp["skill"].notna() & (df_exp["skill"] != "")]

    weekly_count = (
        df_exp.groupby(["week", "skill"]).size().reset_index(name="count")
    )

    coskill_map = defaultdict(lambda: defaultdict(int))
    for _, row in df.iterrows():
        skills = row["skills"]
        week   = row["week"]
        if len(skills) < 2:
            continue
        for s1, s2 in combinations(sorted(skills), 2):
            coskill_map[(week, s1)][s2] += 1
            coskill_map[(week, s2)][s1] += 1

    def top_coskills(week, skill, top_n=3):
        pairs = coskill_map.get((week, skill), {})
        return [s for s, _ in sorted(pairs.items(), key=lambda x: -x[1])[:top_n]]

    weekly_count["co_skills"] = weekly_count.apply(
        lambda r: top_coskills(r["week"], r["skill"]), axis=1
    )

    return weekly_count.sort_values(["week", "count"], ascending=[True, False]).reset_index(drop=True)


def step_build_dataset():
    print("\n" + "=" * 55)
    print("  Step 1/3 — Building Weekly Skill Dataset")
    print("=" * 55)

    df = load_and_extract(REMOTEOK)

    df_save = df.copy()
    df_save["skills"] = df_save["skills"].apply(str)
    df_save.to_csv(JOBS_PATH, index=False)
    print(f"  Saved: {JOBS_PATH}")

    dataset = build_weekly_dataset(df)
    ds_save = dataset.copy()
    ds_save["co_skills"] = ds_save["co_skills"].apply(str)
    ds_save.to_csv(DATASET, index=False)

    print(f"  Saved: {DATASET}")
    print(f"  Rows={len(dataset)}  Weeks={dataset['week'].nunique()}  Skills={dataset['skill'].nunique()}")
    print("\n  Preview:")
    print(dataset[["week", "skill", "count"]].head(10).to_string(index=False))

    return dataset


# =============================================================================
# SECTION 3 — Demand Forecasting (ARIMA / Exponential Smoothing)
# =============================================================================

def week_to_date(week_str: str) -> datetime:
    try:
        return datetime.strptime(week_str + "-1", "%Y-W%W-%w")
    except Exception:
        return datetime.now()


def next_week_labels(last_week: str, steps: int) -> list:
    base = week_to_date(last_week)
    return [(base + timedelta(weeks=i)).strftime("%Y-W%W") for i in range(1, steps + 1)]


def classify_trend(historical: list, forecast: list) -> str:
    n = len(historical)
    if n < 2:
        return "stable"
    # Use linear regression slope on the full historical series.
    # This captures long-term direction reliably even when ARIMA forecasts
    # flatten near the current value (common with d=1 differencing).
    x           = np.arange(n, dtype=float)
    coeffs      = np.polyfit(x, historical, 1)
    slope       = coeffs[0]
    mean_val    = np.mean(historical) + 1e-9
    # Relative weekly slope: how much does the series change per week
    # as a fraction of its mean?  Threshold ±0.5% per week.
    rel_slope   = slope / mean_val
    if rel_slope > 0.005:
        return "rising"
    if rel_slope < -0.005:
        return "falling"
    return "stable"


def forecast_arima(series: list) -> list:
    from statsmodels.tsa.arima.model import ARIMA
    try:
        result = ARIMA(series, order=(1, 1, 1)).fit()
        return [max(0, round(v, 2)) for v in result.forecast(steps=FORECAST_WEEKS)]
    except Exception:
        return forecast_es(series)


def forecast_es(series: list) -> list:
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    try:
        result = ExponentialSmoothing(series, trend="add", initialization_method="estimated").fit()
        return [max(0, round(v, 2)) for v in result.forecast(FORECAST_WEEKS)]
    except Exception:
        last = series[-1] if series else 0
        return [max(0, round(last, 2))] * FORECAST_WEEKS


def step_forecasting():
    import joblib, json as _json

    print("\n" + "=" * 55)
    print("  Step 2/3 — Demand Forecasting")
    print("=" * 55)

    df        = pd.read_csv(DATASET)
    all_weeks = sorted(df["week"].unique(), key=week_to_date)
    skills    = df["skill"].unique()
    print(f"  Skills={len(skills)}  Weeks={len(all_weeks)}  ({all_weeks[0]} to {all_weeks[-1]})")

    MODELS_DIR = os.path.join(BASE, "data", "models")
    os.makedirs(MODELS_DIR, exist_ok=True)

    results        = []
    skill_series   = {}   # saved for predict.py
    model_registry = {}   # saved for predict.py

    for skill in skills:
        sd = df[df["skill"] == skill].set_index("week")

        count_series = [int(sd.loc[w, "count"]) if w in sd.index else 0 for w in all_weeks]

        n = len(count_series)
        if n < MIN_ES:
            continue

        if n >= MIN_ARIMA:
            count_fore, method = forecast_arima(count_series), "ARIMA"
        else:
            count_fore, method = forecast_es(count_series),   "ES"

        trend = classify_trend(count_series, count_fore)

        for i, (fw, fc) in enumerate(zip(next_week_labels(all_weeks[-1], FORECAST_WEEKS), count_fore)):
            results.append({
                "skill":             skill,
                "forecast_week":     fw,
                "forecast_step":     i + 1,
                "predicted_count":   fc,
                "trend":             trend,
                "method":            method,
                "data_points_used":  n,
                "last_actual_count": count_series[-1],
                "avg_actual_count":  round(np.mean(count_series), 2),
            })

        # ── Store artifacts for predict.py ──
        skill_series[skill] = {"weeks": list(all_weeks), "counts": count_series}
        model_registry[skill] = {
            "method":      method,
            "data_points": n,
            "last_week":   all_weeks[-1],
            "trend":       trend,
        }

    out = pd.DataFrame(results)
    out_path = os.path.join(OUT_DIR, "forecasts.csv")
    out.to_csv(out_path, index=False)
    print(f"  Forecasted {out['skill'].nunique()} skills to {out_path}")

    # ── Save model artifacts ──
    series_path   = os.path.join(MODELS_DIR, "skill_series.pkl")
    registry_path = os.path.join(MODELS_DIR, "model_registry.json")
    joblib.dump(skill_series, series_path)
    with open(registry_path, "w") as f:
        _json.dump(model_registry, f, indent=2)
    print(f"  Model artifacts saved -> data/models/")
    print(f"    skill_series.pkl     ({len(skill_series)} skills)")
    print(f"    model_registry.json  ({len(model_registry)} entries)")

    trend_counts = out.drop_duplicates("skill")["trend"].value_counts()
    for t, c in trend_counts.items():
        print(f"    {t:10s}: {c}")

    print("\n  Top rising skills:")
    rising = out[out["trend"] == "rising"].drop_duplicates("skill")[["skill", "avg_actual_count", "predicted_count"]].head(8)
    print(rising.to_string(index=False))

    return out


# =============================================================================
# SECTION 4 — Global-Local Lead-Lag (CCF + Granger Causality)
# =============================================================================

def parse_skills(s):
    if isinstance(s, list):
        return s
    try:
        return ast.literal_eval(s)
    except Exception:
        return []


def build_weekly_counts_by_source(df: pd.DataFrame, source: str) -> pd.DataFrame:
    src = df[df["source"] == source].copy()
    src["skills"] = src["skills"].apply(parse_skills)
    exp = src.explode("skills").rename(columns={"skills": "skill"})
    exp = exp[exp["skill"].notna() & (exp["skill"] != "")]
    return exp.groupby(["week", "skill"]).size().reset_index(name="count")


def step_lead_lag():
    from statsmodels.tsa.stattools import ccf, grangercausalitytests

    print("\n" + "=" * 55)
    print("  Step 3/3 — Global-Local Lead-Lag Analysis")
    print("=" * 55)

    df = pd.read_csv(JOBS_PATH)
    print(f"  Loaded {len(df)} jobs")

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

    global_counts = build_weekly_counts_by_source(df, global_src)
    local_counts  = build_weekly_counts_by_source(df, local_src)

    all_weeks     = sorted(set(global_counts["week"]) | set(local_counts["week"]), key=week_to_date)
    common_skills = set(global_counts["skill"].unique()) & set(local_counts["skill"].unique())
    print(f"  Common skills: {len(common_skills)}  Weeks: {len(all_weeks)}")

    results = []
    for skill in sorted(common_skills):
        g_df = global_counts[global_counts["skill"] == skill].set_index("week")
        l_df = local_counts[local_counts["skill"]  == skill].set_index("week")

        g_series = np.array([g_df.loc[w, "count"] if w in g_df.index else 0 for w in all_weeks], dtype=float)
        l_series = np.array([l_df.loc[w, "count"] if w in l_df.index else 0 for w in all_weeks], dtype=float)

        if np.count_nonzero(g_series) < MIN_WEEKS_LL or np.count_nonzero(l_series) < MIN_WEEKS_LL:
            continue

        try:
            corr_values = ccf(g_series, l_series, nlags=MAX_LAG, adjusted=False)
            best_lag    = int(np.argmax(np.abs(corr_values[1:]))) + 1
            best_corr   = float(corr_values[best_lag])
        except Exception:
            best_lag, best_corr = 0, 0.0

        granger_sig, granger_pval = False, 1.0
        try:
            combined  = pd.DataFrame({"local": l_series, "global": g_series})
            max_g     = min(MAX_LAG, len(all_weeks) // 3)
            gc_res    = grangercausalitytests(combined[["local", "global"]], maxlag=max_g, verbose=False)
            pvals     = [gc_res[lag][0]["ssr_ftest"][1] for lag in gc_res]
            granger_pval = float(min(pvals))
            granger_sig  = granger_pval < 0.05
        except Exception:
            pass

        results.append({
            "skill":               skill,
            "best_lag_weeks":      best_lag,
            "ccf_correlation":     round(best_corr, 4),
            "granger_pval":        round(granger_pval, 4),
            "granger_sig":         granger_sig,
            "interpretation":      (
                f"Global leads local by {best_lag}w"
                if best_corr > 0.3 and granger_sig
                else "No clear lead-lag pattern"
            ),
            "global_weeks_active": int(np.count_nonzero(g_series)),
            "local_weeks_active":  int(np.count_nonzero(l_series)),
        })

    out = pd.DataFrame(results)
    if not out.empty:
        out = out.sort_values("ccf_correlation", ascending=False).reset_index(drop=True)
        out_path = os.path.join(OUT_DIR, "lead_lag_analysis.csv")
        out.to_csv(out_path, index=False)
        print(f"  Analysed {len(out)} skills to {out_path}")

        sig = out[out["granger_sig"]]
        print(f"  Skills where global leads local (p<0.05): {len(sig)}")
        if not sig.empty:
            print(sig[["skill", "best_lag_weeks", "ccf_correlation", "granger_pval"]].head(8).to_string(index=False))
    else:
        print("  Not enough overlapping data.")

    return out


# =============================================================================
# SECTION 5 — Skill Clustering (BERTopic + KMeans) & Bundle Analysis
# =============================================================================

CLUSTER_THEMES = {
    0: "Cloud & DevOps",
    1: "Frontend & UI",
    2: "Backend & APIs",
    3: "Data & ML",
    4: "Mobile",
    5: "Databases",
    6: "Security & Systems",
    7: "General Engineering",
}


def cluster_kmeans(skills: list, cooc: dict) -> list:
    from sklearn.preprocessing import normalize as sk_normalize
    from sklearn.cluster import KMeans

    skill_idx = {s: i for i, s in enumerate(skills)}
    n   = len(skills)
    mat = np.zeros((n, n))
    for i, s1 in enumerate(skills):
        for s2, cnt in cooc.get(s1, {}).items():
            if s2 in skill_idx:
                mat[i, skill_idx[s2]] = cnt

    mat = sk_normalize(mat, norm="l2")
    k   = min(N_CLUSTERS, n)
    return KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(mat).tolist()


def cluster_bertopic(skills: list) -> dict:
    try:
        from bertopic import BERTopic
        model    = BERTopic(language="english", min_topic_size=2, verbose=False, calculate_probabilities=False)
        topics, _= model.fit_transform(skills)
        topic_info = model.get_topic_info()

        label_map = {}
        for _, row in topic_info.iterrows():
            tid = row["Topic"]
            label_map[tid] = ("Uncategorized" if tid == -1
                               else " / ".join([w for w, _ in model.get_topic(tid)[:3]]))

        return {skill: (topics[i], label_map.get(topics[i], "Unknown")) for i, skill in enumerate(skills)}
    except Exception as e:
        print(f"  BERTopic failed ({e}), falling back to KMeans labels")
        return {}


def find_trending_bundles(jobs_df: pd.DataFrame, dataset_df: pd.DataFrame) -> pd.DataFrame:
    """
    Derives bundles from the co_skills column in weekly_skill_dataset.csv.
    Each (skill, co_skill) pair is weighted by the skill's demand count.
    Recent = last 4 weeks vs older weeks -> growth_rate computed.
    """
    df = dataset_df.copy()
    df["co_skills_list"] = df["co_skills"].apply(parse_skills)

    all_weeks    = sorted(df["week"].unique(), key=week_to_date)
    recent_weeks = set(all_weeks[-4:]) if len(all_weeks) >= 4 else set(all_weeks)

    def pair_counts(subset):
        counts = defaultdict(int)
        for _, row in subset.iterrows():
            skill   = row["skill"]
            co_list = row["co_skills_list"]
            weight  = max(1, int(row["count"] / 10))
            for co in co_list:
                pair = tuple(sorted([skill, co]))
                counts[pair] += weight
        return counts

    recent = pair_counts(df[df["week"].isin(recent_weeks)])
    older  = pair_counts(df[~df["week"].isin(recent_weeks)])

    bundles = [
        {
            "skill_1":      p[0],
            "skill_2":      p[1],
            "bundle":       f"{p[0]} + {p[1]}",
            "recent_count": cnt,
            "older_count":  older.get(p, 0),
            "growth_rate":  round((cnt - older.get(p, 0)) / (older.get(p, 0) + 1), 3),
        }
        for p, cnt in recent.items()
    ]

    df_b = pd.DataFrame(bundles)
    if df_b.empty:
        return df_b
    return df_b.sort_values("growth_rate", ascending=False).head(TOP_BUNDLES).reset_index(drop=True)


def step_clustering():
    print("\n" + "=" * 55)
    print("  Step 4/4 — Skill Clustering & Bundle Analysis")
    print("=" * 55)

    dataset_df = pd.read_csv(DATASET)
    jobs_df    = pd.read_csv(JOBS_PATH)

    skill_totals  = dataset_df.groupby("skill")["count"].sum()
    active_skills = list(skill_totals[skill_totals >= MIN_SKILL_COUNT].index)
    print(f"  Active skills (count >= {MIN_SKILL_COUNT}): {len(active_skills)}")

    # Build co-occurrence
    jobs_df["skills"] = jobs_df["skills"].apply(parse_skills)
    cooc = defaultdict(lambda: defaultdict(int))
    for skills in jobs_df["skills"]:
        skills = list(set(skills))
        for s1, s2 in combinations(sorted(skills), 2):
            cooc[s1][s2] += 1
            cooc[s2][s1] += 1

    print("  Running BERTopic semantic clustering...")
    bertopic_map = cluster_bertopic(active_skills)

    print("  Running KMeans co-occurrence clustering...")
    km_labels = cluster_kmeans(active_skills, cooc)

    rows = []
    for i, skill in enumerate(active_skills):
        km_cluster            = km_labels[i]
        km_theme              = CLUSTER_THEMES.get(km_cluster, f"Cluster {km_cluster}")
        bt_cluster_id, bt_theme = bertopic_map.get(skill, (-1, ""))
        rows.append({
            "skill":            skill,
            "total_count":      int(skill_totals.get(skill, 0)),
            "kmeans_cluster":   km_cluster,
            "kmeans_theme":     km_theme,
            "bertopic_cluster": bt_cluster_id,
            "bertopic_theme":   bt_theme if bt_theme else km_theme,
            "top_coskills":     ", ".join(
                [s for s, _ in sorted(cooc.get(skill, {}).items(), key=lambda x: -x[1])[:3]]
            ),
        })

    clust_df = pd.DataFrame(rows).sort_values(["kmeans_cluster", "total_count"], ascending=[True, False])
    clust_path = os.path.join(OUT_DIR, "skill_clusters.csv")
    clust_df.to_csv(clust_path, index=False)
    print(f"  Saved skill clusters to {clust_path}")

    print("  Finding trending skill bundles...")
    bundles_df = find_trending_bundles(jobs_df, dataset_df)
    if not bundles_df.empty:
        bund_path = os.path.join(OUT_DIR, "skill_bundles.csv")
        bundles_df.to_csv(bund_path, index=False)
        print(f"  Saved skill bundles to {bund_path}")
        print("\n  Top 10 trending bundles:")
        print(bundles_df[["bundle", "recent_count", "growth_rate"]].head(10).to_string(index=False))

    print("\n  Clusters by theme:")
    for theme, group in clust_df.groupby("kmeans_theme"):
        skills_in = ", ".join(group["skill"].head(5).tolist())
        print(f"    [{theme}]: {skills_in}")

    return clust_df, bundles_df


# =============================================================================
# SECTION 6 — Final Summary Report
# =============================================================================

def print_summary(forecasts_df, leadlag_df, clust_df, bundles_df):
    print("\n" + "#" * 55)
    print("#         FINAL SUMMARY REPORT                       #")
    print("#" * 55)

    if not forecasts_df.empty:
        dedup   = forecasts_df.drop_duplicates("skill")
        rising  = dedup[dedup["trend"] == "rising"]["skill"].tolist()
        falling = dedup[dedup["trend"] == "falling"]["skill"].tolist()
        stable  = dedup[dedup["trend"] == "stable"]["skill"].tolist()
        print(f"\nSkills forecasted : {len(dedup)}")
        print(f"  Rising  ({len(rising):2d}): {', '.join(rising[:8])}")
        print(f"  Stable  ({len(stable):2d}): {', '.join(stable[:8])}")
        print(f"  Falling ({len(falling):2d}): {', '.join(falling[:8])}")

        week4 = forecasts_df[forecasts_df["forecast_step"] <= 4]
        top5  = week4.groupby("skill")["predicted_count"].mean().sort_values(ascending=False).head(5)
        print(f"\nTop 5 high-demand skills (next 4 weeks):")
        for sk, cnt in top5.items():
            trend = dedup[dedup["skill"] == sk]["trend"].values[0]
            print(f"  {sk:20s}  {cnt:.1f}/week  [{trend}]")

    if not leadlag_df.empty:
        sig = leadlag_df[leadlag_df["granger_sig"]]
        if not sig.empty:
            print(f"\nGlobal skills leading local ({len(sig)} skills):")
            for _, row in sig.head(5).iterrows():
                print(f"  {row['skill']:20s}  lag={row['best_lag_weeks']}w  corr={row['ccf_correlation']:.2f}")

    if not bundles_df.empty:
        print(f"\nTop 5 trending skill bundles:")
        for _, row in bundles_df.head(5).iterrows():
            print(f"  {row['bundle']:35s}  growth={row['growth_rate']:+.1%}")

    print(f"\nOutputs saved to: {OUT_DIR}/")
    print("  forecasts.csv          — 12-week demand forecasts")
    print("  lead_lag_analysis.csv  — global-local lead-lag signals")
    print("  skill_clusters.csv     — semantic skill groupings")
    print("  skill_bundles.csv      — trending co-skill pairs")


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Component 1 - Skill Forecasting Engine")
    parser.add_argument("--step", choices=["dataset", "forecast", "leadlag", "cluster"],
                        help="Run only one step (default: run all)")
    parser.add_argument("--skip-dataset", action="store_true",
                        help="Skip step 1 (dataset build). Use when dataset was built "
                             "from Google Trends via build_trends_dataset.py")
    args = parser.parse_args()

    print("\n" + "#" * 55)
    print("#   Component 1 - Skill Forecasting Engine           #")
    print("#   SLIIT R26-IT-128 - IT22154408                    #")
    print("#" * 55)

    forecasts_df = leadlag_df = pd.DataFrame()
    clust_df = bundles_df = pd.DataFrame()

    if args.step == "dataset":
        step_build_dataset()
        return

    if args.step == "forecast":
        forecasts_df = step_forecasting()
        return

    if args.step == "leadlag":
        leadlag_df = step_lead_lag()
        return

    if args.step == "cluster":
        clust_df, bundles_df = step_clustering()
        return

    # Run all
    if not args.skip_dataset:
        step_build_dataset()
    else:
        print("\n[Skipping dataset build — using existing weekly_skill_dataset.csv]")

    forecasts_df          = step_forecasting()
    leadlag_df            = step_lead_lag()
    clust_df, bundles_df  = step_clustering()
    print_summary(forecasts_df, leadlag_df, clust_df, bundles_df)


if __name__ == "__main__":
    main()
