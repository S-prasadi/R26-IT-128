import codecs
import functools
import os
import re
from datetime import datetime

from pypdf import PdfReader
from docx import Document
from pdf2image import convert_from_path

from . import llm_structurer
from .ocr import (
    OCRError,
    extract_text_from_image as _ocr_extract_text_from_image,
    ocr_image,
    text_quality,
)


class CVExtractionError(Exception):
    """Raised when a CV file cannot be parsed into text. Callers should catch
    this and return a clean 4xx error instead of letting the underlying
    library exception crash the request."""
    pass


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
    "objective",
    "career objective",
    "professional summary",
    "personal profile",
    "about me",

    "work experience",
    "experience",
    "professional experience",
    "employment history",
    "work history",
    "career history",
    "relevant experience",

    "education",
    "academic background",
    "academic qualifications",
    "educational background",

    "projects",
    "project experience",
    "personal projects",
    "academic projects",
    "key projects",

    "technical skills",
    "skills",
    "key skills",
    "core competencies",
    "competencies",
    "technical proficiencies",
    "areas of expertise",

    "certifications",
    "certificates",
    "licenses",
    "licences",
    "courses",
    "trainings",
    "training",
    "professional development",

    "soft skills",
    "extra curricular activities",
    "extracurricular activities",
    "references",

    "achievements",
    "accomplishments",
    "awards",
    "languages",
    "publications",
    "volunteer experience",
    "activities",
    "contact information",
    "personal details",
    "interests",
    "hobbies"
]


_MIN_DIRECT_TEXT_QUALITY = 55
_MIN_DIRECT_TEXT_LENGTH = 120


def _clean_extracted_text(text):
    if not text:
        return ""

    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # de-hyphenate line-wrapped words
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def _looks_letter_spaced(text):
    tokens = [t for t in text.split(" ") if t]
    if len(tokens) < 10:
        return False
    single_char = sum(1 for t in tokens if len(t) == 1)
    return single_char / len(tokens) > 0.4


def _collapse_letter_spacing(text):
    """Some PDF export pipelines (seen on a real resume-builder export)
    position every glyph individually, which pypdf then extracts as a
    single space between every letter ('D U L I N A') while still using a
    wider gap at real word boundaries. Detect that pattern and collapse it
    back into words; ordinary text is returned unchanged."""
    if not _looks_letter_spaced(text):
        return text

    lines_out = []
    for line in text.splitlines():
        chunks = re.split(r" {2,}", line)
        lines_out.append(" ".join(chunk.replace(" ", "") for chunk in chunks))

    return "\n".join(lines_out)


def _render_pdf_page(file_path, page_number):
    images = convert_from_path(
        file_path,
        dpi=300,
        fmt="png",
        thread_count=2,
        use_pdftocairo=True,
        first_page=page_number,
        last_page=page_number,
    )

    if not images:
        raise OCRError(f"Could not render PDF page {page_number} to an image")

    return images[0]


def extract_text_from_pdf(file_path):
    try:
        reader = PdfReader(file_path)
    except Exception as error:
        raise CVExtractionError(f"Could not read PDF file: {error}") from error

    if reader.is_encrypted:
        try:
            decrypted = reader.decrypt("")
        except Exception:
            decrypted = 0

        # decrypt()'s return value is the real success signal (0 = failed,
        # matching pypdf.PasswordType.NOT_DECRYPTED) — is_encrypted stays
        # True even after a successful decrypt, so re-checking it here would
        # always (incorrectly) treat a correctly-decrypted PDF as unreadable.
        if not decrypted:
            raise CVExtractionError("This PDF is password-protected and cannot be read.")

    page_texts = []
    page_methods = []

    for page_number, page in enumerate(reader.pages, start=1):
        candidates = []

        for mode in ("layout", "plain"):
            try:
                candidates.append(page.extract_text(extraction_mode=mode) or "")
            except Exception:
                try:
                    candidates.append(page.extract_text() or "")
                except Exception:
                    candidates.append("")

        candidates = [_collapse_letter_spacing(c) for c in candidates]

        direct_text = max(candidates, key=text_quality, default="")
        direct_quality = text_quality(direct_text)

        if direct_quality >= _MIN_DIRECT_TEXT_QUALITY and len(direct_text) >= _MIN_DIRECT_TEXT_LENGTH:
            page_texts.append(direct_text)
            page_methods.append("text-layer")
            continue

        # Weak or missing text layer — render just this page and OCR it,
        # then keep whichever of the two actually reads better.
        try:
            image = _render_pdf_page(file_path, page_number)
            ocr_text, _metadata = ocr_image(image)
        except Exception:
            ocr_text = ""

        if text_quality(ocr_text) > direct_quality:
            page_texts.append(ocr_text)
            page_methods.append("ocr")
        else:
            page_texts.append(direct_text)
            page_methods.append("text-layer")

    unique_methods = set(page_methods)
    if len(unique_methods) > 1:
        method = "mixed"
    else:
        method = next(iter(unique_methods), "text-layer")

    return _clean_extracted_text("\n\n".join(t for t in page_texts if t)), method


def extract_text_from_docx(file_path):
    try:
        document = Document(file_path)
    except Exception as error:
        raise CVExtractionError(f"Could not read DOCX file: {error}") from error

    try:
        lines = [paragraph.text for paragraph in document.paragraphs]

        for table in document.tables:
            for row in table.rows:
                cells = []
                for cell in row.cells:
                    cell_text = cell.text.strip()
                    # Merged cells repeat the same text for every column they
                    # span — skip an immediate repeat rather than duplicating it.
                    if not cell_text or (cells and cells[-1] == cell_text):
                        continue
                    cells.append(cell_text)
                if cells:
                    lines.append(" | ".join(cells))

        return _clean_extracted_text("\n".join(lines)), "direct"
    except Exception as error:
        raise CVExtractionError(f"Could not extract text from DOCX: {error}") from error


_TXT_ENCODINGS = ["utf-8", "cp1252"]


def extract_text_from_txt(file_path):
    try:
        with open(file_path, "rb") as file:
            raw = file.read()
    except OSError as error:
        raise CVExtractionError(f"Could not read TXT file: {error}") from error

    # BOM-marked encodings first: cp1252/latin-1 are single-byte codecs that
    # "succeed" (silently, garbled) on almost any byte sequence, so a blind
    # try-chain would never reach utf-16/utf-8-sig for content that actually
    # is one of those — a real BOM is an unambiguous signal, check it first.
    if raw.startswith(codecs.BOM_UTF8):
        return _clean_extracted_text(raw.decode("utf-8-sig")), "direct"
    if raw.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        return _clean_extracted_text(raw.decode("utf-16")), "direct"

    for encoding in _TXT_ENCODINGS:
        try:
            return _clean_extracted_text(raw.decode(encoding)), "direct"
        except (UnicodeDecodeError, UnicodeError):
            continue

    # latin-1 (last in the chain above) maps every byte, so this is
    # unreachable in practice — kept as a safe terminal fallback.
    return _clean_extracted_text(raw.decode("latin-1", errors="replace")), "direct"


def extract_text_from_image(file_path):
    try:
        return _clean_extracted_text(_ocr_extract_text_from_image(file_path)), "ocr"
    except OCRError as error:
        raise CVExtractionError(str(error)) from error


def extract_text_from_file(file_path):
    """Extract text from a CV file. Returns (text, extraction_metadata),
    where extraction_metadata is {"method": ..., "quality": ...} — method is
    "text-layer"/"ocr"/"mixed" (PDF), "direct" (DOCX/TXT), "ocr" (image), or
    "unsupported" if the extension isn't recognized."""
    extension = os.path.splitext(file_path)[1].lower()

    try:
        if extension == ".pdf":
            text, method = extract_text_from_pdf(file_path)
        elif extension == ".docx":
            text, method = extract_text_from_docx(file_path)
        elif extension == ".txt":
            text, method = extract_text_from_txt(file_path)
        elif extension in (".png", ".jpg", ".jpeg"):
            text, method = extract_text_from_image(file_path)
        else:
            return "", {"method": "unsupported", "quality": 0.0}
    except CVExtractionError:
        raise
    except Exception as error:
        raise CVExtractionError(f"Unexpected error reading {extension} file: {error}") from error

    return text, {"method": method, "quality": text_quality(text)}


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


_HEADER_DECORATION_RE = re.compile(r"^\s*([0-9]{1,2}[\.\)]|[ivxIVX]{1,4}[\.\)]|[-*•])\s*")
_HEADER_BANNER_RE = re.compile(r"^[-=*_~\s]+|[-=*_~\s]+$")
_HEADER_TRAILING_COLON_RE = re.compile(r":\s*$")


def _strip_header_decoration(line):
    stripped = _HEADER_DECORATION_RE.sub("", line)
    stripped = _HEADER_TRAILING_COLON_RE.sub("", stripped)
    stripped = _HEADER_BANNER_RE.sub("", stripped)

    return stripped.strip()


def _looks_like_header_candidate(line):
    if len(line) > 35:
        return False

    word_count = len(normalize_for_phrase(line).split())

    if word_count == 0 or word_count > 4:
        return False

    if line.rstrip().endswith((".", ",", ";")):
        return False

    return True


def _match_section_header(line):
    """Return the SECTION_HEADERS entry a line matches, or None. Tries an
    exact match first; only for short, punctuation-free, header-shaped lines
    does it also try again after stripping numbering/bullets/banner symbols
    — always as a full-line exact match, never a substring, so body text
    that merely mentions a header word is never misdetected."""
    normalized_line = normalize_for_phrase(line)

    for header in SECTION_HEADERS:
        if normalized_line == normalize_for_phrase(header):
            return header

    if not _looks_like_header_candidate(line):
        return None

    normalized_cleaned = normalize_for_phrase(_strip_header_decoration(line))

    for header in SECTION_HEADERS:
        if normalized_cleaned == normalize_for_phrase(header):
            return header

    return None


def _split_into_sections_regex(text):
    lines = [line.strip() for line in text.splitlines() if line.strip()]

    sections = {}
    current_section = "general"
    sections[current_section] = []

    for line in lines:
        matched_header = _match_section_header(line)

        if matched_header:
            current_section = matched_header
            sections[current_section] = []
        else:
            sections.setdefault(current_section, []).append(line)

    final_sections = {}

    for section_name, section_lines in sections.items():
        final_sections[section_name] = "\n".join(section_lines)

    return final_sections


@functools.lru_cache(maxsize=8)
def _resolve_sections(text):
    """Prefer the local Ollama model's section split; fall back to the
    regex/heuristic splitter when it's unreachable or returns nothing
    usable. Cached so the 4 estimator functions below, which each call
    split_into_sections independently on the same text, only trigger one
    real Ollama call per CV rather than four."""
    llm_sections = llm_structurer.structure_sections(text)
    if llm_sections:
        return llm_sections

    return _split_into_sections_regex(text)


def split_into_sections(text):
    return _resolve_sections(text)


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
            "career history",
            "relevant experience"
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
            "project experience",
            "personal projects",
            "academic projects",
            "key projects"
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
            "licences",
            "courses",
            "trainings",
            "training",
            "professional development"
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

    if (
        "summary" in sections
        or "profile" in sections
        or "objective" in sections
        or "career objective" in sections
        or "professional summary" in sections
        or "personal profile" in sections
        or "about me" in sections
    ):
        score += 15

    if (
        "work experience" in sections
        or "experience" in sections
        or "professional experience" in sections
        or "employment history" in sections
        or "work history" in sections
        or "career history" in sections
        or "relevant experience" in sections
    ):
        score += 15

    if (
        "education" in sections
        or "academic background" in sections
        or "academic qualifications" in sections
        or "educational background" in sections
    ):
        score += 10

    if (
        "projects" in sections
        or "project experience" in sections
        or "personal projects" in sections
        or "academic projects" in sections
        or "key projects" in sections
    ):
        score += 15

    if (
        "technical skills" in sections
        or "skills" in sections
        or "key skills" in sections
        or "core competencies" in sections
        or "competencies" in sections
        or "technical proficiencies" in sections
        or "areas of expertise" in sections
    ):
        score += 15

    if (
        "certifications" in sections
        or "certificates" in sections
        or "licenses" in sections
        or "licences" in sections
        or "courses" in sections
        or "trainings" in sections
        or "training" in sections
        or "professional development" in sections
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
