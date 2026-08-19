import os
import json
import tempfile
import urllib.parse
import joblib
import pandas as pd
import requests

from flask import Flask, request, jsonify
from flask_cors import CORS

from utils.cv_parser import (
    extract_text_from_file,
    build_cv_data_from_text,
    CVExtractionError
)

from utils.cv_parser import extract_skills_from_text
from utils import llm_structurer, ocr
from utils.ocr import text_quality

from utils.scoring import (
    build_feature_row,
    get_level,
    generate_recommendations,
    generate_recommendations_detailed,
    normalize_skill,
    display_skill
)

from utils.relative_eval import (
    load_score_distributions,
    percentile_for_score,
    percentile_label
)


app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
MODEL_FOLDER = os.path.join(BASE_DIR, "models")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# v2 (tuned Gradient Boosting) — see IMPROVEMENT_PLAN.md Phase 2/6 and
# models/model_registry.json. v1 (cv_job_score_model.pkl) is kept on disk,
# retired but not deleted, so this swap is trivially reversible.
MODEL_PATH = os.path.join(MODEL_FOLDER, "cv_job_score_model_v2.pkl")
PROFILE_PATH = os.path.join(MODEL_FOLDER, "job_role_profiles.json")


score_model = joblib.load(MODEL_PATH)

with open(PROFILE_PATH, "r", encoding="utf-8") as file:
    job_role_profiles = json.load(file)

score_distributions = load_score_distributions()

# Load the OCR reader and warm the local Ollama model now, not on the first
# real request — EasyOCR's Reader() and Ollama's model load each take real
# time on CPU, and stacking both onto a real user's first upload would make
# it look like the service hung. Best-effort (see ocr.warm_up/llm_structurer.warm_up).
ocr.warm_up()
llm_structurer.warm_up()


@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "message": "CV Job Analyzer Flask API is running"
    })


@app.route("/roles", methods=["GET"])
def get_roles():
    roles = sorted(list(job_role_profiles.keys()))

    return jsonify({
        "roles": roles
    })


@app.route("/analyze-cv", methods=["POST"])
def analyze_cv():
    if "cv_file" not in request.files:
        return jsonify({
            "error": "CV file is required"
        }), 400

    selected_role = request.form.get("target_role", "").strip()

    if selected_role == "":
        return jsonify({
            "error": "Target role is required"
        }), 400

    if selected_role not in job_role_profiles:
        return jsonify({
            "error": "Selected role does not exist in job role profiles"
        }), 400

    uploaded_file = request.files["cv_file"]

    allowed_extensions = [".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg"]
    file_extension = os.path.splitext(uploaded_file.filename)[1].lower()

    if file_extension not in allowed_extensions:
        return jsonify({
            "error": "Only PDF, DOCX, TXT, PNG, and JPG files are allowed"
        }), 400

    file_path = os.path.join(UPLOAD_FOLDER, uploaded_file.filename)
    uploaded_file.save(file_path)

    try:
        cv_text, extraction = extract_text_from_file(file_path)
    except CVExtractionError as error:
        return jsonify({"error": str(error)}), 400

    if cv_text.strip() == "":
        return jsonify({
            "error": "Could not extract text from the uploaded CV"
        }), 400

    cv_data = build_cv_data_from_text(cv_text)
    cv_data["candidate_id"] = "LIVE_USER"
    cv_data["target_role"] = selected_role

    feature_row, comparison = build_feature_row(
        cv_data,
        selected_role,
        job_role_profiles
    )

    feature_df = pd.DataFrame([feature_row])

    predicted_score = score_model.predict(feature_df)[0]
    predicted_score = round(float(predicted_score), 2)

    predicted_level = get_level(predicted_score)

    recommendations = generate_recommendations(comparison)

    percentile = percentile_for_score(selected_role, predicted_score, score_distributions)

    return jsonify({
        "selected_role": selected_role,
        "predicted_score": predicted_score,
        "predicted_level": predicted_level,
        "percentile": percentile,
        "percentile_label": percentile_label(percentile),

        "extracted_skills": cv_data["cleaned_all_skills"],

        "matched_required_skills": comparison["matched_required_skills"],
        "matched_preferred_skills": comparison["matched_preferred_skills"],
        "missing_required_skills": comparison["missing_required_skills"],
        "missing_preferred_skills": comparison["missing_preferred_skills"],

        "required_match_ratio": round(comparison["required_match_ratio"], 2),
        "preferred_match_ratio": round(comparison["preferred_match_ratio"], 2),
        "project_match_ratio": round(comparison["project_match_ratio"], 2),

        "experience_months": cv_data["experience_months"],
        "experience_level": cv_data["experience_level"],
        "num_projects": cv_data["num_projects"],
        "num_certificates": cv_data["num_certificates"],
        "ats_quality_score": cv_data["evaluation_score"],

        "recommendations": recommendations,

        "extraction": extraction
    })


# ── Adapter endpoint for the Node backend ─────────────────────────────────────
# The backend sends JSON { cv_id, file_url, github_url } and expects a different
# response shape than /analyze-cv. This route downloads the CV from the signed
# URL, reuses the existing parsing + scoring, auto-ranks ALL roles (the backend
# sends no target_role), and returns the shape the backend/frontend expect.

# experience_level (Senior/Mid/Entry) -> frontend proficiency label
_LEVEL_LABEL = {"Senior": "Advanced", "Mid": "Intermediate", "Entry": "Beginner"}


def download_cv(file_url):
    """Download the CV from a (signed) URL to a temp file. Returns (path, ext)."""
    resp = requests.get(file_url, timeout=30)
    resp.raise_for_status()
    # extension from the URL path (ignore query string), default .pdf
    path_part = urllib.parse.urlparse(file_url).path.lower()
    ext = os.path.splitext(path_part)[1] or ".pdf"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    tmp.write(resp.content)
    tmp.close()
    return tmp.name, ext


_RESOLVABLE_EXTENSIONS = (".pdf", ".docx", ".txt", ".png", ".jpg", ".jpeg")


def _resolve_cv_text(body):
    """Resolve the CV text for /analyze.

    Prefers `cv_text` (already extracted by Module D's OCR pipeline at upload
    time, if that ran). Falls back to downloading `file_url` and extracting
    it with this module's own pipeline (pypdf/python-docx, plus its own OCR
    fallback for scanned/image content — see utils/ocr.py).
    Returns (cv_text, extraction_metadata, error_response_or_None).
    """
    cv_text = (body.get("cv_text") or "").strip()
    if cv_text:
        # Already extracted upstream (by Module D, before this ever reaches
        # Module C) — score what we received, don't claim to know how it
        # was extracted.
        return cv_text, {"method": "upstream", "quality": text_quality(cv_text)}, None

    file_url = body.get("file_url")
    if not file_url:
        return "", {"method": "none", "quality": 0.0}, (jsonify({"error": "cv_text or file_url is required"}), 400)

    try:
        path, ext = download_cv(file_url)
    except Exception as error:
        return "", {"method": "none", "quality": 0.0}, (jsonify({"error": f"Could not download CV: {error}"}), 400)

    try:
        if ext not in _RESOLVABLE_EXTENSIONS:
            return "", {"method": "none", "quality": 0.0}, None
        try:
            cv_text, extraction = extract_text_from_file(path)
            return cv_text, extraction, None
        except CVExtractionError as error:
            return "", {"method": "none", "quality": 0.0}, (jsonify({"error": str(error)}), 400)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


@app.route("/analyze", methods=["POST"])
def analyze_for_backend():
    """Adapter called by the Node backend. Input: { cv_id, cv_text?, file_url?, github_url }."""
    body = request.get_json(silent=True) or {}
    cv_text, extraction, error = _resolve_cv_text(body)
    if error:
        return error

    # Unreadable files -> graceful minimal response
    if cv_text.strip() == "":
        return jsonify({
            "extracted_skills": [],
            "github_verified": [],
            "ats_score": 0,
            "job_matches": [],
            "suggestions": [{
                "section": "general",
                "issue": "Could not read text from this CV.",
                "fix_example": "Upload a text-based PDF, DOCX, or TXT CV for full analysis.",
            }],
            "extraction": extraction,
        })

    cv_data = build_cv_data_from_text(cv_text)
    cv_data["candidate_id"] = "LIVE_USER"

    # 2. score the CV against EVERY role, keep the comparison for each
    ranked = []
    for role in job_role_profiles:
        cv_data["target_role"] = role
        feature_row, comparison = build_feature_row(cv_data, role, job_role_profiles)
        score = round(float(score_model.predict(pd.DataFrame([feature_row]))[0]), 2)
        ranked.append((role, score, comparison))
    ranked.sort(key=lambda r: r[1], reverse=True)

    best_cmp = ranked[0][2]

    # 3. map -> backend contract
    label = _LEVEL_LABEL.get(cv_data["experience_level"], "Intermediate")
    # matched_required_skills/matched_preferred_skills come back through
    # display_skill() (title-cased, e.g. "PyTorch"), while cleaned_all_skills
    # is the lowercase canonical form (e.g. "pytorch") — compare normalized
    # forms on both sides or this membership check never matches.
    matched_req = {normalize_skill(s) for s in best_cmp["matched_required_skills"]}
    matched_pref = {normalize_skill(s) for s in best_cmp["matched_preferred_skills"]}

    def confidence_for(skill):
        normalized = normalize_skill(skill)
        if normalized in matched_req:
            return 0.9
        if normalized in matched_pref:
            return 0.75
        return 0.6

    extracted_skills = [
        {"name": s, "proficiency_label": label, "confidence": confidence_for(s)}
        for s in cv_data["cleaned_all_skills"]
    ]

    job_matches = []
    for role, score, comparison in ranked[:5]:
        percentile = percentile_for_score(role, score, score_distributions)
        job_matches.append({
            "title": role,
            # honest label: these come from the 24 curated role blueprints,
            # not from live job postings
            "company": "Market blueprint",
            "match_pct": int(round(score)),
            "skill_gaps": comparison["missing_required_skills"],
            "percentile": percentile,
            "percentile_label": percentile_label(percentile),
        })

    suggestions = [
        {"section": "skills", "issue": rec["issue"], "fix_example": rec["fix_example"]}
        for rec in generate_recommendations_detailed(best_cmp)
    ]

    return jsonify({
        "extracted_skills": extracted_skills,
        "github_verified": [],                       # Module C has no GitHub feature
        "ats_score": int(round(cv_data["evaluation_score"])),
        "job_matches": job_matches,
        "suggestions": suggestions,
        "extraction": extraction,
    })


# ── Job-post comparison ───────────────────────────────────────────────────────

def _closest_role(job_skill_set):
    """Pick the role blueprint with the largest skill overlap with the job post."""
    best_role, best_overlap = None, 0
    for role, profile in job_role_profiles.items():
        profile_skills = {
            normalize_skill(s)
            for s in profile.get("required_skills", []) + profile.get("preferred_skills", [])
        }
        overlap = len(job_skill_set & profile_skills)
        if overlap > best_overlap:
            best_role, best_overlap = role, overlap
    return best_role


@app.route("/compare-job", methods=["POST"])
def compare_job():
    """Compare a CV against a real job posting.

    Input:  { cv_text, job_text }
    Output: matched/missing skills, match %, closest role blueprint, and the
            ML model's predicted readiness score for that role.
    """
    body = request.get_json(silent=True) or {}
    cv_text = (body.get("cv_text") or "").strip()
    job_text = (body.get("job_text") or "").strip()

    if not cv_text or not job_text:
        return jsonify({"error": "cv_text and job_text are required"}), 400

    cv_skills = {normalize_skill(s) for s in extract_skills_from_text(cv_text)}
    job_skills = {normalize_skill(s) for s in extract_skills_from_text(job_text)}

    if not job_skills:
        return jsonify({"error": "No recognisable skills found in the job post text."}), 422

    matched = sorted(cv_skills & job_skills)
    missing = sorted(job_skills - cv_skills)
    match_pct = int(round(100 * len(matched) / len(job_skills)))

    # Readiness prediction: score the CV against the closest role blueprint
    closest_role = _closest_role(job_skills)
    predicted_score, predicted_level, role_recommendations = None, None, []
    percentile, percentile_text = None, None
    if closest_role:
        cv_data = build_cv_data_from_text(cv_text)
        cv_data["candidate_id"] = "LIVE_USER"
        cv_data["target_role"] = closest_role
        feature_row, comparison = build_feature_row(cv_data, closest_role, job_role_profiles)
        predicted_score = round(float(score_model.predict(pd.DataFrame([feature_row]))[0]), 2)
        predicted_level = get_level(predicted_score)
        role_recommendations = generate_recommendations(comparison)
        percentile = percentile_for_score(closest_role, predicted_score, score_distributions)
        percentile_text = percentile_label(percentile)

    gap_recommendations = [
        f"Add or strengthen {display_skill(skill)} — it is required by this job post."
        for skill in missing[:5]
    ]

    return jsonify({
        "match_pct": match_pct,
        "matched_skills": [display_skill(s) for s in matched],
        "missing_skills": [display_skill(s) for s in missing],
        "job_skills": [display_skill(s) for s in sorted(job_skills)],
        "closest_role": closest_role,
        "predicted_score": predicted_score,
        "predicted_level": predicted_level,
        "percentile": percentile,
        "percentile_label": percentile_text,
        "recommendations": (gap_recommendations + role_recommendations)[:6],
    })


if __name__ == "__main__":
    app.run(debug=True, port=8003)