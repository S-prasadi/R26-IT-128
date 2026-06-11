import ast
import re
import pandas as pd


FEATURE_COLUMNS = [
    "target_role",
    "experience_level",

    "cv_skills_count",
    "required_skills_count",
    "preferred_skills_count",
    "matched_required_count",
    "matched_preferred_count",
    "missing_required_count",
    "missing_preferred_count",

    "required_match_ratio",
    "preferred_match_ratio",
    "project_match_ratio",

    "experience_months",
    "num_projects",
    "has_projects",
    "num_certificates",
    "has_certificates",
    "ats_quality_score"
]


def clean_text(text):
    if text is None:
        return ""

    if isinstance(text, float) and pd.isna(text):
        return ""

    text = str(text)
    text = re.sub(r"\s+", " ", text)
    text = text.strip()

    return text


def parse_list(value):
    if isinstance(value, list):
        return value

    if value is None:
        return []

    if isinstance(value, float) and pd.isna(value):
        return []

    value = str(value).strip()

    if value == "":
        return []

    try:
        parsed_value = ast.literal_eval(value)

        if isinstance(parsed_value, list):
            return parsed_value
    except Exception:
        pass

    return [item.strip() for item in value.split(",") if item.strip() != ""]


def normalize_skill(skill):
    skill = clean_text(skill).lower()

    skill = skill.replace("&", " and ")
    skill = skill.replace(".", "")
    skill = skill.replace("-", " ")
    skill = skill.replace("_", " ")
    skill = re.sub(r"\s+", " ", skill).strip()

    skill_mapping = {
        "powerbi": "power bi",
        "power bi": "power bi",

        "google sheet": "google sheets",
        "google sheets": "google sheets",

        "data analytics": "data analysis",
        "data analysis": "data analysis",

        "data visualisation": "data visualization",
        "data visualization": "data visualization",

        "dashboard": "dashboard development",
        "dashboards": "dashboard development",
        "dashboard development": "dashboard development",

        "structured reporting": "reporting",
        "kpi reporting": "reporting",
        "reporting": "reporting",

        "data cleaning": "data cleaning",
        "data preparation": "data cleaning",

        "data validation": "data validation",

        "trend analysis": "trend analysis",

        "sql server": "sql",
        "mysql": "sql",
        "postgresql": "sql",
        "sqlite": "sql",
        "sql": "sql",

        "mongo db": "mongodb",
        "mongodb": "mongodb",

        "scikit learn": "scikit-learn",
        "sklearn": "scikit-learn",
        "scikit-learn": "scikit-learn",

        "machine learning": "machine learning",
        "ml": "machine learning",
        "ai ml": "machine learning",

        "natural language processing": "nlp",
        "nlp": "nlp",

        "node js": "nodejs",
        "nodejs": "nodejs",

        "react js": "react",
        "reactjs": "react",
        "react": "react",

        "fast api": "fastapi",
        "fastapi": "fastapi",

        "restful api": "api integration",
        "rest api": "api integration",
        "api": "api integration",
        "api integration": "api integration",

        "uipath studio": "uipath",
        "uipath": "uipath",
        "rpa": "uipath",

        "github": "git",
        "git": "git",

        "jupyter": "jupyter notebook",
        "jupyter notebook": "jupyter notebook",

        "detail oriented": "attention to detail",
        "detail-oriented": "attention to detail",
        "attention to detail": "attention to detail",

        "problem-solving": "problem solving",
        "problem solving": "problem solving",

        "communication skills": "communication",
        "communication": "communication"
    }

    return skill_mapping.get(skill, skill)


def display_skill(skill):
    skill = normalize_skill(skill)

    display_mapping = {
        "excel": "Excel",
        "power bi": "Power BI",
        "google sheets": "Google Sheets",
        "tableau": "Tableau",
        "sql": "SQL",
        "mysql": "MySQL",
        "mongodb": "MongoDB",

        "data analysis": "Data Analysis",
        "data visualization": "Data Visualization",
        "dashboard development": "Dashboard Development",
        "reporting": "Reporting",
        "data cleaning": "Data Cleaning",
        "data validation": "Data Validation",
        "trend analysis": "Trend Analysis",
        "statistics": "Statistics",
        "forecasting": "Forecasting",

        "python": "Python",
        "r": "R",
        "pandas": "Pandas",
        "numpy": "NumPy",
        "scikit-learn": "Scikit-learn",
        "machine learning": "Machine Learning",
        "deep learning": "Deep Learning",
        "tensorflow": "TensorFlow",
        "pytorch": "PyTorch",
        "hugging face": "Hugging Face",
        "prophet": "Prophet",
        "xgboost": "XGBoost",
        "nlp": "NLP",

        "flask": "Flask",
        "django": "Django",
        "fastapi": "FastAPI",
        "streamlit": "Streamlit",
        "react": "React",
        "nodejs": "Node.js",
        "javascript": "JavaScript",
        "typescript": "TypeScript",
        "html": "HTML",
        "css": "CSS",
        "api integration": "API Integration",

        "aws": "AWS",
        "azure": "Azure",
        "gcp": "GCP",
        "git": "Git",
        "docker": "Docker",
        "kubernetes": "Kubernetes",
        "uipath": "UiPath",
        "jupyter notebook": "Jupyter Notebook",
        "postman": "Postman",

        "communication": "Communication",
        "attention to detail": "Attention To Detail",
        "problem solving": "Problem Solving",
        "analytical thinking": "Analytical Thinking",
        "teamwork": "Teamwork",
        "leadership": "Leadership",
        "time management": "Time Management"
    }

    return display_mapping.get(skill, skill.title())


def get_level(score):
    if score >= 80:
        return "Advanced"

    if score >= 50:
        return "Intermediate"

    return "Beginner"


def compare_cv_with_role(cv_row, job_role_profiles):
    target_role = clean_text(cv_row.get("target_role", ""))

    profile = job_role_profiles.get(target_role)

    if profile is None:
        return {
            "matched_required_skills": [],
            "matched_preferred_skills": [],
            "missing_required_skills": [],
            "missing_preferred_skills": [],
            "required_match_ratio": 0,
            "preferred_match_ratio": 0,
            "project_match_ratio": 0
        }

    cv_skills = parse_list(cv_row.get("cleaned_all_skills", []))
    project_skills = parse_list(cv_row.get("project_technologies", []))

    cv_skill_set = set([normalize_skill(skill) for skill in cv_skills])
    project_skill_set = set([normalize_skill(skill) for skill in project_skills])

    required_skills = profile.get("required_skills", [])
    preferred_skills = profile.get("preferred_skills", [])

    required_skill_set = set([normalize_skill(skill) for skill in required_skills])
    preferred_skill_set = set([normalize_skill(skill) for skill in preferred_skills])

    matched_required = cv_skill_set.intersection(required_skill_set)
    matched_preferred = cv_skill_set.intersection(preferred_skill_set)

    missing_required = required_skill_set.difference(cv_skill_set)
    missing_preferred = preferred_skill_set.difference(cv_skill_set)

    role_all_skills = required_skill_set.union(preferred_skill_set)
    matched_project_skills = project_skill_set.intersection(role_all_skills)

    required_match_ratio = 0
    preferred_match_ratio = 0
    project_match_ratio = 0

    if len(required_skill_set) > 0:
        required_match_ratio = len(matched_required) / len(required_skill_set)

    if len(preferred_skill_set) > 0:
        preferred_match_ratio = len(matched_preferred) / len(preferred_skill_set)

    if len(role_all_skills) > 0:
        project_match_ratio = len(matched_project_skills) / len(role_all_skills)

    return {
        "matched_required_skills": [display_skill(skill) for skill in sorted(matched_required)],
        "matched_preferred_skills": [display_skill(skill) for skill in sorted(matched_preferred)],
        "missing_required_skills": [display_skill(skill) for skill in sorted(missing_required)],
        "missing_preferred_skills": [display_skill(skill) for skill in sorted(missing_preferred)],
        "required_match_ratio": required_match_ratio,
        "preferred_match_ratio": preferred_match_ratio,
        "project_match_ratio": project_match_ratio
    }


def build_feature_row(cv_row, selected_role, job_role_profiles):
    cv_row = cv_row.copy()
    cv_row["target_role"] = selected_role

    comparison = compare_cv_with_role(cv_row, job_role_profiles)

    experience_months = float(cv_row.get("experience_months", 0))
    num_projects = float(cv_row.get("num_projects", 0))
    num_certificates = float(cv_row.get("num_certificates", 0))
    evaluation_score = float(cv_row.get("evaluation_score", 0))

    feature_row = {
        "target_role": selected_role,
        "experience_level": cv_row.get("experience_level", ""),

        "cv_skills_count": len(parse_list(cv_row.get("cleaned_all_skills", []))),
        "required_skills_count": len(job_role_profiles.get(selected_role, {}).get("required_skills", [])),
        "preferred_skills_count": len(job_role_profiles.get(selected_role, {}).get("preferred_skills", [])),

        "matched_required_count": len(comparison["matched_required_skills"]),
        "matched_preferred_count": len(comparison["matched_preferred_skills"]),
        "missing_required_count": len(comparison["missing_required_skills"]),
        "missing_preferred_count": len(comparison["missing_preferred_skills"]),

        "required_match_ratio": comparison["required_match_ratio"],
        "preferred_match_ratio": comparison["preferred_match_ratio"],
        "project_match_ratio": comparison["project_match_ratio"],

        "experience_months": experience_months,
        "num_projects": num_projects,
        "has_projects": int(cv_row.get("has_projects", 0)),
        "num_certificates": num_certificates,
        "has_certificates": int(cv_row.get("has_certificates", 0)),
        "ats_quality_score": min(evaluation_score, 100)
    }

    return feature_row, comparison


def generate_recommendations(comparison):
    recommendations = []

    missing_required = comparison["missing_required_skills"]
    missing_preferred = comparison["missing_preferred_skills"]

    for skill in missing_required[:5]:
        recommendations.append("Improve " + skill + " because it is important for this role.")

    if len(recommendations) < 5:
        remaining_slots = 5 - len(recommendations)

        for skill in missing_preferred[:remaining_slots]:
            recommendations.append("Learning " + skill + " can strengthen your profile.")

    if len(recommendations) == 0:
        recommendations.append("Your CV matches the main skills for this role. Improve your projects and measurable achievements next.")

    return recommendations