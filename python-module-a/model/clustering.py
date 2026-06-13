"""
Skill Clustering via BERTopic + Co-occurrence Matrix
------------------------------------------------------
Groups semantically similar skills into clusters (themes).
Finds which skill bundles are trending together.

Reads:  data/dataset/weekly_skill_dataset.csv
        data/processed/jobs_with_skills.csv
Output: data/output/skill_clusters.csv
        data/output/skill_bundles.csv
"""

import os
import ast
import warnings
import numpy as np
import pandas as pd
from collections import defaultdict
from itertools import combinations

warnings.filterwarnings("ignore")

DATASET   = os.path.join(os.path.dirname(__file__), "../data/dataset/weekly_skill_dataset.csv")
JOBS_PATH = os.path.join(os.path.dirname(__file__), "../data/processed/jobs_with_skills.csv")
OUT_CLUST = os.path.join(os.path.dirname(__file__), "../data/output/skill_clusters.csv")
OUT_BUND  = os.path.join(os.path.dirname(__file__), "../data/output/skill_bundles.csv")
os.makedirs(os.path.dirname(OUT_CLUST), exist_ok=True)

MIN_SKILL_COUNT = 5   # minimum total count for a skill to be clustered


def parse_skills(s):
    if isinstance(s, list):
        return s
    try:
        return ast.literal_eval(s)
    except Exception:
        return []


# ── Co-occurrence matrix approach ────────────────────────────────────────────

def build_cooccurrence(jobs_df: pd.DataFrame):
    jobs_df = jobs_df.copy()
    jobs_df["skills"] = jobs_df["skills"].apply(parse_skills)

    cooc = defaultdict(lambda: defaultdict(int))
    skill_freq = defaultdict(int)

    for skills in jobs_df["skills"]:
        skills = list(set(skills))
        for s in skills:
            skill_freq[s] += 1
        for s1, s2 in combinations(sorted(skills), 2):
            cooc[s1][s2] += 1
            cooc[s2][s1] += 1

    return cooc, skill_freq


def cluster_with_kmeans(skills: list, cooc: dict, n_clusters: int = 8):
    from sklearn.preprocessing import normalize
    from sklearn.cluster import KMeans

    # Build co-occurrence feature matrix
    skill_idx = {s: i for i, s in enumerate(skills)}
    n = len(skills)
    mat = np.zeros((n, n))

    for i, s1 in enumerate(skills):
        for s2, cnt in cooc.get(s1, {}).items():
            if s2 in skill_idx:
                mat[i, skill_idx[s2]] = cnt

    mat = normalize(mat, norm="l2")

    k = min(n_clusters, n)
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = km.fit_predict(mat)
    return labels


def cluster_with_bertopic(skills: list) -> dict:
    try:
        from bertopic import BERTopic
        from sklearn.feature_extraction.text import CountVectorizer

        # Each "document" = skill name; BERTopic finds semantic clusters
        model = BERTopic(
            language="english",
            min_topic_size=2,
            verbose=False,
            calculate_probabilities=False,
        )
        topics, _ = model.fit_transform(skills)
        topic_info = model.get_topic_info()

        label_map = {}
        for _, row in topic_info.iterrows():
            topic_id = row["Topic"]
            if topic_id == -1:
                label_map[topic_id] = "Uncategorized"
            else:
                words = model.get_topic(topic_id)
                label_map[topic_id] = " / ".join([w for w, _ in words[:3]])

        return {skill: (topics[i], label_map.get(topics[i], "Unknown"))
                for i, skill in enumerate(skills)}
    except Exception as e:
        print(f"  BERTopic failed ({e}), using KMeans labels instead")
        return {}


# ── Cluster name mapping from KMeans label index ─────────────────────────────

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


# ── Trending skill bundles ────────────────────────────────────────────────────

def find_trending_bundles(jobs_df: pd.DataFrame, dataset_df: pd.DataFrame, top_n: int = 20):
    """
    Derives skill bundles from the co_skills column in weekly_skill_dataset.csv.
    For each (skill, week) row, we expand the co_skills list into pairs:
      (skill, co_skill_1), (skill, co_skill_2), ...
    Then compare the last 4 weeks (recent) vs earlier weeks to find growth.
    """
    from datetime import datetime

    def week_to_date(w):
        try:
            return datetime.strptime(w + "-1", "%Y-W%W-%w")
        except Exception:
            return datetime.min

    df = dataset_df.copy()
    df["co_skills_list"] = df["co_skills"].apply(parse_skills)

    all_weeks    = sorted(df["week"].unique(), key=week_to_date)
    recent_weeks = set(all_weeks[-4:]) if len(all_weeks) >= 4 else set(all_weeks)

    def pair_counts(subset):
        counts = defaultdict(int)
        for _, row in subset.iterrows():
            skill   = row["skill"]
            co_list = row["co_skills_list"]
            weight  = max(1, int(row["count"] / 10))   # weight by demand
            for co in co_list:
                pair = tuple(sorted([skill, co]))
                counts[pair] += weight
        return counts

    recent_df    = df[df["week"].isin(recent_weeks)]
    older_df     = df[~df["week"].isin(recent_weeks)]
    recent_pairs = pair_counts(recent_df)
    older_pairs  = pair_counts(older_df)

    bundles = []
    for pair, cnt in recent_pairs.items():
        old_cnt = older_pairs.get(pair, 0)
        growth  = (cnt - old_cnt) / (old_cnt + 1)
        bundles.append({
            "skill_1":      pair[0],
            "skill_2":      pair[1],
            "bundle":       f"{pair[0]} + {pair[1]}",
            "recent_count": cnt,
            "older_count":  old_cnt,
            "growth_rate":  round(growth, 3),
        })

    df_bundles = pd.DataFrame(bundles)
    if df_bundles.empty:
        return df_bundles

    df_bundles = df_bundles.sort_values("growth_rate", ascending=False).head(top_n)
    return df_bundles.reset_index(drop=True)


# ── Main ──────────────────────────────────────────────────────────────────────

def run():
    print("=" * 55)
    print("  Skill Clustering & Bundle Analysis")
    print("=" * 55)

    dataset_df = pd.read_csv(DATASET)
    jobs_df    = pd.read_csv(JOBS_PATH)

    # Filter to skills with enough data
    skill_totals = dataset_df.groupby("skill")["count"].sum()
    active_skills = list(skill_totals[skill_totals >= MIN_SKILL_COUNT].index)
    print(f"Active skills (count >= {MIN_SKILL_COUNT}): {len(active_skills)}")

    # Build co-occurrence matrix
    cooc, skill_freq = build_cooccurrence(jobs_df)

    # ── BERTopic clustering ──
    print("\nRunning BERTopic semantic clustering...")
    bertopic_map = cluster_with_bertopic(active_skills)

    # ── KMeans clustering (fallback or supplement) ──
    print("Running KMeans co-occurrence clustering...")
    km_labels = cluster_with_kmeans(active_skills, cooc, n_clusters=8)

    # Build cluster output
    cluster_rows = []
    for i, skill in enumerate(active_skills):
        km_cluster   = int(km_labels[i])
        km_theme     = CLUSTER_THEMES.get(km_cluster, f"Cluster {km_cluster}")
        bt_cluster_id, bt_theme = bertopic_map.get(skill, (-1, ""))
        cluster_rows.append({
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

    clust_df = pd.DataFrame(cluster_rows).sort_values(["kmeans_cluster", "total_count"], ascending=[True, False])
    clust_df.to_csv(OUT_CLUST, index=False)
    print(f"\nSaved skill clusters -> {OUT_CLUST}")

    # ── Trending bundles ──
    print("\nFinding trending skill bundles...")
    bundles_df = find_trending_bundles(jobs_df, dataset_df)
    if not bundles_df.empty:
        bundles_df.to_csv(OUT_BUND, index=False)
        print(f"Saved skill bundles -> {OUT_BUND}")
        print("\n--- Top 10 trending skill bundles ---")
        print(bundles_df[["bundle", "recent_count", "growth_rate"]].head(10).to_string(index=False))

    print("\n--- Skill clusters by theme ---")
    for theme, group in clust_df.groupby("kmeans_theme"):
        skills_in = ", ".join(group["skill"].head(6).tolist())
        print(f"  [{theme}]: {skills_in}")

    return clust_df, bundles_df


if __name__ == "__main__":
    run()
