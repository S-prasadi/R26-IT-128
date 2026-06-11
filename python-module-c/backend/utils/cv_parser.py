import os
import re
from datetime import datetime

from PyPDF2 import PdfReader
from docx import Document


SKILL_ALIASES = {
    # Data and BI
    "excel": [
        "excel", "microsoft excel", "ms excel"
    ],
    "power bi": [
        "power bi", "powerbi", "microsoft power bi"
    ],
    "google sheets": [
        "google sheets", "google sheet", "g sheets"
    ],
    "tableau": [
        "tableau"
    ],
    "sql": [
        "sql", "sql server", "mysql", "postgresql", "postgres", "sqlite",
        "database query", "queries"
    ],
    "mysql": [
        "mysql", "my sql"
    ],
    "mongodb": [
        "mongodb", "mongo db", "mongo"
    ],
    "data analysis": [
        "data analysis", "data analytics", "analytics", "analysis",
        "analytical", "analyze data", "analysing data", "analyzing data"
    ],
    "data visualization": [
        "data visualization", "data visualisation", "visualization",
        "visualisation", "visualized", "visualised", "data visuals",
        "charts", "graphs", "key visuals"
    ],
    "dashboard development": [
        "dashboard development", "dashboard", "dashboards",
        "interactive dashboard", "power bi dashboard", "report dashboard"
    ],
    "reporting": [
        "reporting", "reports", "structured reporting", "kpi reporting",
        "routine analysis", "ad hoc analysis", "summary reports"
    ],
    "data cleaning": [
        "data cleaning", "clean data", "cleaned data", "data preparation",
        "data preprocessing", "prepare data", "prepared datasets",
        "prepare clean"
    ],
    "data validation": [
        "data validation", "validation", "validated data", "trend checks",
        "data quality"
    ],
    "trend analysis": [
        "trend analysis", "trend checks", "trends", "seasonality",
        "historical demand patterns"
    ],
    "statistics": [
        "statistics", "statistical analysis", "statistical"
    ],
    "forecasting": [
        "forecasting", "forecast", "demand forecasting", "prediction",
        "predictive model", "predictive analytics"
    ],

    # Programming and ML
    "python": [
        "python", "python programming"
    ],
    "r": [
        "r programming", " r "
    ],
    "pandas": [
        "pandas"
    ],
    "numpy": [
        "numpy"
    ],
    "scikit-learn": [
        "scikit-learn", "scikit learn", "sklearn"
    ],
    "machine learning": [
        "machine learning", "ml", "ai/ml", "artificial intelligence",
        "predictive modeling", "predictive modelling"
    ],
    "deep learning": [
        "deep learning"
    ],
    "tensorflow": [
        "tensorflow", "tensor flow"
    ],
    "pytorch": [
        "pytorch", "py torch"
    ],
    "hugging face": [
        "hugging face", "huggingface"
    ],
    "prophet": [
        "prophet", "facebook prophet"
    ],
    "xgboost": [
        "xgboost", "xg boost"
    ],
    "nlp": [
        "nlp", "natural language processing"
    ],

    # Web and software
    "flask": [
        "flask"
    ],
    "django": [
        "django"
    ],
    "fastapi": [
        "fastapi", "fast api"
    ],
    "streamlit": [
        "streamlit"
    ],
    "react": [
        "react", "react.js", "reactjs", "react js"
    ],
    "nodejs": [
        "node.js", "nodejs", "node js"
    ],
    "javascript": [
        "javascript", "java script", "js"
    ],
    "typescript": [
        "typescript", "type script", "ts"
    ],
    "html": [
        "html", "html5"
    ],
    "css": [
        "css", "css3"
    ],
    "api integration": [
        "api integration", "api", "rest api", "restful api"
    ],

    # Cloud and tools
    "aws": [
        "aws", "amazon web services"
    ],
    "azure": [
        "azure", "microsoft azure"
    ],
    "gcp": [
        "gcp", "google cloud", "google cloud platform"
    ],
    "git": [
        "git", "github", "version control"
    ],
    "docker": [
        "docker", "containerization", "containerisation"
    ],
    "kubernetes": [
        "kubernetes", "k8s"
    ],
    "uipath": [
        "uipath", "uipath studio", "rpa", "robotic process automation"
    ],
    "jupyter notebook": [
        "jupyter notebook", "jupyter", "notebook"
    ],
    "postman": [
        "postman"
    ],

    # Soft skills
    "communication": [
        "communication", "communication skills", "communicate",
        "presenting clear findings", "clear written explanations",
        "written explanations", "public speaking"
    ],
    "attention to detail": [
        "attention to detail", "detail oriented", "detail-oriented",
        "accurate", "accuracy", "dependable"
    ],
    "problem solving": [
        "problem solving", "problem-solving", "investigate root causes",
        "root causes", "fixes", "troubleshooting"
    ],
    "analytical thinking": [
        "analytical thinking", "analytical", "data-driven insights",
        "insights", "decision-making", "decision making"
    ],
    "teamwork": [
        "teamwork", "team work", "team player", "collaboration"
    ],
    "leadership": [
        "leadership", "team leader", "people leadership"
    ],
    "time management": [
        "time management", "time-management"
    ]
}


SECTION_HEADERS = [
    "summary",
    "profile",
    "work experience",
    "experience",
    "professional experience",
    "employment history",
    "work history",
    "career history",
    "education",
    "academic background",
    "projects",
    "project experience",
    "technical skills",
    "skills",
    "certifications",
    "certificates",
    "licenses",
    "licences",
    "soft skills",
    "extra curricular activities",
    "extracurricular activities",
    "references"
]


def extract_text_from_pdf(file_path):
    text = ""

    reader = PdfReader(file_path)

    for page in reader.pages:
        page_text = page.extract_text()

        if page_text:
            text += page_text + "\n"

    return text


def extract_text_from_docx(file_path):
    document = Document(file_path)

    text = ""

    for paragraph in document.paragraphs:
        text += paragraph.text + "\n"

    return text


def extract_text_from_txt(file_path):
    with open(file_path, "r", encoding="utf-8", errors="ignore") as file:
        return file.read()


def extract_text_from_file(file_path):
    extension = os.path.splitext(file_path)[1].lower()

    if extension == ".pdf":
        return extract_text_from_pdf(file_path)

    if extension == ".docx":
        return extract_text_from_docx(file_path)

    if extension == ".txt":
        return extract_text_from_txt(file_path)

    return ""


def normalize_text(text):
    text = str(text).lower()

    text = text.replace("&", " and ")
    text = text.replace("/", " ")
    text = text.replace("\\", " ")
    text = text.replace("|", " ")
    text = text.replace("–", "-")
    text = text.replace("—", "-")
    text = text.replace("’", "'")

    text = re.sub(r"[^a-z0-9+#.\-\s]", " ", text)
    text = re.sub(r"\s+", " ", text)

    return text.strip()


def normalize_for_phrase(text):
    text = normalize_text(text)

    text = text.replace(".", " ")
    text = text.replace("-", " ")
    text = re.sub(r"\s+", " ", text)

    return text.strip()


def extract_skills_from_text(text):
    normalized_text = normalize_for_phrase(text)
    found_skills = []

    for canonical_skill, aliases in SKILL_ALIASES.items():
        for alias in aliases:
            alias_normalized = normalize_for_phrase(alias)

            pattern = r"\b" + re.escape(alias_normalized) + r"\b"

            if re.search(pattern, normalized_text):
                found_skills.append(canonical_skill)
                break

    return sorted(list(set(found_skills)))


def split_into_sections(text):
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    sections = {}
    current_section = "general"
    sections[current_section] = []

    for line in lines:
        normalized_line = normalize_for_phrase(line)

        matched_header = None

        for header in SECTION_HEADERS:
            if normalized_line == normalize_for_phrase(header):
                matched_header = header
                break

        if matched_header:
            current_section = matched_header
            sections[current_section] = []
        else:
            sections.setdefault(current_section, []).append(line)

    final_sections = {}

    for section_name, section_lines in sections.items():
        final_sections[section_name] = "\n".join(section_lines)

    return final_sections


def get_section_text(sections, possible_names):
    collected_text = ""

    for name in possible_names:
        if name in sections:
            collected_text += sections[name] + "\n"

    return collected_text


def parse_month_year(value):
    value = value.strip().lower()

    month_map = {
        "jan": 1, "january": 1,
        "feb": 2, "february": 2,
        "mar": 3, "march": 3,
        "apr": 4, "april": 4,
        "may": 5,
        "jun": 6, "june": 6,
        "jul": 7, "july": 7,
        "aug": 8, "august": 8,
        "sep": 9, "sept": 9, "september": 9,
        "oct": 10, "october": 10,
        "nov": 11, "november": 11,
        "dec": 12, "december": 12
    }

    current_year = datetime.now().year
    current_month = datetime.now().month

    if value in ["present", "current", "now"]:
        return current_year, current_month

    match = re.search(
        r"(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{4})",
        value
    )

    if match:
        month_text = match.group(1)
        year = int(match.group(2))
        month = month_map[month_text]

        return year, month

    year_match = re.search(r"\b(19|20)\d{2}\b", value)

    if year_match:
        year = int(year_match.group(0))
        return year, 1

    return None


def months_between(start_year, start_month, end_year, end_month):
    months = ((end_year - start_year) * 12) + (end_month - start_month) + 1

    return max(0, months)


def estimate_experience_months(text):
    sections = split_into_sections(text)

    experience_text = get_section_text(
        sections,
        [
            "work experience",
            "experience",
            "professional experience",
            "employment history",
            "work history",
            "career history"
        ]
    )

    if experience_text.strip() == "":
        experience_text = text

    normalized_text = normalize_text(experience_text)

    total_months = 0

    explicit_year_matches = re.findall(
        r"(\d+)\s*(?:\+)?\s*(?:years|year|yrs|yr)\s*(?:of)?\s*(?:experience)?",
        normalized_text
    )

    explicit_month_matches = re.findall(
        r"(\d+)\s*(?:months|month)\s*(?:of)?\s*(?:experience)?",
        normalized_text
    )

    explicit_months = 0

    if explicit_year_matches:
        explicit_months += max([int(year) for year in explicit_year_matches]) * 12

    if explicit_month_matches:
        explicit_months += max([int(month) for month in explicit_month_matches])

    date_range_pattern = re.compile(
        r"((?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)?\s*\d{4})\s*-\s*((?:jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)?\s*\d{4}|present|current|now)"
    )

    date_ranges = date_range_pattern.findall(normalized_text)

    for start_value, end_value in date_ranges:
        start = parse_month_year(start_value)
        end = parse_month_year(end_value)

        if start and end:
            months = months_between(start[0], start[1], end[0], end[1])
            total_months += months

    return max(total_months, explicit_months)


def count_bullet_items(section_text):
    lines = [line.strip() for line in section_text.splitlines() if line.strip()]

    count = 0

    for line in lines:
        if line.startswith("•") or line.startswith("-") or line.startswith("*"):
            count += 1

    return count


def estimate_project_count(text):
    sections = split_into_sections(text)

    projects_text = get_section_text(
        sections,
        [
            "projects",
            "project experience"
        ]
    )

    if projects_text.strip() == "":
        normalized_text = normalize_for_phrase(text)
        return normalized_text.count("project")

    project_title_count = 0

    for line in projects_text.splitlines():
        line_clean = line.strip()

        if line_clean == "":
            continue

        is_bullet = (
            line_clean.startswith("•")
            or line_clean.startswith("-")
            or line_clean.startswith("*")
        )

        has_project_word = "project" in normalize_for_phrase(line_clean)
        has_separator = "|" in line_clean

        if not is_bullet and (has_project_word or has_separator):
            project_title_count += 1

    if project_title_count > 0:
        return project_title_count

    return max(0, count_bullet_items(projects_text))


def estimate_certificate_count(text):
    sections = split_into_sections(text)

    certificate_text = get_section_text(
        sections,
        [
            "certifications",
            "certificates",
            "licenses",
            "licences"
        ]
    )

    if certificate_text.strip() == "":
        normalized_text = normalize_for_phrase(text)

        certificate_keywords = [
            "certificate",
            "certification",
            "certified",
            "coursera",
            "udemy",
            "simplilearn",
            "uipath academy"
        ]

        count = 0

        for keyword in certificate_keywords:
            count += normalized_text.count(normalize_for_phrase(keyword))

        return count

    lines = [line.strip() for line in certificate_text.splitlines() if line.strip()]

    certificate_count = 0

    for line in lines:
        normalized_line = normalize_for_phrase(line)

        if len(normalized_line) < 3:
            continue

        if "reference" in normalized_line:
            continue

        certificate_count += 1

    return certificate_count


def estimate_ats_quality_score(text):
    score = 0
    normalized_text = normalize_for_phrase(text)
    sections = split_into_sections(text)

    if len(text) > 500:
        score += 20

    if "summary" in sections or "profile" in sections:
        score += 15

    if (
        "work experience" in sections
        or "experience" in sections
        or "professional experience" in sections
        or "employment history" in sections
        or "work history" in sections
        or "career history" in sections
    ):
        score += 15

    if "education" in sections or "academic background" in sections:
        score += 10

    if "projects" in sections or "project experience" in sections:
        score += 15

    if "technical skills" in sections or "skills" in sections:
        score += 15

    if (
        "certifications" in sections
        or "certificates" in sections
        or "licenses" in sections
        or "licences" in sections
    ):
        score += 10

    email_found = re.search(r"[\w\.-]+@[\w\.-]+\.\w+", text) is not None
    phone_found = re.search(r"(\+?\d[\d\s\-]{7,}\d)", text) is not None

    if email_found:
        score += 5

    if phone_found:
        score += 5

    if "linkedin" in normalized_text:
        score += 5

    if "github" in normalized_text:
        score += 5

    return min(score, 100)


def estimate_experience_level(experience_months):
    if experience_months >= 36:
        return "Senior"

    if experience_months >= 12:
        return "Mid"

    return "Entry"


def build_cv_data_from_text(text):
    extracted_skills = extract_skills_from_text(text)
    experience_months = estimate_experience_months(text)
    num_projects = estimate_project_count(text)
    num_certificates = estimate_certificate_count(text)
    ats_quality_score = estimate_ats_quality_score(text)
    experience_level = estimate_experience_level(experience_months)

    return {
        "cleaned_all_skills": extracted_skills,
        "project_technologies": extracted_skills,
        "experience_months": experience_months,
        "experience_level": experience_level,
        "num_projects": num_projects,
        "has_projects": 1 if num_projects > 0 else 0,
        "num_certificates": num_certificates,
        "has_certificates": 1 if num_certificates > 0 else 0,
        "evaluation_score": ats_quality_score
    }