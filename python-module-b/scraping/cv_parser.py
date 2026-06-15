"""
CV PDF Parser — Component 2: Career Pathway Predictor
Input:  data/raw/cv_submissions/*.pdf
Output: data/raw/cv_submissions/parsed/<filename>.json

Extracts career sequences from PDF CVs collected from:
  - SLIIT alumni voluntary submissions
  - Placement cell partnerships
  - Google Form uploads
"""

import re
import json
import logging
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Optional

import pdfplumber

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

CV_DIR = Path(__file__).parent.parent / "data" / "raw" / "cv_submissions"
PARSED_DIR = CV_DIR / "parsed"
PARSED_DIR.mkdir(parents=True, exist_ok=True)

SKILLS_VOCAB = {
    "python", "java", "javascript", "typescript", "react", "angular", "vue",
    "node.js", "nodejs", "spring", "django", "flask", "fastapi", ".net", "c#",
    "c++", "go", "golang", "rust", "kotlin", "swift", "flutter", "dart",
    "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "ansible",
    "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "kafka",
    "git", "jenkins", "github actions", "ci/cd", "linux", "bash",
    "machine learning", "deep learning", "tensorflow", "pytorch", "scikit-learn",
    "pandas", "numpy", "spark", "hadoop", "sql", "r", "tableau", "power bi",
    "agile", "scrum", "jira", "figma", "adobe xd", "selenium", "rest api",
    "graphql", "microservices", "devops", "nlp", "opencv", "firebase",
}

EXPERIENCE_HEADERS = re.compile(
    r"(experience|employment|work history|career|positions? held)",
    re.IGNORECASE,
)

SKILLS_HEADERS = re.compile(
    r"(skills?|technical skills?|core competencies|technologies)",
    re.IGNORECASE,
)

YEAR_RANGE = re.compile(
    r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?\s*"
    r"(20\d{2}|19\d{2})\s*[-–—to]+\s*"
    r"(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?\s*(20\d{2}|19\d{2})|present|current|now)",
    re.IGNORECASE,
)

IT_TITLES = re.compile(
    r"(engineer|developer|analyst|designer|architect|manager|consultant|"
    r"intern|trainee|lead|scientist|devops|qa|tester|administrator|specialist)",
    re.IGNORECASE,
)


@dataclass
class CVRole:
    title: str
    company: str
    start_year: Optional[int]
    end_year: Optional[int]  # None = current
    skills: list[str]
    raw_text: str


@dataclass
class ParsedCV:
    source_file: str
    roles: list[CVRole]
    global_skills: list[str]   # from skills section


def extract_year(text: str) -> Optional[int]:
    m = re.search(r"\b(20\d{2}|19\d{2})\b", text)
    return int(m.group()) if m else None


def is_current(text: str) -> bool:
    return bool(re.search(r"\b(present|current|now)\b", text, re.IGNORECASE))


def extract_skills(text: str) -> list[str]:
    text_lower = text.lower()
    return sorted({s for s in SKILLS_VOCAB if s in text_lower})


def split_into_sections(text: str) -> dict[str, str]:
    """
    Split raw CV text into sections based on common header patterns.
    Returns a dict: section_name → section_content
    """
    section_headers = re.compile(
        r"\n([A-Z][A-Z\s&/]+)\n",
    )
    sections: dict[str, str] = {}
    parts = section_headers.split(text)

    current_section = "header"
    for part in parts:
        if section_headers.match("\n" + part + "\n"):
            current_section = part.strip().lower()
        else:
            sections[current_section] = part.strip()

    return sections


def parse_experience_block(block: str) -> list[CVRole]:
    """
    Parse an experience block into individual roles.
    Heuristic: each role starts with a year range or a job title line.
    """
    roles = []
    lines = [l.strip() for l in block.splitlines() if l.strip()]

    i = 0
    while i < len(lines):
        line = lines[i]
        year_match = YEAR_RANGE.search(line)
        title_match = IT_TITLES.search(line)

        if year_match or title_match:
            title = line if title_match else (lines[i + 1] if i + 1 < len(lines) else "")
            duration_line = line if year_match else (lines[i + 1] if i + 1 < len(lines) else "")
            company = ""

            # Collect subsequent lines as role context (up to next year-range marker)
            role_lines = [line]
            j = i + 1
            while j < len(lines) and not YEAR_RANGE.search(lines[j]) and j - i < 8:
                role_lines.append(lines[j])
                if not company and len(lines[j]) < 60:
                    company = lines[j]
                j += 1

            raw = " ".join(role_lines)
            dm = YEAR_RANGE.search(raw)
            start_year = end_year = None

            if dm:
                years = re.findall(r"\b(20\d{2}|19\d{2})\b", dm.group())
                if years:
                    start_year = int(years[0])
                if len(years) > 1:
                    end_year = int(years[1])
                elif is_current(dm.group()):
                    end_year = None  # current role

            if IT_TITLES.search(title):
                roles.append(CVRole(
                    title=title[:80],
                    company=company[:80],
                    start_year=start_year,
                    end_year=end_year,
                    skills=extract_skills(raw),
                    raw_text=raw[:300],
                ))
            i = j
        else:
            i += 1

    return roles


def parse_cv(pdf_path: Path) -> Optional[ParsedCV]:
    out_file = PARSED_DIR / (pdf_path.stem + ".json")
    if out_file.exists():
        log.info("Already parsed: %s — skipping", pdf_path.name)
        return None

    log.info("Parsing: %s", pdf_path.name)
    try:
        with pdfplumber.open(pdf_path) as pdf:
            full_text = "\n".join(
                page.extract_text() or "" for page in pdf.pages
            )
    except Exception as e:
        log.error("Failed to open %s: %s", pdf_path.name, e)
        return None

    if not full_text.strip():
        log.warning("Empty text extracted from %s", pdf_path.name)
        return None

    sections = split_into_sections(full_text)

    # Find experience section
    exp_block = ""
    for key, val in sections.items():
        if EXPERIENCE_HEADERS.search(key):
            exp_block = val
            break

    # Find skills section
    skills_block = ""
    for key, val in sections.items():
        if SKILLS_HEADERS.search(key):
            skills_block = val
            break

    roles = parse_experience_block(exp_block or full_text)
    global_skills = extract_skills(skills_block or full_text)

    if len(roles) < 2:
        log.info("Insufficient roles in %s (found %d, need ≥2)", pdf_path.name, len(roles))

    result = ParsedCV(
        source_file=pdf_path.name,
        roles=sorted(roles, key=lambda r: r.start_year or 0),
        global_skills=global_skills,
    )
    out_file.write_text(json.dumps(asdict(result), indent=2, ensure_ascii=False), encoding="utf-8")
    log.info("Saved: %s (%d roles)", pdf_path.name, len(roles))
    return result


def main():
    pdf_files = list(CV_DIR.glob("*.pdf"))
    log.info("Found %d CV PDFs to parse", len(pdf_files))

    parsed_count = 0
    for pdf_path in pdf_files:
        result = parse_cv(pdf_path)
        if result and len(result.roles) >= 2:
            parsed_count += 1

    log.info("Done. %d CVs with usable career sequences. Output: %s", parsed_count, PARSED_DIR)


if __name__ == "__main__":
    main()
