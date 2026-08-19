"""
Scrapes IT job postings from topjobs.lk and produces a CSV with the same
columns as `cleaned_job_posts_dataset.csv` (the file CV_Job_Model (3).ipynb
expects as its job-posts input), so the output of this script can be used
directly in place of, or merged with, the original dataset.

topjobs.lk lists title/company/location/dates as plain HTML, but the actual
job description is a designed image per posting (not text). So for each
listing this script: reads the plain-text fields directly, downloads the
posting's image, runs OCR on it (EasyOCR, CPU), cleans the OCR text, then
runs the OCR text through this project's own extract_skills_from_text().

Politeness / etiquette:
- Fixed delay between every HTTP request (see REQUEST_DELAY_SECONDS).
- A descriptive User-Agent identifying this as a research script — put your
  real contact email in HEADERS below before running at any real volume.
- Every downloaded image and every OCR result is cached to disk, so re-runs
  (e.g. raising --limit-per-category later) never repeat work already done.
- No robots.txt or Terms of Service was found explicitly forbidding this at
  the time this script was written — re-check before scraping at scale, and
  keep volumes modest (this was written for an academic dataset, not resale).

Usage:
    cd python-module-c/backend/scraping
    pip install -r requirements.txt        # see note in requirements.txt
    python scrape_topjobs.py --limit-per-category 50 --out job_posts_raw.csv

First run downloads EasyOCR's model weights (a few hundred MB, one-time).
"""

import argparse
import csv
import html
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from utils.cv_parser import extract_skills_from_text  # noqa: E402
from utils.scoring import clean_text  # noqa: E402


BASE_URL = "https://www.topjobs.lk"
LISTING_URL = BASE_URL + "/applicant/vacancybyfunctionalarea.jsp"
DETAIL_URL = BASE_URL + "/employer/JobAdvertismentServlet"

# IT-relevant functional-area codes on topjobs.lk (found by reading the
# category dropdown on the listing page). Add more codes here if you find
# other IT-adjacent categories.
FUNCTIONAL_AREAS = {
    "SDQ": "IT-Software/DB/QA/Web/Graphics/GIS",
    "HNS": "IT-Hardware/Networks/Systems",
    "ITT": "IT-Telecoms",
}

REQUEST_DELAY_SECONDS = 2.0
REQUEST_TIMEOUT = 20
MAX_RETRIES = 3

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; PathwayIQ-ResearchBot/1.0; "
        "academic CV-job-matching research project; "
        "contact: REPLACE_WITH_YOUR_EMAIL@example.com)"
    )
}

CSV_COLUMNS = [
    "id", "title", "company", "tags", "description", "cleaned_description",
    "extracted_skills", "description_word_count", "title_word_count",
    "post_date", "week", "scraped_at", "target_role",
]

# First matching phrase wins, so more specific roles are listed first.
ROLE_KEYWORDS = [
    ("Data Scientist", ["data scientist"]),
    ("Data Analyst", ["data analyst", "data analysis"]),
    ("Data Engineer", ["data engineer", "etl developer"]),
    ("Machine Learning Engineer", ["machine learning engineer", "ml engineer"]),
    ("AI Engineer", ["ai engineer", "artificial intelligence engineer"]),
    ("AI ML", ["ai/ml", "computer vision engineer"]),
    ("DevOps Engineer", ["devops"]),
    ("Cloud Engineer", ["cloud engineer", "cloud architect"]),
    ("Security Engineer", ["security engineer", "cyber security", "penetration test"]),
    ("System Administrator", ["system administrator", "systems administrator", "sysadmin"]),
    ("QA Engineer", ["qa engineer", "quality assurance engineer", "test engineer"]),
    ("UI/UX Designer", ["ui/ux", "ui designer", "ux designer", "product designer"]),
    ("Mobile Developer", ["mobile developer", "android developer", "ios developer", "flutter developer", "react native developer"]),
    ("Full Stack Developer", ["full stack", "fullstack"]),
    ("Frontend Developer", ["frontend", "front-end", "front end developer"]),
    ("Backend Developer", ["backend", "back-end", "back end developer"]),
    ("Web Developer", ["web developer"]),
    ("Business Analyst", ["business analyst"]),
    ("Product Manager", ["product manager", "product owner"]),
    ("Software Engineer", ["software engineer"]),
    ("Software Developer", ["software developer", "application developer", "programmer", ".net developer", "java developer", "php developer"]),
    # Generic catch-alls, checked last: a specific match above (frontend,
    # mobile, data, ...) always wins over these for titles like "Odoo
    # Developer" or "Network Support Engineer" that don't fit elsewhere.
    ("Software Developer", ["developer"]),
    ("Software Engineer", ["engineer"]),
]


def classify_target_role(title):
    """Returns a role name, or None if the title doesn't look like an IT
    role at all — topjobs.lk's own categories mix in non-IT postings
    (graphic design, printing, packaging, ...), so unmatched titles are
    deliberately dropped rather than defaulted to any one role."""
    lowered = title.lower()
    for role, keywords in ROLE_KEYWORDS:
        if any(keyword in lowered for keyword in keywords):
            return role
    return None


def polite_get(session, url, **kwargs):
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = session.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT, **kwargs)
            response.raise_for_status()
            time.sleep(REQUEST_DELAY_SECONDS)
            return response
        except requests.RequestException as error:
            if attempt == MAX_RETRIES:
                raise
            wait_seconds = REQUEST_DELAY_SECONDS * attempt * 2
            print(f"    request failed ({error}) — retry {attempt}/{MAX_RETRIES} in {wait_seconds:.0f}s")
            time.sleep(wait_seconds)


def parse_listing_page(html):
    soup = BeautifulSoup(html, "html.parser")
    rows = []

    for row in soup.select("tr[onclick^='createAlert']"):
        onclick = row["onclick"]
        match = re.search(
            r"createAlert\('(\d+)','([^']*)','([^']*)','([^']*)'", onclick
        )
        if not match:
            continue
        rid, ac, jc, ec = match.groups()

        cells = row.find_all("td")
        if len(cells) < 6:
            continue

        job_ref_no = clean_text(cells[1].get_text())
        title_el = cells[2].find("h2")
        company_el = cells[2].find("h1")
        title = clean_text(title_el.get_text()) if title_el else ""
        company = clean_text(company_el.get_text()) if company_el else ""
        open_date_text = clean_text(cells[4].get_text())
        close_date_text = clean_text(cells[5].get_text())
        town = clean_text(cells[6].get_text()) if len(cells) > 6 else ""

        if not title or not jc:
            continue

        rows.append({
            "rid": rid, "ac": ac, "jc": jc, "ec": ec,
            "job_ref_no": job_ref_no, "title": title, "company": company,
            "open_date_text": open_date_text, "close_date_text": close_date_text,
            "town": town,
        })

    return rows


def fetch_ad_image_url(session, row):
    params = {
        "rid": row["rid"], "ac": row["ac"], "jc": row["jc"], "ec": row["ec"],
        "pg": "applicant/vacancybyfunctionalarea.jsp",
    }
    response = polite_get(session, DETAIL_URL, params=params)
    # The detail page has two /logo/ images: a small company-branding logo
    # (e.g. /logo/0000000015_small.jpg — one path segment) and the actual ad
    # flyer (e.g. /logo/0000000015/738cManager.png — two segments). Requiring
    # the extra "/" picks out the ad, not the branding logo.
    match = re.search(r'src="(/logo/[^"/]+/[^"]+\.(?:png|jpg|jpeg))"', response.text)
    # Filenames can contain characters HTML-escaped in the source (e.g. an
    # "&" in the ad's filename comes through as "&amp;") — unescape before
    # building the request URL, or the raw "&amp;" 404s.
    return BASE_URL + html.unescape(match.group(1)) if match else None


def parse_post_date(date_text):
    # e.g. "Sun Aug 16 2026"
    try:
        return datetime.strptime(date_text, "%a %b %d %Y")
    except ValueError:
        return None


class OcrCache:
    """Caches downloaded images and their OCR text on disk, keyed by job code,
    so re-running the scraper never re-downloads or re-OCRs a posting."""

    def __init__(self, cache_dir):
        self.cache_dir = cache_dir
        self.images_dir = os.path.join(cache_dir, "images")
        self.text_path = os.path.join(cache_dir, "ocr_text.json")
        os.makedirs(self.images_dir, exist_ok=True)
        self._reader = None

        if os.path.exists(self.text_path):
            with open(self.text_path, "r", encoding="utf-8") as file:
                self._text_cache = json.load(file)
        else:
            self._text_cache = {}

    def _save_cache(self):
        with open(self.text_path, "w", encoding="utf-8") as file:
            json.dump(self._text_cache, file, indent=2, ensure_ascii=False)

    def _get_reader(self):
        if self._reader is None:
            import easyocr
            print("  loading EasyOCR model (first run downloads weights)...")
            self._reader = easyocr.Reader(["en"], gpu=False)
        return self._reader

    def get_text(self, job_code, image_url, session):
        if job_code in self._text_cache:
            return self._text_cache[job_code]

        if not image_url:
            self._text_cache[job_code] = ""
            self._save_cache()
            return ""

        image_path = os.path.join(self.images_dir, job_code + os.path.splitext(image_url)[1])

        if not os.path.exists(image_path):
            response = polite_get(session, image_url)
            with open(image_path, "wb") as file:
                file.write(response.content)

        reader = self._get_reader()
        text_lines = reader.readtext(image_path, detail=0, paragraph=True)
        text = " ".join(text_lines)

        self._text_cache[job_code] = text
        self._save_cache()
        return text


def load_existing_ids(out_path):
    if not os.path.exists(out_path):
        return set()
    with open(out_path, "r", encoding="utf-8", newline="") as file:
        return {row["id"] for row in csv.DictReader(file)}


def scrape(categories, limit_per_category, out_path, cache_dir):
    session = requests.Session()
    cache = OcrCache(cache_dir)
    existing_ids = load_existing_ids(out_path)
    write_header = not os.path.exists(out_path) or os.path.getsize(out_path) == 0
    scraped_at = datetime.now(timezone.utc).isoformat()

    with open(out_path, "a", encoding="utf-8", newline="") as out_file:
        writer = csv.DictWriter(out_file, fieldnames=CSV_COLUMNS)
        if write_header:
            writer.writeheader()

        for code in categories:
            label = FUNCTIONAL_AREAS[code]
            print(f"\n=== {code} — {label} ===")

            response = polite_get(session, LISTING_URL, params={"FA": code})
            rows = parse_listing_page(response.text)
            print(f"  found {len(rows)} listings")

            kept, skipped_not_it, skipped_seen, skipped_failed = 0, 0, 0, 0

            for i, row in enumerate(rows, start=1):
                if kept >= limit_per_category:
                    break

                if row["jc"] in existing_ids:
                    skipped_seen += 1
                    continue

                # Classify (and possibly reject) before spending a network
                # request + OCR pass on a posting we'd discard anyway.
                target_role = classify_target_role(row["title"])
                if target_role is None:
                    print(f"  [{i}] {row['title'][:50]} — not an IT role, skipping")
                    skipped_not_it += 1
                    continue

                print(f"  [{i}] {row['title'][:50]} ({row['company'][:30]}) -> {target_role}")

                try:
                    image_url = fetch_ad_image_url(session, row)
                    ocr_text = cache.get_text(row["jc"], image_url, session)
                except requests.RequestException as error:
                    print(f"    failed, skipping this posting: {error}")
                    skipped_failed += 1
                    continue

                cleaned_description = clean_text(ocr_text)
                skills = extract_skills_from_text(cleaned_description)

                post_date = parse_post_date(row["open_date_text"])

                record = {
                    "id": row["jc"],
                    "title": row["title"],
                    "company": row["company"],
                    "tags": [],
                    "description": ocr_text,
                    "cleaned_description": cleaned_description,
                    "extracted_skills": skills,
                    "description_word_count": len(cleaned_description.split()),
                    "title_word_count": len(row["title"].split()),
                    "post_date": post_date.date().isoformat() if post_date else "",
                    "week": post_date.strftime("%Y-W%V") if post_date else "",
                    "scraped_at": scraped_at,
                    "target_role": target_role,
                }
                writer.writerow(record)
                out_file.flush()
                existing_ids.add(row["jc"])
                kept += 1

            print(
                f"  kept {kept}, skipped {skipped_not_it} non-IT titles, "
                f"skipped {skipped_seen} already scraped, "
                f"skipped {skipped_failed} on request failures"
            )

    print(f"\nDone. Output: {out_path}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--categories", nargs="+", default=list(FUNCTIONAL_AREAS.keys()),
        choices=list(FUNCTIONAL_AREAS.keys()),
        help="topjobs.lk functional-area codes to scrape",
    )
    parser.add_argument(
        "--limit-per-category", type=int, default=50,
        help="max listings to process per category (start small — OCR is slow)",
    )
    parser.add_argument("--out", default="job_posts_raw.csv", help="output CSV path")
    parser.add_argument("--cache-dir", default="cache", help="image/OCR cache directory")
    args = parser.parse_args()

    scrape(args.categories, args.limit_per_category, args.out, args.cache_dir)


if __name__ == "__main__":
    main()
