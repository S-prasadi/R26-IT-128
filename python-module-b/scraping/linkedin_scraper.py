"""
LinkedIn Public Profile Scraper — Component 2: Career Pathway Predictor
Target: Sri Lankan IT professionals' public profiles
Output: data/raw/linkedin_profiles/<profile_id>.json

ETHICS NOTE: Only scrapes publicly visible profiles. Respects rate limits.
For academic research (R26-IT-128) at SLIIT.
"""

import time
import json
import random
import logging
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Optional

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import NoSuchElementException, TimeoutException

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

OUTPUT_DIR = Path(__file__).parent.parent / "data" / "raw" / "linkedin_profiles"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Sri Lankan IT search queries — target professionals, not job listings
SEARCH_QUERIES = [
    "Software Engineer Sri Lanka",
    "Full Stack Developer Sri Lanka",
    "Data Scientist Sri Lanka",
    "DevOps Engineer Sri Lanka",
    "Mobile Developer Sri Lanka",
    "QA Engineer Sri Lanka",
    "Business Analyst Sri Lanka",
    "Cloud Engineer Sri Lanka",
    "UI UX Designer Sri Lanka",
    "Machine Learning Engineer Sri Lanka",
]

# Common Sri Lankan IT role titles for filtering irrelevant profiles
IT_ROLE_KEYWORDS = {
    "software", "developer", "engineer", "data", "analyst", "devops",
    "cloud", "mobile", "frontend", "backend", "fullstack", "qa", "testing",
    "machine learning", "ai", "ml", "cyber", "security", "architect",
    "scrum", "agile", "product", "ui", "ux", "designer", "web",
}


@dataclass
class CareerEntry:
    title: str
    company: str
    duration: str          # e.g. "Jan 2020 – Mar 2022 · 2 yrs 2 mos"
    start_year: Optional[int]
    end_year: Optional[int]  # None = current role
    description: str
    skills_mentioned: list[str]


@dataclass
class LinkedInProfile:
    profile_id: str
    name: str
    headline: str
    location: str
    career_history: list[CareerEntry]
    listed_skills: list[str]


def build_driver(headless: bool = False) -> webdriver.Chrome:
    opts = Options()
    if headless:
        opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    # Reduce bot detection signals
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.add_argument(
        "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
    return webdriver.Chrome(options=opts)


def human_delay(min_sec: float = 2.0, max_sec: float = 5.0):
    time.sleep(random.uniform(min_sec, max_sec))


def extract_year(text: str) -> Optional[int]:
    import re
    m = re.search(r"\b(20\d{2}|19\d{2})\b", text)
    return int(m.group()) if m else None


def extract_skills_from_text(text: str) -> list[str]:
    """Simple keyword match against a known IT skills vocabulary."""
    SKILLS_VOCAB = {
        "python", "java", "javascript", "typescript", "react", "angular", "vue",
        "node.js", "nodejs", "spring", "django", "flask", "fastapi", ".net", "c#",
        "c++", "go", "golang", "rust", "kotlin", "swift", "flutter", "dart",
        "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ansible",
        "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "kafka",
        "git", "jenkins", "github actions", "ci/cd", "linux", "bash",
        "machine learning", "deep learning", "tensorflow", "pytorch", "scikit-learn",
        "pandas", "numpy", "spark", "hadoop", "sql", "r", "tableau", "power bi",
        "agile", "scrum", "jira", "figma", "adobe xd",
    }
    text_lower = text.lower()
    return sorted({s for s in SKILLS_VOCAB if s in text_lower})


def parse_experience_section(driver: webdriver.Chrome) -> list[CareerEntry]:
    entries = []
    try:
        exp_section = driver.find_element(By.ID, "experience")
        items = exp_section.find_elements(By.CSS_SELECTOR, "li.artdeco-list__item")
    except NoSuchElementException:
        return entries

    for item in items:
        try:
            title = item.find_element(By.CSS_SELECTOR, "span[aria-hidden='true']").text.strip()
            company = ""
            duration = ""
            description = ""

            spans = item.find_elements(By.CSS_SELECTOR, "span.t-14")
            if len(spans) >= 1:
                company = spans[0].text.strip()
            if len(spans) >= 2:
                duration = spans[1].text.strip()

            try:
                description = item.find_element(
                    By.CSS_SELECTOR, "div.display-flex span[aria-hidden='true']"
                ).text.strip()
            except NoSuchElementException:
                pass

            if not any(kw in title.lower() for kw in IT_ROLE_KEYWORDS):
                continue

            entries.append(CareerEntry(
                title=title,
                company=company,
                duration=duration,
                start_year=extract_year(duration.split("–")[0]) if "–" in duration else None,
                end_year=extract_year(duration.split("–")[1]) if "–" in duration else None,
                description=description,
                skills_mentioned=extract_skills_from_text(title + " " + description),
            ))
        except Exception:
            continue

    return entries


def parse_skills_section(driver: webdriver.Chrome) -> list[str]:
    skills = []
    try:
        skills_section = driver.find_element(By.ID, "skills")
        items = skills_section.find_elements(By.CSS_SELECTOR, "span[aria-hidden='true']")
        skills = [i.text.strip() for i in items if i.text.strip()]
    except NoSuchElementException:
        pass
    return skills


def scrape_profile(driver: webdriver.Chrome, profile_url: str) -> Optional[LinkedInProfile]:
    profile_id = profile_url.rstrip("/").split("/")[-1]
    out_file = OUTPUT_DIR / f"{profile_id}.json"
    if out_file.exists():
        log.info("Already scraped: %s — skipping", profile_id)
        return None

    log.info("Scraping: %s", profile_url)
    driver.get(profile_url)
    human_delay(3, 6)

    try:
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "h1"))
        )
    except TimeoutException:
        log.warning("Page did not load in time: %s", profile_url)
        return None

    try:
        name = driver.find_element(By.CSS_SELECTOR, "h1").text.strip()
        headline = driver.find_element(By.CSS_SELECTOR, "div.text-body-medium").text.strip()
        location = ""
        try:
            location = driver.find_element(
                By.CSS_SELECTOR, "span.text-body-small.inline.t-black--light"
            ).text.strip()
        except NoSuchElementException:
            pass
    except NoSuchElementException:
        log.warning("Could not parse basic info: %s", profile_url)
        return None

    if "Sri Lanka" not in location and "Colombo" not in location:
        log.info("Skipping non-Sri Lankan profile: %s", profile_id)
        return None

    career_history = parse_experience_section(driver)
    listed_skills = parse_skills_section(driver)

    if len(career_history) < 2:
        log.info("Not enough career history (need ≥2 roles): %s", profile_id)
        return None

    profile = LinkedInProfile(
        profile_id=profile_id,
        name=name,
        headline=headline,
        location=location,
        career_history=career_history,
        listed_skills=listed_skills,
    )

    out_file.write_text(json.dumps(asdict(profile), indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("Saved: %s (%d roles)", profile_id, len(career_history))
    return profile


def load_profile_urls_from_file(path: str) -> list[str]:
    """
    Manual collection method: paste LinkedIn profile URLs into a text file,
    one URL per line. Run this scraper against that list.

    To collect URLs:
    1. Search LinkedIn: "Software Engineer" location:"Sri Lanka"
    2. Copy profile URLs from search results into profile_urls.txt
    3. Run this script
    """
    return [line.strip() for line in open(path) if line.strip().startswith("http")]


def main():
    import argparse
    parser = argparse.ArgumentParser(description="LinkedIn profile scraper for Component 2")
    default_urls_file = str(Path(__file__).parent / "profile_urls.txt")
    parser.add_argument("--urls-file", default=default_urls_file,
                        help="Text file with LinkedIn profile URLs, one per line")
    parser.add_argument("--headless", action="store_true")
    args = parser.parse_args()

    urls = load_profile_urls_from_file(args.urls_file)
    log.info("Loaded %d profile URLs", len(urls))

    driver = build_driver(headless=args.headless)
    scraped = 0
    try:
        for url in urls:
            result = scrape_profile(driver, url)
            if result:
                scraped += 1
            human_delay(4, 9)  # polite crawling
    finally:
        driver.quit()

    log.info("Done. Scraped %d new profiles. Total in output: %d files",
             scraped, len(list(OUTPUT_DIR.glob("*.json"))))


if __name__ == "__main__":
    main()
