"""
Component 2 - Career Pathway Predictor
========================================
Dataset: cleaned_data/IT_Job_Roles_Skills.csv  (493 IT job roles with skills)

Steps:
  1. prepare  - load CSV -> normalise roles -> generate synthetic training records
  2. train    - encode features, compare 5 models, save the best
  3. evaluate - generate 4 evaluation charts (saved to charts/)
  4. predict  - beam-search career path prediction

Usage:
  python train_all.py                                  # run all steps
  python train_all.py --step prepare                   # build training CSV only
  python train_all.py --step train                     # train only
  python train_all.py --step evaluate                  # charts only
  python train_all.py --step predict                   # demo predictions
  python train_all.py --no-transformer                 # use TF-IDF instead
  python train_all.py --skills "Python,Docker,AWS" --role Student --experience 6 --projects 2
"""

import csv, json, math, warnings, argparse, re
import numpy as np
import pandas as pd
import joblib
import random
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import List

from sklearn.preprocessing import LabelEncoder, MultiLabelBinarizer, StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.svm import SVC
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import train_test_split, cross_val_score, learning_curve
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

warnings.filterwarnings("ignore")
random.seed(42)
np.random.seed(42)

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE        = Path(__file__).parent
DATA_DIR    = BASE / "cleaned_data"
MODELS_DIR  = BASE / "saved_models"
CHARTS_DIR  = BASE / "charts"
SOURCE_CSV  = DATA_DIR / "IT_Job_Roles_Skills.csv"
TRAIN_CSV   = DATA_DIR / "training_data.csv"

CHARTS_DIR.mkdir(exist_ok=True)
MODELS_DIR.mkdir(exist_ok=True)

# ── Hyperparameters ───────────────────────────────────────────────────────────
ENCODER_NAME      = "all-MiniLM-L6-v2"
RECORDS_PER_ROLE  = 150     # synthetic records generated per role
SKILL_FRAC_LOW    = 0.55    # min fraction of role's skills to include per record
SKILL_FRAC_HIGH   = 0.90    # max fraction
MIN_ROLE_SKILLS   = 4       # skip roles that have fewer skills than this
MIN_CLASS_SAMPLES = 15      # drop classes below this threshold before training
BEAM_WIDTH        = 3
MAX_DEPTH         = 2

try:
    from sentence_transformers import SentenceTransformer
    _HAS_ST = True
except ImportError:
    _HAS_ST = False

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    _HAS_TFIDF = True
except ImportError:
    _HAS_TFIDF = False


# =============================================================================
# SECTION 1 - Title normalisation & seniority detection
# =============================================================================

_ACRONYM_MAP = {
    "Devops": "DevOps", "Devsecops": "DevSecOps",
    "Aws": "AWS", "Gcp": "GCP", "Sre": "SRE",
    "Qa": "QA", "Api": "API", "Sql": "SQL",
    "Ios": "iOS", "Ui": "UI", "Ux": "UX",
    "Nosql": "NoSQL", "Bi": "BI", "Ml": "ML",
    "Ai": "AI", "Nlp": "NLP", "Seo": "SEO",
    "Php": "PHP", "Crm": "CRM", "Erp": "ERP",
    "Iot": "IoT", "Vpc": "VPC", "Dns": "DNS",
    "Cio": "CIO", "Cto": "CTO", "Coo": "COO",
    "Vfx": "VFX", "Sap": "SAP", "It": "IT",
    "Saas": "SaaS", "Paas": "PaaS", "Iaas": "IaaS",
    "Iac": "IaC", "Ci/Cd": "CI/CD",
}

_PLURAL_FIX = {
    "Data Analysts":        "Data Analyst",
    "Systems Analysts":     "Systems Analyst",
    "Data Scientists":      "Data Scientist",
    "Machine Learning Engineers": "Machine Learning Engineer",
}

_STRIP_PARENS = re.compile(r"\s*\(.*?\)\s*")


def _normalise_title(raw: str) -> str:
    """
    Convert any casing variant of a job title to a consistent Title Case form,
    fixing known acronyms and stripping parenthetical suffixes.
    """
    t = _STRIP_PARENS.sub("", raw.strip()).strip()
    t = t.title()
    for wrong, right in _ACRONYM_MAP.items():
        t = re.sub(rf"\b{re.escape(wrong)}\b", right, t)
    for wrong, right in _PLURAL_FIX.items():
        t = t.replace(wrong, right)
    t = re.sub(r"\s+", " ", t).strip()
    # Fix .net capitalisation that title() breaks
    t = re.sub(r"\bNet\b", ".NET", t)
    # Collapse dirty repeated dots ("..NET" -> ".NET") and stray leading dots
    t = re.sub(r"\.{2,}", ".", t)
    t = re.sub(r"^\.(?=[A-Za-z]{2,})", "", t)
    return t.strip()


# Explicit merges for near-duplicate / inconsistent titles the rules miss.
_CANONICAL_MAP = {
    "Artificial Intelligence Engineer":                     "AI Engineer",
    "Artificial Intelligence Architect":                    "AI Architect",
    "Artificial Intelligence Researcher":                   "AI Researcher",
    "Artificial Intelligence / Machine Learning Leader":    "AI/ML Lead",
    "Artificial Intelligence / Machine Learning Sr.Leader": "AI/ML Lead",
    "Back End Developer":                                    "Backend Developer",
    "Front End Developer":                                   "Frontend Developer",
    "Computer Programmer":                                   "Software Engineer",
    "Coder":                                                 "Software Engineer",
    "Programmer":                                            "Software Engineer",
}

# Tool-specific micro-roles (Bamboo/Bitbucket/Confluence/Artifactory/…) are all
# really DevOps engineering jobs — collapse them into one canonical class.
_DEVOPS_TOOLS = {
    "ansible", "appdynamics", "artifactory", "bamboo", "bitbucket", "chef",
    "confluence", "consul", "coverage.py", "datadog", "grafana", "jenkins",
    "jira", "kibana", "logstash", "nagios", "prometheus", "puppet", "splunk",
    "terraform", "vault", "nexus", "sonarqube", "octopus",
    # Extended so single-tool "X Engineer" titles (Zabbix, Istio, JUnit, ...)
    # collapse into "DevOps Engineer" instead of fragmenting the label space
    # into ~25 near-keyword-matched classes with almost no real signal.
    "docker", "kubernetes", "elk", "falco", "fluentd", "envoy", "gerrit",
    "git", "github", "gitlab", "gradle", "groovy", "jacoco", "junit", "maven",
    "relic", "nomad", "notary", "packer", "powershell", "pytest", "selenium",
    "teamcity", "udeploy", "deploy", "zabbix", "istio",
}


def _canonical_role(raw: str) -> str:
    """
    Collapse the long tail of ~347 noisy job titles into a cleaner set of
    canonical, recommendable roles so the classifier's probability mass is not
    fragmented across near-duplicates. Real technical domains map to a
    domain+seniority canonical title; tool-named DevOps micro-roles fold into
    'DevOps Engineer'; explicit duplicates use _CANONICAL_MAP.
    """
    title = _normalise_title(raw)
    if title in _CANONICAL_MAP:
        title = _CANONICAL_MAP[title]

    low = title.lower()
    first = low.split()[0] if low.split() else ""
    if first in _DEVOPS_TOOLS or any(tok in _DEVOPS_TOOLS for tok in low.split()):
        if any(w in low for w in ["engineer", "operations", "administrator", "automation", "ops"]):
            return "DevOps Engineer"

    dom = _domain(title)
    if dom == "General IT":
        return title  # mixed bag — keep distinct rather than over-collapse

    base = _MID_BY_DOMAIN[dom]
    sen  = _seniority(title)
    if sen >= 3:
        return f"Lead/Architect {base}"
    if sen == 2:
        return f"Senior {base}"
    return base


_JUNIOR_KW  = {"junior", "jr", "jr.", "entry level", "entry-level",
               "new grad", "intern", "trainee", "apprentice", "student"}
_SENIOR_KW  = {"senior", "sr.", "sr", "lead", "principal"}
_ARCH_KW    = {"architect", "architecture"}
_MGMT_KW    = {"manager", "director", "head", "chief", "vp", "president",
               "officer", "cio", "cto"}


def _seniority(title: str) -> int:
    """0 = entry/intern, 1 = mid-level, 2 = senior/lead, 3 = architect/manager."""
    t = title.lower()
    if any(w in t for w in _JUNIOR_KW):
        return 0
    if any(w in t for w in _MGMT_KW | _ARCH_KW):
        return 3
    if any(w in t for w in _SENIOR_KW):
        return 2
    return 1


def _domain(title: str) -> str:
    """Infer a broad domain from the job title for career-step generation."""
    t = title.lower()
    if any(x in t for x in ["machine learning", "ml engineer", "artificial intelligence",
                              "ai engineer", "ai research", "ai software", "ai architect",
                              "deep learning", "nlp engineer", "data science"]):
        return "AI/ML"
    if any(x in t for x in ["big data", "data engineer", "data pipeline", "hadoop", "spark"]):
        return "Data Engineering"
    if any(x in t for x in ["data analyst", "data analysis", "business intelligence",
                              "bi analyst", "bi developer", "power bi"]):
        return "Data Analytics"
    if any(x in t for x in ["data scientist", "data science specialist"]):
        return "Data Science"
    if any(x in t for x in ["devops", "devsecops", "sre", "site reliability",
                              "build and release", "build engineer", "jenkins", "ansible operations",
                              "chef operations", "puppet operations", "kubernetes operations"]):
        return "DevOps/SRE"
    if any(x in t for x in ["cloud", "aws", "azure devops", "gcp", "openstack", "openshift"]):
        return "Cloud"
    if any(x in t for x in ["security", "cybersecurity", "penetration", "infosec",
                              "devsecops", "fortify", "splunk"]):
        return "Security"
    if any(x in t for x in ["front end", "frontend", "front-end", "react developer",
                              "angular", "vue", "ui developer", "ui designer",
                              "ux designer", "web designer", "interaction designer"]):
        return "Frontend/UI"
    if any(x in t for x in ["full stack", "fullstack"]):
        return "Full Stack"
    if any(x in t for x in ["backend", "back end", "back-end"]):
        return "Backend"
    if any(x in t for x in ["mobile", "android", "ios developer", "flutter", "react native",
                              "mobile app"]):
        return "Mobile"
    if any(x in t for x in ["database", "dba", "oracle developer", "oracle sql",
                              "sql developer"]):
        return "Database"
    if any(x in t for x in ["network engineer", "network architect", "network analyst",
                              "network operations"]):
        return "Network"
    if any(x in t for x in ["embedded", "firmware", "robotics", "iot developer", "cnc"]):
        return "Embedded/IoT"
    if any(x in t for x in ["game developer", "unity developer"]):
        return "Game Dev"
    if any(x in t for x in ["blockchain"]):
        return "Blockchain"
    if any(x in t for x in ["software engineer", "software developer", "software architect",
                              "java developer", "python developer", "c# developer",
                              ".net developer", "php developer", "ruby", "programmer",
                              "computer programmer", "entry level"]):
        return "Software Engineering"
    if any(x in t for x in ["product manager", "project manager", "program manager",
                              "business analyst", "agile", "scrum"]):
        return "Management/BA"
    if any(x in t for x in ["web developer", "web engineer", "web designer", "wordpress",
                              "web producer", "web content"]):
        return "Web Development"
    if any(x in t for x in ["animator", "animation", "vfx", "graphics", "motion",
                              "storyboard", "rigging", "compositor", "3d artist", "2d artist"]):
        return "Animation/VFX"
    return "General IT"


_INTERN_BY_DOMAIN = {
    "AI/ML":              "ML/AI Intern",
    "Data Engineering":   "Data Engineering Intern",
    "Data Analytics":     "Data Analysis Intern",
    "Data Science":       "Data Science Intern",
    "DevOps/SRE":         "DevOps Intern",
    "Cloud":              "Cloud Intern",
    "Security":           "Security Intern",
    "Frontend/UI":        "Frontend Intern",
    "Full Stack":         "Software Engineer Intern",
    "Backend":            "Backend Intern",
    "Mobile":             "Mobile Dev Intern",
    "Database":           "Database Intern",
    "Network":            "Network Operations Intern",
    "Embedded/IoT":       "Embedded Systems Intern",
    "Software Engineering":"Software Engineer Intern",
    "Management/BA":      "Business Analyst Intern",
    "Web Development":    "Web Development Intern",
    "Blockchain":         "Web3 Intern",
    "Game Dev":           "Game Dev Intern",
    "Animation/VFX":      "Media & Art Intern",
    "General IT":         "IT Support Intern",
}

_MID_BY_DOMAIN = {
    "AI/ML":              "Machine Learning Engineer",
    "Data Engineering":   "Data Engineer",
    "Data Analytics":     "Data Analyst",
    "Data Science":       "Data Scientist",
    "DevOps/SRE":         "DevOps Engineer",
    "Cloud":              "Cloud Engineer",
    "Security":           "Security Engineer",
    "Frontend/UI":        "Frontend Developer",
    "Full Stack":         "Full Stack Developer",
    "Backend":            "Backend Developer",
    "Mobile":             "Mobile Developer",
    "Database":           "Database Administrator",
    "Network":            "Network Engineer",
    "Embedded/IoT":       "Embedded Systems Engineer",
    "Software Engineering":"Software Engineer",
    "Management/BA":      "Business Analyst",
    "Web Development":    "Web Developer",
    "Blockchain":         "Blockchain Developer",
    "Game Dev":           "Game Developer",
    "Animation/VFX":      "Visual Effects Artist",
    "General IT":         "IT Specialist",
}

_JUNIOR_BY_DOMAIN = {
    k: "Junior " + v for k, v in _MID_BY_DOMAIN.items()
}
_SENIOR_BY_DOMAIN = {
    k: "Senior " + v for k, v in _MID_BY_DOMAIN.items()
}
_LEAD_BY_DOMAIN = {
    k: "Lead/Architect " + v for k, v in _MID_BY_DOMAIN.items()
}

# Full seniority ladder per tier index (0 intern → 4 lead/architect).
_LADDER_BY_TIER = {
    0: _INTERN_BY_DOMAIN,
    1: _JUNIOR_BY_DOMAIN,
    2: _MID_BY_DOMAIN,
    3: _SENIOR_BY_DOMAIN,
    4: _LEAD_BY_DOMAIN,
}

# Months it typically takes to move up one ladder tier (index = lower tier).
_TIER_ETA_MONTHS = {0: 6, 1: 18, 2: 24, 3: 36}


def _target_tier(target_role: str) -> int:
    """Map the 0–3 _seniority() scale onto the 0–4 ladder tier of a target."""
    s = _seniority(target_role)
    return {0: 1, 1: 2, 2: 3, 3: 4}.get(s, 2)


def _role_tier(role: str) -> int:
    """Ladder tier 0–4 of a role name (intern → lead/architect)."""
    t = role.lower()
    if any(w in t for w in ["lead", "architect", "principal", "manager", "head", "chief"]):
        return 4
    if "senior" in t or "sr." in t or "sr " in t:
        return 3
    if any(w in t for w in _JUNIOR_KW):
        return 0 if "intern" in t or "student" in t else 1
    return 2


def get_career_steps(current_role: str, target_role: str) -> List[str]:
    """
    Build a deep, step-by-step career path from current_role up the full
    seniority ladder (Intern → Junior → Mid → Senior → Lead/Architect) of the
    target's domain, always ending on the real target_role. Yields 5–7 nodes.
    """
    dom        = _domain(target_role)
    cur_tier   = _role_tier(current_role)
    end_tier   = _target_tier(target_role)
    same_field = _domain(current_role) == dom and cur_tier > 0
    if same_field:
        # Same field: step up one tier from where they are.
        start_tier = cur_tier + 1
    else:
        # New field (a pivot) or a student: walk the target-domain ladder from a
        # couple of tiers below the goal so the journey has real depth.
        start_tier = max(0, end_tier - 3)

    path = [current_role]
    for tier in range(start_tier, end_tier + 1):
        role = _LADDER_BY_TIER.get(tier, _MID_BY_DOMAIN).get(dom)
        if role and role.lower() != path[-1].lower() and role not in path:
            path.append(role)

    if target_role not in path:
        path.append(target_role)
    return path


def _step_gate(model, from_role: str, to_role: str, current_skills: list) -> dict:
    """
    The top ~3 skills that 'unlock' to_role relative to what the user already has,
    plus an ETA in months derived from the seniority-tier jump. Ladder roles that
    have no profile of their own fall back to their base mid-role profile.
    """
    have = {s.lower().strip() for s in current_skills}
    profiles = getattr(model, "role_skill_profiles", {}) or {}
    profile = profiles.get(to_role)
    if not profile:
        base = _MID_BY_DOMAIN.get(_domain(to_role))
        profile = profiles.get(base, {}) if base else {}
    ranked = sorted(profile.items(), key=lambda kv: kv[1], reverse=True)
    gate_skills = [s for s, _ in ranked if s.lower() not in have][:3]

    lo, hi = _role_tier(from_role), _role_tier(to_role)
    eta = sum(_TIER_ETA_MONTHS.get(t, 12) for t in range(min(lo, hi), max(lo, hi))) or 6
    return {"role": to_role, "skills": gate_skills, "eta_months": eta}


# =============================================================================
# SECTION 2 - Load source CSV -> role skill profiles
# =============================================================================

def _parse_skills_str(raw: str) -> List[str]:
    return [s.strip().lower() for s in raw.split(",") if s.strip()]


def load_role_profiles() -> dict:
    """
    Read IT_Job_Roles_Skills.csv.
    Returns { normalised_title: [skill, ...] } with duplicate titles merged.
    """
    if not SOURCE_CSV.exists():
        raise FileNotFoundError(
            f"Source CSV not found: {SOURCE_CSV}\n"
            f"Expected: cleaned_data/IT_Job_Roles_Skills.csv"
        )

    profiles: dict = defaultdict(set)
    with open(SOURCE_CSV, encoding="cp1252", newline="") as f:
        for row in csv.DictReader(f):
            title  = _canonical_role(row["Job Title"])
            skills = _parse_skills_str(row.get("Skills", ""))
            if len(skills) >= MIN_ROLE_SKILLS:
                profiles[title].update(skills)

    return {
        title: sorted(skills)
        for title, skills in profiles.items()
        if len(skills) >= MIN_ROLE_SKILLS
    }


# =============================================================================
# SECTION 3 - Synthetic training-record generator
# =============================================================================

_EXP_VALUES  = [0,  0,  6,  6, 12, 18, 24, 36, 48]
_EXP_WEIGHTS = [20, 15, 20, 15, 10,  8,  7,  3,  2]


def _exp_level(months: int) -> str:
    if months == 0:  return "Fresher"
    if months < 18:  return "Junior"
    if months < 42:  return "Mid"
    return "Senior"


def _current_role_for(target: str, seniority: int) -> str:
    dom = _domain(target)
    pool = {
        0: ["Student", "Graduate", "Fresh Graduate"],
        1: ["Student",
            _INTERN_BY_DOMAIN.get(dom, "IT Intern"),
            "Graduate"],
        2: [_INTERN_BY_DOMAIN.get(dom, "IT Intern"),
            _JUNIOR_BY_DOMAIN.get(dom, "Junior Developer"),
            "Software Engineer"],
        3: [_MID_BY_DOMAIN.get(dom, "IT Professional"),
            _JUNIOR_BY_DOMAIN.get(dom, "Junior Developer"),
            "Senior Software Engineer"],
    }
    return random.choice(pool.get(seniority, ["Student", "Graduate"]))


CSV_COLUMNS = [
    "candidate_id", "current_role", "target_role",
    "skills", "skills_text",
    "experience_months", "experience_level",
    "num_skills", "num_projects", "evaluation_score",
]


def _generate_record(role: str, all_skills: List[str], seniority: int, idx: int) -> dict:
    frac   = random.uniform(SKILL_FRAC_LOW, SKILL_FRAC_HIGH)
    k      = max(3, int(len(all_skills) * frac))
    skills = sorted(random.sample(all_skills, min(k, len(all_skills))))

    exp_months = random.choices(_EXP_VALUES, weights=_EXP_WEIGHTS)[0]
    if seniority >= 2 and exp_months < 12:
        exp_months = random.choice([12, 18, 24, 36])

    tag = re.sub(r"[^A-Z0-9]", "", role.upper())[:8]
    return {
        "candidate_id":      f"IT_{tag}_{idx:05d}",
        "current_role":      _current_role_for(role, seniority),
        "target_role":       role,
        "skills":            "|".join(skills),
        "skills_text":       " ".join(skills),
        "experience_months": exp_months,
        "experience_level":  _exp_level(exp_months),
        "num_skills":        len(skills),
        "num_projects":      random.randint(0, 10),
        "evaluation_score":  round(random.uniform(30, 95), 1),
    }


def generate_records(role_profiles: dict, n_per_role: int = RECORDS_PER_ROLE) -> List[dict]:
    rows = []
    for role, skills in role_profiles.items():
        sen = _seniority(role)
        for i in range(n_per_role):
            rows.append(_generate_record(role, skills, sen, i))
    random.shuffle(rows)
    return rows


# =============================================================================
# SECTION 4 - Model (training, inference, persistence)
# =============================================================================

CANDIDATE_MODELS = {
    # Logistic Regression over the sentence-transformer embeddings generalises
    # to real, free-text skill queries far better than tree models, which overfit
    # the balanced synthetic patterns and return semantically-off roles with
    # near-uniform (tied) probabilities. The accuracy gap is negligible.
    "Logistic Regression": LogisticRegression(max_iter=1000, C=2.0,
                                               solver="lbfgs",
                                               random_state=42, n_jobs=-1),
}


def _diagnose(train_acc: float, test_acc: float, gap: float) -> str:
    if train_acc < 0.60 and test_acc < 0.60:
        return "Underfitting"
    if gap > 0.20:
        return "Overfitting"
    if gap > 0.08:
        return "Slight overfit"
    return "Good fit"


class CareerPathwayModel:

    def __init__(self, use_transformer: bool = True):
        self.use_transformer      = use_transformer and _HAS_ST
        self.label_encoder        = LabelEncoder()
        self.mlb                  = MultiLabelBinarizer()
        # Scales [experience_months, num_skills, num_projects] before
        # concatenating with the embedding — unscaled, these numeric columns
        # are 60-250x larger in magnitude than any single embedding dimension
        # (std dev ~12/~8/~3 vs ~0.05), which can badly distort a linear
        # classifier's learned weights. None until fit (see _encode_train);
        # load() leaves this None for older artifacts saved before scaling
        # existed, so they keep working unscaled exactly as before.
        self.scaler                = StandardScaler()
        self.tfidf                = None
        self.classifier           = None
        self.best_model_name: str = ""
        self.encoder              = None
        self.role_skill_profiles: dict = {}
        self.model_scores: dict   = {}

        if self.use_transformer:
            print(f"  Loading sentence-transformer '{ENCODER_NAME}' ...")
            self.encoder = SentenceTransformer(ENCODER_NAME)
        elif _HAS_TFIDF:
            self.tfidf = TfidfVectorizer(max_features=1000, ngram_range=(1, 2))

    # ── Feature encoding ──────────────────────────────────────────────────────

    def _numeric(self, df):
        return df[["experience_months", "num_skills", "num_projects"]].fillna(0).values

    def _encode_train(self, df):
        numeric = self._numeric(df)
        numeric = self.scaler.fit_transform(numeric) if self.scaler is not None else numeric
        if self.use_transformer:
            text = self.encoder.encode(
                df["skills_text"].fillna("").tolist(),
                show_progress_bar=True, batch_size=64,
            )
        elif self.tfidf is not None:
            text = self.tfidf.fit_transform(df["skills_text"].fillna("")).toarray()
        else:
            text = self.mlb.fit_transform(df["skills"].tolist())
        return np.hstack([text, numeric])

    def _encode_input(self, skills: list, exp_months: int,
                       n_skills: int, n_projects: int):
        text_str = " ".join(skills)
        numeric  = np.array([[exp_months, n_skills, n_projects]], dtype=float)
        numeric  = self.scaler.transform(numeric) if self.scaler is not None else numeric
        if self.use_transformer:
            text = self.encoder.encode([text_str])
        elif self.tfidf is not None:
            text = self.tfidf.transform([text_str]).toarray()
        else:
            text = self.mlb.transform([skills])
        return np.hstack([text, numeric])

    # ── Role–skill profiles ───────────────────────────────────────────────────

    def _build_role_profiles(self, df):
        self.role_skill_profiles = {}
        for role, grp in df.groupby("target_role"):
            total = len(grp)
            counts: dict = {}
            for skill_str in grp["skills"]:
                items = skill_str if isinstance(skill_str, list) \
                        else skill_str.split("|")
                for s in items:
                    s = s.strip()
                    if s:
                        counts[s] = counts.get(s, 0) + 1
            self.role_skill_profiles[role] = {
                s: cnt / total
                for s, cnt in counts.items()
                if cnt / total >= 0.15
            }

    # ── Training ──────────────────────────────────────────────────────────────

    def train(self, df) -> float:
        print(f"\n  Training on {len(df)} samples - {df['target_role'].nunique()} classes")
        self._build_role_profiles(df)

        print("  Encoding features ...")
        X = self._encode_train(df)
        y = self.label_encoder.fit_transform(df["target_role"])

        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        np.save(MODELS_DIR / "X_encoded.npy", X)
        np.save(MODELS_DIR / "y_labels.npy",  y)

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y)

        print("\n" + "=" * 72)
        print("  Model Comparison + Overfitting / Underfitting Diagnosis")
        print("=" * 72)
        print(f"  {'Model':<26} {'Train':>8} {'Test':>8} {'Gap':>8}  Diagnosis")
        print("  " + "-" * 66)

        best_acc, best_name, best_clf = -1.0, "", None
        self.model_scores = {}

        for name, clf in CANDIDATE_MODELS.items():
            print(f"  Training {name} ...", end=" ", flush=True)
            clf.fit(X_train, y_train)
            train_acc = accuracy_score(y_train, clf.predict(X_train))
            test_acc  = accuracy_score(y_test,  clf.predict(X_test))
            gap       = train_acc - test_acc
            diag      = _diagnose(train_acc, test_acc, gap)
            self.model_scores[name] = {
                "train_acc": round(train_acc * 100, 2),
                "test_acc":  round(test_acc  * 100, 2),
                "gap":       round(gap        * 100, 2),
                "diagnosis": diag,
            }
            print(f"\r  {name:<26} {train_acc*100:>7.2f}% {test_acc*100:>7.2f}%"
                  f" {gap*100:>+7.2f}%  {diag}")
            if test_acc > best_acc:
                best_acc, best_name, best_clf = test_acc, name, clf

        print("  " + "-" * 66)
        print(f"  Best model: {best_name}  ({best_acc * 100:.2f}%)")
        print("=" * 72)

        self.classifier      = best_clf
        self.best_model_name = best_name

        print(f"\n  Running 5-fold CV on {best_name} ...")
        cv = cross_val_score(best_clf, X, y, cv=5, scoring="accuracy", n_jobs=-1)
        print(f"  CV mean: {cv.mean()*100:.2f}%  ±  {cv.std()*100:.2f}%")
        self.model_scores[best_name]["cv_mean"] = round(cv.mean() * 100, 2)
        self.model_scores[best_name]["cv_std"]  = round(cv.std()  * 100, 2)

        # Top-3 accuracy — the metric that actually matters for a recommender
        # that surfaces 3 paths (top-1 alone understates a ranking model).
        if hasattr(best_clf, "predict_proba"):
            proba   = best_clf.predict_proba(X_test)
            top3    = np.argsort(proba, axis=1)[:, -3:]
            hit3    = np.mean([y_test[i] in top3[i] for i in range(len(y_test))])
            self.model_scores[best_name]["top3_acc"] = round(hit3 * 100, 2)
            print(f"  Top-3 accuracy: {hit3 * 100:.2f}%")

        y_pred = best_clf.predict(X_test)
        print(f"\n  Classification report - {best_name}:")
        # Explicit `labels` covers every class the encoder knows about, not
        # just whatever happens to appear in y_test/y_pred — without it,
        # classification_report infers labels from the data alone and errors
        # out as soon as any class (typically an ultra-thin one post-dedup)
        # ends up with zero test examples, which crashes before model.save().
        print(classification_report(y_test, y_pred,
                                    labels=np.arange(len(self.label_encoder.classes_)),
                                    target_names=self.label_encoder.classes_,
                                    zero_division=0))
        return best_acc

    # ── Inference ─────────────────────────────────────────────────────────────

    def predict_paths(self, skills: list, current_role: str = "Student",
                       experience_months: int = 0, num_projects: int = 0,
                       top_k: int = 3) -> list:
        clean = [s.lower().strip() for s in skills if s.strip()]
        X     = self._encode_input(clean, experience_months, len(clean), num_projects)
        probs = self.classifier.predict_proba(X)[0]
        top   = np.argsort(probs)[::-1][:top_k]

        results = []
        for idx in top:
            role       = self.label_encoder.classes_[idx]
            confidence = float(probs[idx])
            gap        = self._skill_gap(clean, role)
            results.append({
                "role":            role,
                "confidence":      confidence,
                "skills_matched":  sorted(gap["matched"]),
                "skills_needed":   gap["missing_ranked"],
                "readiness_score": gap["readiness"],
            })
        return results

    def _skill_gap(self, current_skills: list, target_role: str) -> dict:
        profile     = self.role_skill_profiles.get(target_role, {})
        current_set = set(current_skills)
        important   = {s for s, f in profile.items() if f >= 0.30}
        all_skills  = set(profile.keys())
        matched     = current_set & all_skills
        missing_imp = important - current_set

        # Frequency-weighted readiness: a skill present in 90% of postings for
        # the role counts far more than one present in 30%. This yields a smooth
        # 0–1 score instead of the coarse integer ratios (0.25, 0.5, …) the old
        # count-based formula produced.
        total_weight   = sum(profile.values())
        matched_weight = sum(profile.get(s, 0.0) for s in matched)
        readiness = (matched_weight / total_weight) if total_weight > 0 else 1.0

        missing_ranked = sorted(
            missing_imp, key=lambda s: profile.get(s, 0), reverse=True
        )[:8]
        return {
            "matched":        matched,
            "missing_ranked": missing_ranked,
            "readiness":      round(readiness, 3),
        }

    # ── Persistence ───────────────────────────────────────────────────────────

    def save(self, path: Path = None):
        d = Path(path) if path else MODELS_DIR
        d.mkdir(parents=True, exist_ok=True)

        joblib.dump(self.classifier,          d / "classifier.pkl")
        joblib.dump(self.label_encoder,       d / "label_encoder.pkl")
        joblib.dump(self.mlb,                 d / "mlb.pkl")
        joblib.dump(self.role_skill_profiles, d / "role_skill_profiles.pkl")
        if self.scaler is not None:
            joblib.dump(self.scaler, d / "scaler.pkl")
        if self.tfidf is not None:
            joblib.dump(self.tfidf, d / "tfidf.pkl")

        meta = {
            "use_transformer": self.use_transformer,
            "best_model":      self.best_model_name,
            "model_scores":    self.model_scores,
            "classes":         self.label_encoder.classes_.tolist(),
            "num_roles":       len(self.role_skill_profiles),
        }
        with open(d / "model_info.json", "w") as f:
            json.dump(meta, f, indent=2)

        print(f"\n  Model saved -> {d}")
        print(f"  Best classifier : {self.best_model_name}")
        print(f"  Roles covered   : {len(self.role_skill_profiles)}")

    @classmethod
    def load(cls, path: Path = None):
        d = Path(path) if path else MODELS_DIR
        with open(d / "model_info.json") as f:
            meta = json.load(f)

        obj = cls(use_transformer=meta.get("use_transformer", False))
        obj.classifier          = joblib.load(d / "classifier.pkl")
        obj.label_encoder       = joblib.load(d / "label_encoder.pkl")
        obj.mlb                 = joblib.load(d / "mlb.pkl")
        obj.role_skill_profiles = joblib.load(d / "role_skill_profiles.pkl")
        obj.best_model_name     = meta.get("best_model", "")
        obj.model_scores        = meta.get("model_scores", {})

        # Older saved artifacts (trained before feature scaling was added)
        # won't have this file — leave scaling off for them so they keep
        # working exactly as before instead of crashing on an unfit scaler.
        scaler_path = d / "scaler.pkl"
        obj.scaler = joblib.load(scaler_path) if scaler_path.exists() else None

        tfidf_path = d / "tfidf.pkl"
        if tfidf_path.exists():
            obj.tfidf = joblib.load(tfidf_path)
        return obj


# =============================================================================
# SECTION 5 - Beam search
# =============================================================================

@dataclass
class _BeamCandidate:
    roles:       List[str]
    skills:      List[str]
    log_prob:    float
    confidences: List[float] = field(default_factory=list)


def _expand_beam(model: CareerPathwayModel,
                  candidate: _BeamCandidate, width: int):
    preds = model.predict_paths(
        skills=candidate.skills,
        current_role=candidate.roles[-1],
        experience_months=0,
        num_projects=0,
        top_k=width,
    )
    out = []
    for pred in preds:
        if pred["role"] in candidate.roles:
            continue
        new_skills = list(set(candidate.skills) | set(pred["skills_needed"]))
        new_lp     = candidate.log_prob + math.log(max(pred["confidence"], 1e-9))
        out.append((_BeamCandidate(
            roles       = candidate.roles + [pred["role"]],
            skills      = new_skills,
            log_prob    = new_lp,
            confidences = candidate.confidences + [pred["confidence"]],
        ), pred))
    return out


def predict_career_paths(
    model: CareerPathwayModel,
    skills: list,
    current_role: str   = "Student",
    experience_months: int = 0,
    num_projects: int   = 0,
    top_k: int          = 3,
) -> list:

    clean       = [s.lower().strip() for s in skills if s.strip()]
    first_preds = model.predict_paths(
        skills=clean, current_role=current_role,
        experience_months=experience_months,
        num_projects=num_projects,
        top_k=top_k,
    )

    beam = []
    for pred in first_preds:
        new_skills = list(set(clean) | set(pred["skills_needed"]))
        beam.append((_BeamCandidate(
            roles       = [current_role, pred["role"]],
            skills      = new_skills,
            log_prob    = math.log(max(pred["confidence"], 1e-9)),
            confidences = [pred["confidence"]],
        ), pred))

    for _ in range(MAX_DEPTH - 1):
        new_beam = []
        for cand, fp in beam:
            if _seniority(cand.roles[-1]) >= 3:
                new_beam.append((cand, fp))
                continue
            expansions = _expand_beam(model, cand, BEAM_WIDTH)
            if expansions:
                for nc, _ in expansions:
                    new_beam.append((nc, fp))
            else:
                new_beam.append((cand, fp))
        new_beam.sort(key=lambda x: x[0].log_prob, reverse=True)
        beam = new_beam[:top_k]

    results, seen, rank = [], set(), 1
    for cand, fp in beam:
        target = cand.roles[-1]
        if target in seen:
            continue
        seen.add(target)
        steps = get_career_steps(current_role, target)
        step_gates = [
            _step_gate(model, steps[i], steps[i + 1], clean)
            for i in range(len(steps) - 1)
        ]
        results.append({
            "path_number":     rank,
            "target_role":     target,
            "confidence":      fp["confidence"],
            "career_steps":    steps,
            "step_gates":      step_gates,
            "readiness_score": fp["readiness_score"],
            "skills_matched":  fp["skills_matched"],
            "skills_needed":   fp["skills_needed"],
        })
        rank += 1
        if rank > top_k:
            break
    return results


# =============================================================================
# SECTION 5b - Goal-directed path (always ends at a user-chosen target role)
# =============================================================================

def _target_confidence(model: "CareerPathwayModel", clean: list,
                       target_role: str, experience_months: int,
                       num_projects: int):
    """The classifier's probability for `target_role` given the user's skills —
    i.e. how strongly their current profile already points at the goal. None when
    the goal isn't one of the model's known classes."""
    classes = list(model.label_encoder.classes_)
    if target_role not in classes:
        return None
    X = model._encode_input(clean, experience_months, len(clean), num_projects)
    probs = model.classifier.predict_proba(X)[0]
    return float(probs[classes.index(target_role)])


def _readiness_toward(model: "CareerPathwayModel", clean: list, target_role: str) -> dict:
    """Skill gap toward the goal. Falls back to the domain's mid-role profile when
    the goal has no profile of its own, so we never return the misleading 1.0 that
    an empty-profile lookup yields in `_skill_gap`."""
    profiles = getattr(model, "role_skill_profiles", {}) or {}
    if profiles.get(target_role):
        return model._skill_gap(clean, target_role)
    base = _MID_BY_DOMAIN.get(_domain(target_role))
    if base and profiles.get(base):
        return model._skill_gap(clean, base)
    return {"matched": set(), "missing_ranked": [], "readiness": 0.0}


def predict_path_to_target(
    model: "CareerPathwayModel",
    skills: list,
    current_role: str,
    target_role: str,
    experience_months: int = 0,
    num_projects: int = 0,
) -> dict:
    """Build a single career path that always ends at `target_role`, in the same
    shape as a `/predict` path. Reuses the seniority-ladder + skill-gap helpers."""
    clean = [s.lower().strip() for s in skills if s.strip()]
    steps = get_career_steps(current_role, target_role)
    gap = _readiness_toward(model, clean, target_role)
    step_gates = [
        _step_gate(model, steps[i], steps[i + 1], clean)
        for i in range(len(steps) - 1)
    ]
    conf = _target_confidence(model, clean, target_role, experience_months, num_projects)
    return {
        "path_number":     0,
        "target_role":     target_role,
        "confidence":      conf if conf is not None else 0.0,
        "career_steps":    steps,
        "step_gates":      step_gates,
        "readiness_score": gap["readiness"],
        "skills_matched":  sorted(gap["matched"]),
        "skills_needed":   gap["missing_ranked"],
    }


def format_predictions(results: list) -> str:
    lines = ["\n" + "=" * 60, "  CAREER PATHWAY PREDICTIONS", "=" * 60]
    for r in results:
        conf  = f"{r['confidence'] * 100:.1f}%"
        ready = f"{r['readiness_score'] * 100:.0f}%"
        lines.append(f"\nPath {r['path_number']} -> {r['target_role']}  ({conf} confidence)")
        lines.append(f"  Steps     : {' -> '.join(r['career_steps'])}")
        lines.append(f"  Readiness : {ready}")
        if r["skills_matched"]:
            lines.append(f"  You have  : {', '.join(sorted(r['skills_matched'])[:5])}")
        if r["skills_needed"]:
            lines.append(f"  Need      : {', '.join(r['skills_needed'][:5])}")
        else:
            lines.append("  Need      : - (you already have the key skills!)")
    lines.append("\n" + "=" * 60)
    return "\n".join(lines)


# =============================================================================
# SECTION 6 - Step functions
# =============================================================================

def step_prepare():
    print("\n" + "=" * 60)
    print("  Step 1/4 - Preparing Dataset")
    print("  Source: IT_Job_Roles_Skills.csv")
    print("=" * 60)

    role_profiles = load_role_profiles()
    print(f"\n  Unique roles after normalisation: {len(role_profiles)}")
    for title, skills in sorted(role_profiles.items()):
        print(f"    {title:<55}  {len(skills):>3} skills")

    print(f"\n  Generating {RECORDS_PER_ROLE} records × {len(role_profiles)} roles "
          f"= {RECORDS_PER_ROLE * len(role_profiles):,} total ...")
    rows = generate_records(role_profiles, RECORDS_PER_ROLE)

    TRAIN_CSV.parent.mkdir(parents=True, exist_ok=True)
    with open(TRAIN_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    counts = Counter(r["target_role"] for r in rows)
    print(f"\n  Total records : {len(rows):,}")
    print(f"  Total roles   : {len(counts)}")
    print(f"  Saved -> {TRAIN_CSV}")


def _load_training_df() -> pd.DataFrame:
    if not TRAIN_CSV.exists():
        print("  training_data.csv not found - running prepare step ...")
        step_prepare()

    df_raw = pd.read_csv(TRAIN_CSV, encoding="utf-8")
    rows = []
    for _, r in df_raw.iterrows():
        target = str(r.get("target_role", "")).strip()
        if not target or target.lower() in {"not mentioned", "nan", ""}:
            continue
        skills_raw = str(r.get("skills", ""))
        skills = [s.strip() for s in skills_raw.split("|") if s.strip()]
        rows.append({
            "candidate_id":      str(r.get("candidate_id", "")),
            "current_role":      str(r.get("current_role", "Student")).strip(),
            "target_role":       target,
            "skills":            skills,
            "skills_text":       " ".join(skills),
            "experience_months": int(r.get("experience_months", 0) or 0),
            "experience_level":  str(r.get("experience_level", "Fresher")),
            "num_skills":        len(skills),
            "num_projects":      int(r.get("num_projects", 0) or 0),
            "evaluation_score":  float(r.get("evaluation_score", 0.0) or 0.0),
        })

    df = pd.DataFrame(rows)
    counts = df["target_role"].value_counts()
    valid  = counts[counts >= MIN_CLASS_SAMPLES].index
    removed = counts[counts < MIN_CLASS_SAMPLES].index.tolist()
    if removed:
        print(f"  Removed rare classes (< {MIN_CLASS_SAMPLES} samples): {removed}")
    df = df[df["target_role"].isin(valid)].copy()

    # Dedupe on (target_role, skills) so the train/test split can't put
    # exact-duplicate rows on both sides. The synthetic generator independently
    # resamples a skill subset per row, and for roles with a small skill pool
    # that collides constantly — many "150 records" are really only a handful
    # of unique skill combinations copied dozens of times. Left in, a random
    # split is near-guaranteed to test the model on rows it already memorized
    # during training, inflating reported accuracy well above what it would
    # score on genuinely unseen input.
    before = len(df)
    skills_key = df["skills"].apply(lambda s: "|".join(sorted(s)))
    df = df.assign(_skills_key=skills_key).drop_duplicates(subset=["target_role", "_skills_key"]).drop(columns=["_skills_key"]).reset_index(drop=True)
    deduped = before - len(df)
    if deduped:
        print(f"  Deduplicated {deduped:,} exact-duplicate (target_role, skills) rows "
              f"({deduped / before:.1%} of the pre-dedup data)")

    # A class needs at least 2 unique skill combinations for a stratified
    # train/test split to even be possible. Anything below that has too little
    # real signal to evaluate honestly — surfaced here (rather than silently
    # dropped) since it's exactly the list worth adding real skill variety to.
    post_counts = df["target_role"].value_counts()
    too_thin = post_counts[post_counts < 2].index.tolist()
    if too_thin:
        print(f"  Dropping {len(too_thin)} classes with < 2 unique skill combinations "
              f"after dedup (add more skill variety to these in the source data): {too_thin}")
        df = df[~df["target_role"].isin(too_thin)].reset_index(drop=True)

    print(f"  {len(df):,} records  |  {df['target_role'].nunique()} target roles")
    return df


def step_train(use_transformer: bool = True):
    print("\n" + "=" * 60)
    print("  Step 2/4 - Training Career Pathway Model")
    print("=" * 60)
    print(f"  Encoder: {'sentence-transformers (' + ENCODER_NAME + ')' if use_transformer and _HAS_ST else 'TF-IDF'}")

    df    = _load_training_df()
    model = CareerPathwayModel(use_transformer=use_transformer)
    acc   = model.train(df)
    model.save()
    print(f"\n  Training complete!  Test accuracy: {acc * 100:.2f}%")
    return model


# =============================================================================
# SECTION 7 - Evaluation charts
# =============================================================================

def step_evaluate():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.ticker as mtick
    import seaborn as sns

    print("\n" + "=" * 60)
    print("  Step 3/4 - Evaluation Charts")
    print("=" * 60)

    meta_path = MODELS_DIR / "model_info.json"
    if not meta_path.exists():
        print("  No saved model found. Run --step train first.")
        return

    with open(meta_path) as f:
        meta = json.load(f)

    model = CareerPathwayModel.load()

    X_path, y_path = MODELS_DIR / "X_encoded.npy", MODELS_DIR / "y_labels.npy"
    if X_path.exists() and y_path.exists():
        X = np.load(X_path)
        y = np.load(y_path)
        print(f"  Loaded cached features: X={X.shape}, y={y.shape}")
    else:
        print("  Cache not found - re-encoding ...")
        df = _load_training_df()
        model.label_encoder.fit(df["target_role"])
        X  = model._encode_train(df)
        y  = model.label_encoder.transform(df["target_role"])
        np.save(X_path, X)
        np.save(y_path, y)

    plt.rcParams.update({"figure.dpi": 150,
                          "axes.spines.top": False,
                          "axes.spines.right": False})
    PALETTE = sns.color_palette("Set2", 10)

    # ── Chart 1: Model comparison ────────────────────────────────────────────
    scores = meta.get("model_scores", {})
    if scores:
        models     = list(scores.keys())
        train_accs = [scores[m].get("train_acc", 0) for m in models]
        test_accs  = [scores[m].get("test_acc",  0) for m in models]
        gaps       = [scores[m].get("gap",       0) for m in models]

        x, w = np.arange(len(models)), 0.35
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        fig.suptitle("Model Comparison - Train vs Test Accuracy",
                     fontsize=14, fontweight="bold")

        ax = axes[0]
        b1 = ax.bar(x - w/2, train_accs, w, label="Train",
                    color=PALETTE[0], edgecolor="white")
        b2 = ax.bar(x + w/2, test_accs,  w, label="Test",
                    color=PALETTE[1], edgecolor="white")
        ax.set_xticks(x)
        ax.set_xticklabels(models, rotation=20, ha="right", fontsize=9)
        ax.set_ylabel("Accuracy (%)")
        ax.set_ylim(0, 115)
        ax.yaxis.set_major_formatter(mtick.PercentFormatter(xmax=100))
        ax.legend()
        ax.set_title("Train vs Test Accuracy")
        for bar in b1 + b2:
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 1,
                    f"{bar.get_height():.1f}%",
                    ha="center", va="bottom", fontsize=7.5)

        ax2 = axes[1]
        colors = ["#e74c3c" if g > 20 else "#f39c12" if g > 8 else "#2ecc71"
                  for g in gaps]
        bars = ax2.bar(models, gaps, color=colors, edgecolor="white")
        ax2.set_xticks(range(len(models)))
        ax2.set_xticklabels(models, rotation=20, ha="right", fontsize=9)
        ax2.set_title("Train−Test Gap (Overfitting Indicator)")
        ax2.axhline(8,  color="#f39c12", linewidth=1.2, linestyle="--")
        ax2.axhline(20, color="#e74c3c", linewidth=1.2, linestyle="--")
        for bar, g in zip(bars, gaps):
            ax2.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.3,
                     f"{g:.1f}%", ha="center", va="bottom", fontsize=8)

        plt.tight_layout()
        fig.savefig(CHARTS_DIR / "1_model_comparison.png", bbox_inches="tight")
        plt.close()
        print("  Saved -> charts/1_model_comparison.png")

    # ── Chart 2: Learning curves (skipped for >100 classes — too slow) ──────────
    best_name = meta.get("best_model", "")
    n_classes = len(meta.get("classes", []))
    if best_name in CANDIDATE_MODELS and n_classes <= 100:
        clf = CANDIDATE_MODELS[best_name]
        print(f"  Computing learning curves for '{best_name}' ...")
        ts, tr_sc, val_sc = learning_curve(
            clf, X, y, cv=3, scoring="accuracy",
            train_sizes=np.linspace(0.10, 1.0, 6),
            n_jobs=2, shuffle=True, random_state=42,
        )
        tm, ts_ = tr_sc.mean(axis=1) * 100, tr_sc.std(axis=1) * 100
        vm, vs  = val_sc.mean(axis=1) * 100, val_sc.std(axis=1) * 100

        fig, ax = plt.subplots(figsize=(9, 5))
        ax.fill_between(ts, tm - ts_, tm + ts_, alpha=0.15, color=PALETTE[0])
        ax.fill_between(ts, vm - vs,  vm + vs,  alpha=0.15, color=PALETTE[1])
        ax.plot(ts, tm, "o-", color=PALETTE[0], label="Training",   linewidth=2)
        ax.plot(ts, vm, "s-", color=PALETTE[1], label="Validation", linewidth=2)
        ax.set_title(f"Learning Curves - {best_name}",
                     fontsize=13, fontweight="bold")
        ax.set_xlabel("Training set size")
        ax.set_ylabel("Accuracy (%)")
        ax.yaxis.set_major_formatter(mtick.PercentFormatter(xmax=100))
        ax.legend()
        ax.grid(axis="y", linestyle="--", alpha=0.4)
        plt.tight_layout()
        fig.savefig(CHARTS_DIR / "2_learning_curves.png", bbox_inches="tight")
        plt.close()
        print("  Saved -> charts/2_learning_curves.png")
    elif n_classes > 100:
        print(f"  Skipping learning curves ({n_classes} classes - use CV scores from training instead)")

    # ── Chart 3: Confusion matrix (top-30 classes) ───────────────────────────
    _, X_test, _, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y)
    y_pred      = model.classifier.predict(X_test)
    class_names = model.label_encoder.classes_

    top_cls = [c for c, _ in Counter(y_test).most_common(30)]
    mask    = np.isin(y_test, top_cls)
    if mask.sum() > 0:
        top_names = [class_names[c] for c in sorted(top_cls)]
        lmap      = {c: i for i, c in enumerate(sorted(top_cls))}
        yt  = np.array([lmap[c] for c in y_test[mask]])
        yp  = np.array([lmap.get(c, -1) for c in y_pred[mask]])
        ok  = yp >= 0
        cm  = confusion_matrix(yt[ok], yp[ok])
        cmn = cm.astype(float) / (cm.sum(axis=1, keepdims=True) + 1e-8)

        fig, axes = plt.subplots(1, 2, figsize=(22, 10))
        fig.suptitle(
            f"Confusion Matrix (top 30 classes) - {model.best_model_name}",
            fontsize=13, fontweight="bold")
        sns.heatmap(cm,  ax=axes[0], annot=True, fmt="d",   cmap="Blues",
                    xticklabels=top_names, yticklabels=top_names)
        sns.heatmap(cmn, ax=axes[1], annot=True, fmt=".2f", cmap="YlOrRd",
                    xticklabels=top_names, yticklabels=top_names, vmin=0, vmax=1)
        axes[0].set_title("Raw Counts")
        axes[1].set_title("Normalised (Recall per Class)")
        for ax in axes:
            ax.set_xlabel("Predicted")
            ax.set_ylabel("True")
            ax.tick_params(axis="x", rotation=45, labelsize=7)
            ax.tick_params(axis="y", rotation=0,  labelsize=7)
        plt.tight_layout()
        fig.savefig(CHARTS_DIR / "3_confusion_matrix.png", bbox_inches="tight")
        plt.close()
        print("  Saved -> charts/3_confusion_matrix.png")

    # ── Chart 4: Per-class F1 (top-30 by F1) ─────────────────────────────────
    # Same explicit-labels fix as in train() — otherwise this errors as soon
    # as any thin class has zero test examples.
    report  = classification_report(y_test, y_pred,
                                    labels=np.arange(len(class_names)),
                                    target_names=class_names,
                                    output_dict=True, zero_division=0)
    f1_data = {c: report[c]["f1-score"] * 100
               for c in class_names if c in report}
    top30   = sorted(f1_data.items(), key=lambda x: -x[1])[:30]
    names30 = [x[0] for x in sorted(top30, key=lambda x: x[1])]
    f1s30   = [f1_data[n] for n in names30]
    prec30  = [report[n]["precision"] * 100 for n in names30]
    rec30   = [report[n]["recall"]    * 100 for n in names30]

    fig, ax = plt.subplots(figsize=(12, 9))
    y_pos, h = np.arange(len(names30)), 0.25
    ax.barh(y_pos + h, prec30, h, label="Precision", color=PALETTE[2])
    ax.barh(y_pos,     rec30,  h, label="Recall",    color=PALETTE[3])
    ax.barh(y_pos - h, f1s30,  h, label="F1 Score",  color=PALETTE[4])
    ax.set_yticks(y_pos)
    ax.set_yticklabels(names30, fontsize=8)
    ax.set_xlabel("Score (%)")
    ax.axvline(80, color="grey", linewidth=0.8, linestyle="--")
    ax.set_title(
        f"Per-Class Precision / Recall / F1 (top 30) - {model.best_model_name}",
        fontsize=12, fontweight="bold")
    ax.legend(fontsize=9)
    ax.grid(axis="x", linestyle="--", alpha=0.3)
    for tick, f1 in zip(ax.get_yticklabels(), f1s30):
        tick.set_color(
            "#e74c3c" if f1 < 60 else "#f39c12" if f1 < 80 else "#27ae60")
    plt.tight_layout()
    fig.savefig(CHARTS_DIR / "4_per_class_f1.png", bbox_inches="tight")
    plt.close()
    print("  Saved -> charts/4_per_class_f1.png")

    print(f"\n  All charts saved to {CHARTS_DIR}/")


# =============================================================================
# SECTION 8 - Demo predictions
# =============================================================================

DEMO_PROFILES = [
    {
        "label":             "ML / AI Engineer",
        "current_role":      "Student",
        "experience_months": 0,
        "num_projects":      4,
        "skills": ["python", "tensorflow", "scikit-learn", "numpy", "pandas",
                   "machine learning", "deep learning", "nlp", "data analysis",
                   "jupyter", "keras", "pytorch"],
    },
    {
        "label":             "DevOps / Cloud",
        "current_role":      "DevOps Intern",
        "experience_months": 6,
        "num_projects":      3,
        "skills": ["docker", "kubernetes", "aws", "linux", "python", "ci/cd",
                   "terraform", "jenkins", "ansible", "git", "automation"],
    },
    {
        "label":             "Full Stack Developer",
        "current_role":      "Junior Frontend Developer",
        "experience_months": 12,
        "num_projects":      5,
        "skills": ["react", "javascript", "typescript", "node.js", "mongodb",
                   "html", "css", "git", "rest api", "docker", "postgresql"],
    },
    {
        "label":             "Data Engineer",
        "current_role":      "Data Analysis Intern",
        "experience_months": 6,
        "num_projects":      3,
        "skills": ["python", "sql", "apache spark", "kafka", "airflow",
                   "aws", "etl", "data pipelines", "databricks", "pandas"],
    },
    {
        "label":             "Security Engineer",
        "current_role":      "Student",
        "experience_months": 0,
        "num_projects":      2,
        "skills": ["penetration testing", "kali linux", "burpsuite", "nmap",
                   "owasp", "python", "networking", "linux", "cybersecurity"],
    },
]


def step_predict(skills=None, role="Student", experience=0, projects=0, top_k=3):
    print("\n" + "=" * 60)
    print("  Step 4/4 - Career Pathway Prediction")
    print("=" * 60)

    model = CareerPathwayModel.load()

    if skills:
        results = predict_career_paths(
            model, skills=skills, current_role=role,
            experience_months=experience, num_projects=projects, top_k=top_k,
        )
        print(format_predictions(results))
        return

    for profile in DEMO_PROFILES:
        print(f"\n>>> {profile['label']}")
        print(f"    Role: {profile['current_role']}  |  "
              f"Exp: {profile['experience_months']}m  |  "
              f"Projects: {profile['num_projects']}")
        print(f"    Skills: {', '.join(profile['skills'])}")
        results = predict_career_paths(
            model,
            skills=profile["skills"],
            current_role=profile["current_role"],
            experience_months=profile["experience_months"],
            num_projects=profile["num_projects"],
            top_k=3,
        )
        print(format_predictions(results))


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Component 2 - Career Pathway Predictor  (IT_Job_Roles_Skills)")
    parser.add_argument("--step",
                        choices=["prepare", "train", "evaluate", "predict"],
                        help="Run only one step (default: all)")
    parser.add_argument("--no-transformer", action="store_true",
                        help="Use TF-IDF instead of sentence-transformers")
    parser.add_argument("--skills",     type=str, default=None,
                        help="Comma-separated skills for custom prediction")
    parser.add_argument("--role",       type=str, default="Student")
    parser.add_argument("--experience", type=int, default=0,
                        help="Months of experience")
    parser.add_argument("--projects",   type=int, default=0)
    parser.add_argument("--top-k",      type=int, default=3)
    args = parser.parse_args()

    use_transformer = not args.no_transformer
    skills = ([s.strip() for s in args.skills.split(",") if s.strip()]
              if args.skills else None)

    print("\n" + "#" * 60)
    print("#   Component 2 - Career Pathway Predictor            #")
    print("#   SLIIT R26-IT-128 · Dilki                          #")
    print("#   Dataset : IT_Job_Roles_Skills.csv  (493 roles)    #")
    print("#" * 60)

    if args.step == "prepare":
        step_prepare()
    elif args.step == "train":
        step_train(use_transformer)
    elif args.step == "evaluate":
        step_evaluate()
    elif args.step == "predict":
        step_predict(skills=skills, role=args.role,
                     experience=args.experience,
                     projects=args.projects,
                     top_k=args.top_k)
    else:
        step_prepare()
        step_train(use_transformer)
        step_evaluate()
        step_predict(skills=skills, role=args.role,
                     experience=args.experience,
                     projects=args.projects,
                     top_k=args.top_k)


if __name__ == "__main__":
    main()
