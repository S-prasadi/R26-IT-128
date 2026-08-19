"""
TopJobs.lk Real Data Scraper (Phase 3 pilot)
-----------------------------------------------
Scrapes the two IT job categories on TopJobs.lk (IT-Sware/DB/QA/Web/Graphics/GIS
and IT-HWare/Networks/Systems) and produces a weekly aggregate skill-mention
score per tracked skill -- never stores raw job titles, descriptions, or
company names, only the derived counts.

Legal/ethical check (done before writing this -- see the Phase 3 entry in
docs/skill-forecasting-improvement-plan.md): no robots.txt exists on
topjobs.lk, and their Terms & Conditions has no anti-scraping/anti-bot
clause -- only an IP-protection clause against reproducing their content.
This script stays on the safe side of that line by only ever persisting
derived statistics, never the underlying job text, and by identifying
itself honestly via User-Agent rather than impersonating a browser.

The whole scrape is exactly 2 HTTP GET requests: both IT categories render
their entire listing on a single page (confirmed live -- no pagination).

score = (number of *listings* mentioning the skill at least once) / (total
listings scanned) * 100 -- a percentage, landing in the same 0-100 range the
synthetic trend_index uses without needing several real weeks to calibrate
a rescaling first.

Output: data/raw/local/topjobs_lk_real.csv
  columns: week, skill, trend_index, source, provenance

Usage:
  python scraping/topjobs_scraper.py
  python scraping/topjobs_scraper.py --dry-run
"""

import os
import re
import sys
import time
import argparse
from datetime import datetime

import requests
import pandas as pd
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from generate_trends_dataset import SKILL_DEFS   # 57-skill tracked vocabulary
from train import SKILL_ALIASES                   # surface-text -> canonical name

BASE_URL   = "https://www.topjobs.lk/applicant/vacancybyfunctionalarea.jsp"
CATEGORIES = {
    "SDQ": "IT-Sware/DB/QA/Web/Graphics/GIS",
    "HNS": "IT-HWare/Networks/Systems",
}

USER_AGENT = (
    "SkillForecastResearchBot/1.0 "
    "(SLIIT R26-IT-128 academic project; weekly aggregate skill-count scrape; "
    "no content republished)"
)
REQUEST_TIMEOUT   = 15
DELAY_BETWEEN_REQ = 2.0

TRACKED_SKILLS = set(SKILL_DEFS.keys())
OUT_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "data", "raw", "local", "topjobs_lk_real.csv")
)


# ── Skill matching ──────────────────────────────────────────────────────────────

def word_boundary_pattern(phrase: str) -> re.Pattern:
    """Case-insensitive match for `phrase` as a standalone token/phrase, not a
    substring -- so 'go' doesn't match inside 'google', 'java' doesn't match
    inside 'javascript'. Shared with scraping/soft_skills.py so both use
    identical, once-proven matching semantics rather than two copies."""
    return re.compile(
        r"(?<![a-zA-Z0-9])" + re.escape(phrase) + r"(?![a-zA-Z0-9])",
        re.IGNORECASE,
    )


def build_skill_patterns() -> dict:
    """canonical skill -> list of compiled regexes (its name + any aliases that
    map to it)."""
    surface_to_canonical = {s: s for s in TRACKED_SKILLS}
    for alias, canonical in SKILL_ALIASES.items():
        if canonical in TRACKED_SKILLS:
            surface_to_canonical[alias] = canonical

    patterns = {}
    for surface, canonical in surface_to_canonical.items():
        patterns.setdefault(canonical, []).append(word_boundary_pattern(surface))
    return patterns


def skills_mentioned(text: str, patterns: dict) -> set:
    return {skill for skill, regexes in patterns.items() if any(r.search(text) for r in regexes)}


# ── Fetch & parse ────────────────────────────────────────────────────────────────

def fetch_category(code: str) -> str:
    resp = requests.get(
        BASE_URL, params={"FA": code},
        headers={"User-Agent": USER_AGENT},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.text


def fetch_full_description(job_ref: str) -> str:
    """STUBBED (Phase 5) -- not called anywhere in this pipeline.

    A live check (2026-08-17) found the category-page blurb is a placeholder
    ("Please refer the vacancy") for 84% of listings and a one-line tagline
    for the rest -- zero soft-skill signal either way. Real signal needs each
    posting's full description, which lives at the individual job page (URL
    pattern found during that same check: this category table's rows carry
    the job ref in an `onclick`/`hdnJC{row}` attribute, and the detail page
    is `employer/JobAdvertismentServlet?jc=<job_ref>&ac=...&ec=...&pg=...`).

    That means one HTTP request per listing instead of the 2 total the rest
    of this scraper uses -- roughly 270+ requests, not 2. That's a materially
    bigger footprint against TopJobs.lk than the conservative scraper this
    module was built as, so it needs its own explicit go-ahead rather than
    being silently switched on. See the Phase 5 entry in
    docs/skill-forecasting-improvement-plan.md.
    """
    raise NotImplementedError(
        "fetch_full_description() is intentionally stubbed -- see its docstring "
        "and docs/skill-forecasting-improvement-plan.md Phase 5 before implementing it."
    )


def parse_listings(html: str) -> list:
    """Returns a list of 'title + blurb' strings, one per listing. Used only
    in-memory for keyword matching -- never written to disk."""
    soup  = BeautifulSoup(html, "html.parser")
    table = soup.find("table", id="table")
    if table is None:
        return []

    texts = []
    for row in table.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) < 4:
            continue
        title_h2 = cells[2].find("h2")
        title    = title_h2.get_text(" ", strip=True) if title_h2 else ""
        blurb    = cells[3].get_text(" ", strip=True)
        combined = f"{title} {blurb}".strip()
        if combined:
            texts.append(combined)
    return texts


# ── Run ─────────────────────────────────────────────────────────────────────────

def run(dry_run: bool = False):
    print("=" * 55)
    print("  TopJobs.lk Real Data Scraper (Phase 3 pilot)")
    print("=" * 55)

    patterns  = build_skill_patterns()
    mentions  = {skill: 0 for skill in TRACKED_SKILLS}
    total     = 0
    codes     = list(CATEGORIES.items())

    for i, (code, label) in enumerate(codes):
        print(f"  Fetching [{code}] {label} ...")
        html     = fetch_category(code)
        listings = parse_listings(html)
        print(f"    {len(listings)} listings")

        for text in listings:
            for skill in skills_mentioned(text, patterns):
                mentions[skill] += 1
        total += len(listings)

        if i < len(codes) - 1:
            time.sleep(DELAY_BETWEEN_REQ)

    print(f"\n  Total listings scanned: {total}")
    if total == 0:
        print("  No listings found -- aborting without writing output.")
        return None

    week = datetime.now().strftime("%Y-W%W")
    rows = [
        {
            "week":        week,
            "skill":       skill,
            "trend_index": round(100 * count / total, 1),
            "source":      "topjobs_lk",
            "provenance":  "real",
        }
        for skill, count in mentions.items()
        if count > 0
    ]
    out = pd.DataFrame(rows).sort_values("trend_index", ascending=False)

    print(f"\n  Skills mentioned this week: {len(out)}/{len(TRACKED_SKILLS)} tracked skills")
    print(out.head(10).to_string(index=False))

    if dry_run:
        print("\n  [DRY RUN] Not writing to disk.")
        return out

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    if os.path.exists(OUT_PATH):
        existing = pd.read_csv(OUT_PATH)
        existing = existing[existing["week"] != week]   # replace this week's rows if re-run
        out = pd.concat([existing, out], ignore_index=True)
    out.to_csv(OUT_PATH, index=False)
    print(f"\n  -> {OUT_PATH}")

    return out


def main():
    parser = argparse.ArgumentParser(description="Scrape TopJobs.lk IT categories for weekly skill-mention counts")
    parser.add_argument("--dry-run", action="store_true", help="Scrape and print results without writing to disk")
    args = parser.parse_args()
    run(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
