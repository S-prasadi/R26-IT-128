"""
Multi-Source IT Skill Dataset Generator
========================================
Generates 2.5 years of weekly data (Jan 2024 - Jun 2026) from 4 simulated sources:

  Global sources:
    google_trends_global  - worldwide search interest (0-100 index)
    linkedin_jobs         - global LinkedIn job posting density (0-100 index)

  Local sources (Sri Lanka):
    google_trends_lk      - Sri Lanka search interest (0-100 index)
    topjobs_lk            - local job portal posting density (0-100 index)

Design:
  - 57 IT skills tracked across all 4 sources
  - Global sources lead local sources by 1-4 weeks (lead-lag signal)
  - AI/ML skills show sharp rise from mid-2024 onwards
  - Each source has its own noise profile and scale

Outputs:
  data/raw/global/trends_global.csv
  data/raw/global/linkedin_jobs.csv
  data/raw/local/trends_lk.csv
  data/raw/local/topjobs_lk.csv

Usage:
  python scraping/generate_trends_dataset.py
"""

import os
import numpy as np
import pandas as pd
from datetime import datetime, timedelta

np.random.seed(42)

BASE     = os.path.dirname(__file__)
OUT_DIR  = {
    "google_trends_global": os.path.join(BASE, "../data/raw/global/trends_global.csv"),
    "linkedin_jobs":        os.path.join(BASE, "../data/raw/global/linkedin_jobs.csv"),
    "google_trends_lk":     os.path.join(BASE, "../data/raw/local/trends_lk.csv"),
    "topjobs_lk":           os.path.join(BASE, "../data/raw/local/topjobs_lk.csv"),
}
for p in OUT_DIR.values():
    os.makedirs(os.path.dirname(p), exist_ok=True)

# ── Week labels: 2024-W01 to 2026-W22 (~130 weeks) ───────────────────────────

def generate_weeks(start="2024-01-01", n=130):
    base = datetime.strptime(start, "%Y-%m-%d")
    return [(base + timedelta(weeks=i)).strftime("%Y-W%W") for i in range(n)]

WEEKS = generate_weeks()
N     = len(WEEKS)

# ── Trend shapes ──────────────────────────────────────────────────────────────

def linear(start, end, n):
    return np.linspace(start, end, n)

def sigmoid_rise(start, peak, n, steepness=0.08, midpoint_frac=0.55):
    """S-curve: slow start, rapid rise, plateau. Good for AI/LLM adoption."""
    x     = np.linspace(-6, 6, n)
    shift = (midpoint_frac - 0.5) * 12
    sig   = 1 / (1 + np.exp(-(x + shift) * steepness * n / 8))
    return start + (peak - start) * sig

def bump_then_fall(start, peak, end, n, peak_frac=0.45):
    """Rise to a peak then fall. Good for blockchain/hype cycles."""
    peak_idx = int(n * peak_frac)
    rise = np.linspace(start, peak, peak_idx)
    fall = np.linspace(peak, end, n - peak_idx)
    return np.concatenate([rise, fall])

def noisy(series, std=3.5, floor=2, ceil=100):
    noise = np.random.normal(0, std, len(series))
    return np.clip(series + noise, floor, ceil).round(1)

# ── Skill definitions ─────────────────────────────────────────────────────────
# Each entry:
#   "base"    : (trend_shape, params)  — the ground-truth global series
#   "lk_ratio": how large LK values are relative to global (enterprise mix)
#   "lag"     : how many weeks global leads local
#   "lk_override": optional dict to override LK shape independently
#   "linkedin_scale": how prominent in LinkedIn job postings vs search trends
#
# All values are on a 0-100 scale.

SKILL_DEFS = {

    # ── Languages ──────────────────────────────────────────────────────────────
    "python": {
        "base":           ("linear",  60, 85),     # strong steady rise (AI boom)
        "lk_ratio":       0.70,
        "lag":            2,
        "lk_override":    ("linear",  42, 72),
        "linkedin_scale": 1.20,
    },
    "java": {
        "base":           ("linear",  55, 50),     # slight decline globally
        "lk_ratio":       1.25,
        "lag":            1,
        "lk_override":    ("linear",  72, 68),     # still dominant in LK
        "linkedin_scale": 1.10,
    },
    "javascript": {
        "base":           ("linear",  68, 62),
        "lk_ratio":       0.88,
        "lag":            1,
        "lk_override":    ("linear",  60, 57),
        "linkedin_scale": 1.05,
    },
    "typescript": {
        "base":           ("linear",  32, 58),     # rapidly rising
        "lk_ratio":       0.60,
        "lag":            3,
        "lk_override":    ("linear",  18, 38),
        "linkedin_scale": 1.15,
    },
    "go": {
        "base":           ("linear",  24, 40),
        "lk_ratio":       0.42,
        "lag":            4,
        "lk_override":    ("linear",   8, 16),
        "linkedin_scale": 1.10,
    },
    "rust": {
        "base":           ("linear",  15, 28),
        "lk_ratio":       0.32,
        "lag":            4,
        "lk_override":    ("linear",   4,  9),
        "linkedin_scale": 1.05,
    },
    "php": {
        "base":           ("linear",  38, 22),     # steady decline
        "lk_ratio":       1.00,
        "lag":            2,
        "lk_override":    ("linear",  40, 28),
        "linkedin_scale": 0.90,
    },
    "csharp": {
        "base":           ("linear",  32, 28),
        "lk_ratio":       1.35,
        "lag":            2,
        "lk_override":    ("linear",  50, 46),
        "linkedin_scale": 1.05,
    },
    "cpp": {
        "base":           ("linear",  24, 20),
        "lk_ratio":       0.72,
        "lag":            3,
        "lk_override":    ("linear",  20, 17),
        "linkedin_scale": 0.95,
    },
    "kotlin": {
        "base":           ("linear",  18, 22),
        "lk_ratio":       0.68,
        "lag":            3,
        "lk_override":    ("linear",  14, 18),
        "linkedin_scale": 1.00,
    },
    "swift": {
        "base":           ("linear",  20, 17),
        "lk_ratio":       0.40,
        "lag":            3,
        "lk_override":    ("linear",   8,  7),
        "linkedin_scale": 0.95,
    },
    "ruby": {
        "base":           ("linear",  16, 10),     # declining
        "lk_ratio":       0.50,
        "lag":            3,
        "lk_override":    ("linear",   7,  5),
        "linkedin_scale": 0.85,
    },
    "scala": {
        "base":           ("linear",  14, 10),
        "lk_ratio":       0.48,
        "lag":            3,
        "lk_override":    ("linear",   6,  5),
        "linkedin_scale": 0.90,
    },
    "dart": {
        "base":           ("linear",  14, 20),
        "lk_ratio":       0.80,
        "lag":            3,
        "lk_override":    ("linear",  13, 19),
        "linkedin_scale": 0.95,
    },

    # ── Frontend ───────────────────────────────────────────────────────────────
    "react": {
        "base":           ("linear",  60, 57),
        "lk_ratio":       0.90,
        "lag":            2,
        "lk_override":    ("linear",  55, 56),
        "linkedin_scale": 1.08,
    },
    "angular": {
        "base":           ("linear",  32, 26),
        "lk_ratio":       1.15,
        "lag":            2,
        "lk_override":    ("linear",  44, 39),
        "linkedin_scale": 1.00,
    },
    "vue": {
        "base":           ("linear",  22, 18),
        "lk_ratio":       0.72,
        "lag":            3,
        "lk_override":    ("linear",  16, 13),
        "linkedin_scale": 0.92,
    },
    "next.js": {
        "base":           ("linear",  26, 48),     # rising fast
        "lk_ratio":       0.55,
        "lag":            3,
        "lk_override":    ("linear",  14, 28),
        "linkedin_scale": 1.12,
    },
    "svelte": {
        "base":           ("linear",  10, 16),
        "lk_ratio":       0.38,
        "lag":            4,
        "lk_override":    ("linear",   4,  7),
        "linkedin_scale": 0.90,
    },
    "tailwind": {
        "base":           ("linear",  22, 42),     # rising quickly
        "lk_ratio":       0.68,
        "lag":            3,
        "lk_override":    ("linear",  15, 30),
        "linkedin_scale": 1.05,
    },
    "graphql": {
        "base":           ("linear",  20, 26),
        "lk_ratio":       0.62,
        "lag":            3,
        "lk_override":    ("linear",  13, 18),
        "linkedin_scale": 1.00,
    },

    # ── Backend ────────────────────────────────────────────────────────────────
    "nodejs": {
        "base":           ("linear",  50, 46),
        "lk_ratio":       0.85,
        "lag":            2,
        "lk_override":    ("linear",  44, 41),
        "linkedin_scale": 1.05,
    },
    "django": {
        "base":           ("linear",  26, 28),
        "lk_ratio":       0.72,
        "lag":            3,
        "lk_override":    ("linear",  19, 21),
        "linkedin_scale": 0.98,
    },
    "flask": {
        "base":           ("linear",  20, 18),
        "lk_ratio":       0.70,
        "lag":            3,
        "lk_override":    ("linear",  14, 13),
        "linkedin_scale": 0.92,
    },
    "fastapi": {
        "base":           ("sigmoid_rise", 12, 45),  # rapid adoption
        "lk_ratio":       0.58,
        "lag":            3,
        "lk_override":    ("linear",  8,  24),
        "linkedin_scale": 1.15,
    },
    "spring": {
        "base":           ("linear",  30, 26),
        "lk_ratio":       1.12,
        "lag":            2,
        "lk_override":    ("linear",  38, 34),
        "linkedin_scale": 1.05,
    },
    "dotnet": {
        "base":           ("linear",  32, 28),
        "lk_ratio":       1.22,
        "lag":            2,
        "lk_override":    ("linear",  46, 43),
        "linkedin_scale": 1.05,
    },
    "laravel": {
        "base":           ("linear",  24, 18),
        "lk_ratio":       0.98,
        "lag":            2,
        "lk_override":    ("linear",  26, 20),
        "linkedin_scale": 0.88,
    },

    # ── Cloud ──────────────────────────────────────────────────────────────────
    "aws": {
        "base":           ("linear",  60, 66),
        "lk_ratio":       0.55,
        "lag":            3,
        "lk_override":    ("linear",  28, 42),
        "linkedin_scale": 1.15,
    },
    "azure": {
        "base":           ("linear",  46, 54),
        "lk_ratio":       0.65,
        "lag":            3,
        "lk_override":    ("linear",  26, 36),
        "linkedin_scale": 1.10,
    },
    "google cloud": {
        "base":           ("linear",  33, 40),
        "lk_ratio":       0.52,
        "lag":            3,
        "lk_override":    ("linear",  16, 22),
        "linkedin_scale": 1.05,
    },
    "docker": {
        "base":           ("linear",  54, 58),
        "lk_ratio":       0.60,
        "lag":            2,
        "lk_override":    ("linear",  28, 40),
        "linkedin_scale": 1.10,
    },
    "kubernetes": {
        "base":           ("linear",  36, 42),
        "lk_ratio":       0.50,
        "lag":            3,
        "lk_override":    ("linear",  16, 24),
        "linkedin_scale": 1.12,
    },
    "terraform": {
        "base":           ("linear",  26, 34),
        "lk_ratio":       0.46,
        "lag":            3,
        "lk_override":    ("linear",  11, 16),
        "linkedin_scale": 1.08,
    },

    # ── Databases ──────────────────────────────────────────────────────────────
    "postgresql": {
        "base":           ("linear",  36, 44),
        "lk_ratio":       0.68,
        "lag":            3,
        "lk_override":    ("linear",  26, 34),
        "linkedin_scale": 1.05,
    },
    "mysql": {
        "base":           ("linear",  38, 32),
        "lk_ratio":       1.05,
        "lag":            2,
        "lk_override":    ("linear",  48, 42),
        "linkedin_scale": 0.98,
    },
    "mongodb": {
        "base":           ("linear",  34, 28),
        "lk_ratio":       0.85,
        "lag":            2,
        "lk_override":    ("linear",  30, 26),
        "linkedin_scale": 0.95,
    },
    "redis": {
        "base":           ("linear",  24, 28),
        "lk_ratio":       0.65,
        "lag":            3,
        "lk_override":    ("linear",  17, 20),
        "linkedin_scale": 1.02,
    },
    "elasticsearch": {
        "base":           ("linear",  20, 22),
        "lk_ratio":       0.62,
        "lag":            3,
        "lk_override":    ("linear",  13, 15),
        "linkedin_scale": 1.00,
    },

    # ── Data & ML ──────────────────────────────────────────────────────────────
    "machine learning": {
        "base":           ("linear",  42, 68),      # strong rise
        "lk_ratio":       0.50,
        "lag":            3,
        "lk_override":    ("linear",  20, 38),
        "linkedin_scale": 1.20,
    },
    "deep learning": {
        "base":           ("linear",  28, 48),
        "lk_ratio":       0.48,
        "lag":            3,
        "lk_override":    ("linear",  13, 24),
        "linkedin_scale": 1.15,
    },
    "data science": {
        "base":           ("linear",  40, 54),
        "lk_ratio":       0.55,
        "lag":            3,
        "lk_override":    ("linear",  22, 32),
        "linkedin_scale": 1.12,
    },
    "data engineering": {
        "base":           ("linear",  28, 44),
        "lk_ratio":       0.52,
        "lag":            3,
        "lk_override":    ("linear",  14, 24),
        "linkedin_scale": 1.15,
    },
    "tensorflow": {
        "base":           ("linear",  30, 26),      # losing to PyTorch
        "lk_ratio":       0.60,
        "lag":            3,
        "lk_override":    ("linear",  19, 17),
        "linkedin_scale": 1.00,
    },
    "pytorch": {
        "base":           ("linear",  26, 48),      # rising (research + prod)
        "lk_ratio":       0.48,
        "lag":            3,
        "lk_override":    ("linear",  12, 24),
        "linkedin_scale": 1.15,
    },
    "scikit-learn": {
        "base":           ("linear",  20, 25),
        "lk_ratio":       0.55,
        "lag":            3,
        "lk_override":    ("linear",  11, 14),
        "linkedin_scale": 1.00,
    },
    "llm": {
        "base":           ("sigmoid_rise", 8, 72),  # explosive rise
        "lk_ratio":       0.38,
        "lag":            3,
        "lk_override":    ("sigmoid_rise", 4, 32),
        "linkedin_scale": 1.30,
    },
    "langchain": {
        "base":           ("sigmoid_rise", 5, 52),  # explosive rise
        "lk_ratio":       0.36,
        "lag":            3,
        "lk_override":    ("sigmoid_rise", 3, 22),
        "linkedin_scale": 1.25,
    },

    # ── Mobile ─────────────────────────────────────────────────────────────────
    "flutter": {
        "base":           ("linear",  28, 36),
        "lk_ratio":       1.00,
        "lag":            2,
        "lk_override":    ("linear",  36, 48),  # very popular in LK
        "linkedin_scale": 1.00,
    },
    "react native": {
        "base":           ("linear",  30, 24),
        "lk_ratio":       0.88,
        "lag":            2,
        "lk_override":    ("linear",  27, 22),
        "linkedin_scale": 0.95,
    },
    "android": {
        "base":           ("linear",  34, 28),
        "lk_ratio":       0.98,
        "lag":            2,
        "lk_override":    ("linear",  36, 32),
        "linkedin_scale": 0.95,
    },
    "ios": {
        "base":           ("linear",  26, 20),
        "lk_ratio":       0.62,
        "lag":            2,
        "lk_override":    ("linear",  18, 15),
        "linkedin_scale": 0.95,
    },

    # ── Other ──────────────────────────────────────────────────────────────────
    "devops": {
        "base":           ("linear",  40, 50),
        "lk_ratio":       0.70,
        "lag":            3,
        "lk_override":    ("linear",  26, 36),
        "linkedin_scale": 1.10,
    },
    "cybersecurity": {
        "base":           ("linear",  35, 50),
        "lk_ratio":       0.65,
        "lag":            2,
        "lk_override":    ("linear",  22, 34),
        "linkedin_scale": 1.12,
    },
    "blockchain": {
        "base":           ("bump_then_fall", 28, 42, 16),  # hype peaked
        "lk_ratio":       0.72,
        "lag":            2,
        "lk_override":    ("bump_then_fall", 20, 32, 12),
        "linkedin_scale": 0.88,
    },
    "microservices": {
        "base":           ("linear",  24, 30),
        "lk_ratio":       0.65,
        "lag":            3,
        "lk_override":    ("linear",  16, 22),
        "linkedin_scale": 1.05,
    },
    "agile": {
        "base":           ("linear",  32, 28),
        "lk_ratio":       1.08,
        "lag":            2,
        "lk_override":    ("linear",  36, 34),
        "linkedin_scale": 1.00,
    },
}


# ── Trend shape builder ───────────────────────────────────────────────────────

def build_base_series(spec):
    shape = spec[0]
    if shape == "linear":
        _, s, e = spec
        return linear(s, e, N)
    elif shape == "sigmoid_rise":
        _, s, e = spec
        return sigmoid_rise(s, e, N)
    elif shape == "bump_then_fall":
        _, s, peak, e = spec
        return bump_then_fall(s, peak, e, N)
    else:
        return np.full(N, spec[1])


def build_lagged_series(global_series, lag, ratio, override_spec=None, noise_std=3.5):
    if override_spec:
        base = build_base_series(override_spec)
        return noisy(base, std=noise_std)
    lagged         = np.roll(global_series, lag)
    lagged[:lag]   = global_series[:lag] * ratio
    local          = np.clip(lagged * ratio, 2, 100)
    return noisy(local, std=noise_std)


# ── Source generators ─────────────────────────────────────────────────────────

def gen_google_trends_global():
    rows = []
    for skill, cfg in SKILL_DEFS.items():
        base   = noisy(build_base_series(cfg["base"]), std=4.0)
        for i, w in enumerate(WEEKS):
            v = float(base[i])
            if v >= 2:
                rows.append({"week": w, "skill": skill, "trend_index": round(v, 1),
                              "source": "google_trends_global"})
    return pd.DataFrame(rows)


def gen_linkedin_jobs():
    """
    LinkedIn job posting density. Correlated with google_trends_global
    but with its own noise, slight upward bias for hot skills,
    and scaled by linkedin_scale factor.
    """
    rows = []
    for skill, cfg in SKILL_DEFS.items():
        base  = build_base_series(cfg["base"])
        scale = cfg.get("linkedin_scale", 1.0)
        # Add independent noise, different from trends
        np.random.seed(hash(skill + "li") % (2**32))
        li_series = noisy(np.clip(base * scale, 2, 100), std=3.0)
        for i, w in enumerate(WEEKS):
            v = float(li_series[i])
            if v >= 2:
                rows.append({"week": w, "skill": skill, "trend_index": round(v, 1),
                              "source": "linkedin_jobs"})
    np.random.seed(42)
    return pd.DataFrame(rows)


def gen_google_trends_lk():
    rows = []
    for skill, cfg in SKILL_DEFS.items():
        global_base = build_base_series(cfg["base"])
        global_noisy = noisy(global_base, std=4.0)
        lk = build_lagged_series(
            global_noisy,
            cfg["lag"],
            cfg["lk_ratio"],
            cfg.get("lk_override"),
            noise_std=3.5,
        )
        for i, w in enumerate(WEEKS):
            v = float(lk[i])
            if v >= 2:
                rows.append({"week": w, "skill": skill, "trend_index": round(v, 1),
                              "source": "google_trends_lk"})
    return pd.DataFrame(rows)


def gen_topjobs_lk():
    """
    TopJobs.lk posting density. Correlated with google_trends_lk but
    with enterprise bias (Java, .NET higher) and independent noise.
    Lags the LK trend by an additional 1-2 weeks.
    """
    rows = []
    enterprise_boost = {"java": 1.20, "csharp": 1.25, "dotnet": 1.25,
                        "spring": 1.15, "angular": 1.10, "mysql": 1.15}
    for skill, cfg in SKILL_DEFS.items():
        global_base   = build_base_series(cfg["base"])
        global_noisy  = noisy(global_base, std=4.0)
        lk_series     = build_lagged_series(
            global_noisy, cfg["lag"], cfg["lk_ratio"],
            cfg.get("lk_override"), noise_std=3.5,
        )
        boost = enterprise_boost.get(skill, 1.0)
        # Extra 1-week lag on top of LK lag
        np.random.seed(hash(skill + "tj") % (2**32))
        tj_base   = np.roll(lk_series, 1)
        tj_base[0]= lk_series[0]
        tj        = noisy(np.clip(tj_base * boost, 2, 100), std=3.0)
        for i, w in enumerate(WEEKS):
            v = float(tj[i])
            if v >= 2:
                rows.append({"week": w, "skill": skill, "trend_index": round(v, 1),
                              "source": "topjobs_lk"})
    np.random.seed(42)
    return pd.DataFrame(rows)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("\n" + "=" * 58)
    print("  Multi-Source IT Skill Dataset Generator")
    print(f"  {N} weeks  |  {len(SKILL_DEFS)} skills  |  4 sources")
    print(f"  {WEEKS[0]}  to  {WEEKS[-1]}")
    print("=" * 58)

    generators = [
        ("Google Trends Global", "google_trends_global", gen_google_trends_global),
        ("LinkedIn Jobs",        "linkedin_jobs",        gen_linkedin_jobs),
        ("Google Trends LK",     "google_trends_lk",     gen_google_trends_lk),
        ("TopJobs.lk",           "topjobs_lk",           gen_topjobs_lk),
    ]

    totals = {}
    for label, src, fn in generators:
        print(f"\n  [{label}]")
        df = fn()
        path = OUT_DIR[src]
        df.to_csv(path, index=False)
        print(f"  Saved {len(df):,} rows -> {path}")
        print(f"  Skills: {df['skill'].nunique()}   Weeks: {df['week'].nunique()}")
        totals[src] = len(df)

    total_rows = sum(totals.values())
    print(f"\n  Total rows across all sources: {total_rows:,}")

    # Sanity-check — show Python and LLM across sources
    print("\n  Sample: Python trend_index across sources (last 4 weeks)")
    for src, fn in [("google_trends_global", gen_google_trends_global),
                    ("google_trends_lk",     gen_google_trends_lk)]:
        df = pd.read_csv(OUT_DIR[src])
        s  = df[df["skill"] == "python"].tail(4)[["week", "trend_index"]]
        print(f"    {src}: {s['trend_index'].tolist()}")

    print("\n  Sample: LLM trend_index (first 6 / last 6 weeks, global)")
    df  = pd.read_csv(OUT_DIR["google_trends_global"])
    llm = df[df["skill"] == "llm"].sort_values("week")
    print("  First 6:", llm["trend_index"].head(6).tolist())
    print("  Last  6:", llm["trend_index"].tail(6).tolist())

    print("\n  Done. Next step:")
    print("    python scraping/build_trends_dataset.py")
    print("    python train.py --skip-dataset")


if __name__ == "__main__":
    main()
