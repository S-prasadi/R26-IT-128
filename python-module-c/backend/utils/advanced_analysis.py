"""Deterministic, explainable CV analysis (deliberately contains no ATS logic)."""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone

from .cv_parser import SKILL_ALIASES, SECTION_HEADERS
from .scoring import display_skill, normalize_skill

SCHEMA_VERSION = "2.0"
SCORING_VERSION = "cv-quality-2.0"
MODEL_VERSION = "deterministic-evidence-1.0"

NEGATION = re.compile(r"\b(no|not|never|without|lack(?:ing|s|ed)?|unfamiliar with|no experience (?:in|with))\b", re.I)
YEAR = re.compile(r"\b(?:19|20)\d{2}\b")
DATE_RANGE = re.compile(r"((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2}|present|current|now)", re.I)
QUANTIFIED = re.compile(r"(?:\b\d+(?:\.\d+)?\s*(?:%|x|k|m|million|users?|clients?|hours?|days?)\b|[$£€]\s*\d+)", re.I)
ACTION_VERBS = re.compile(r"\b(built|created|developed|designed|implemented|led|delivered|improved|reduced|increased|automated|optimised|optimized|launched|engineered|managed|migrated|deployed)\b", re.I)
WEAK_START = re.compile(r"^\s*(worked on|helped|responsible for|participated in|involved in|did|made)\b", re.I)
UNSAFE_ALIASES = {"analysis", "analytical", "validation", "dashboard", "dashboards", "reports", "queries",
                  "accurate", "insights", "prediction", "notebook", "api", "ml", "js", "ts"}

SECTION_MAP = {
    "summary": "summary", "profile": "summary",
    "work experience": "experience", "experience": "experience",
    "professional experience": "experience", "employment history": "experience",
    "work history": "experience", "career history": "experience",
    "projects": "projects", "project experience": "projects",
    "education": "education", "academic background": "education",
    "technical skills": "skills", "skills": "skills", "soft skills": "skills",
    "certifications": "certifications", "certificates": "certifications",
    "licenses": "certifications", "licences": "certifications",
}


def _normal(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9+#.\-\s]", " ", (text or "").lower())).strip()


def section_lines(text: str) -> list[dict]:
    """Return non-header lines with stable section and entry references."""
    current = "general"
    counters: dict[str, int] = {}
    result = []
    known = {_normal(h): h for h in SECTION_HEADERS}
    for raw in (text or "").splitlines():
        line = raw.strip(" \t•*-–")
        if not line:
            continue
        header = known.get(_normal(line).rstrip(":"))
        if header:
            current = SECTION_MAP.get(header, "general")
            continue
        prefix = re.match(r"^(summary|experience|education|skills|project|projects|certifications?)\s*:\s*(.*)$", line, re.I)
        if prefix:
            current = SECTION_MAP.get(prefix.group(1).lower(), "projects" if prefix.group(1).lower() == "project" else prefix.group(1).lower())
            line = prefix.group(2).strip()
            if not line:
                continue
        index = counters.get(current, 0)
        counters[current] = index + 1
        result.append({"section": current, "entry_reference": f"{current}:{index}", "text": line})
    return result


def _alias_pattern(alias: str):
    normalized = _normal(alias).replace(".", r"\.")
    # Avoid dangerous one-character/broad aliases unless their canonical form is explicit.
    if len(normalized) < 2 or _normal(alias) in UNSAFE_ALIASES:
        return None
    return re.compile(r"(?<![a-z0-9+#])" + re.escape(_normal(alias)) + r"(?![a-z0-9+#])", re.I)


def _evidence_type(section: str) -> str:
    return {"experience": "professional", "projects": "project", "education": "education", "skills": "claimed"}.get(section, "contextual")


def _years_from_text(lines: list[str]) -> tuple[float, str | None]:
    total = 0.0
    latest = None
    current_year = datetime.now(timezone.utc).year
    for line in lines:
        for start, end in DATE_RANGE.findall(line):
            end_year = current_year if end.lower() in ("present", "current", "now") else int(end)
            total += max(0, min(15, end_year - int(start)))
            latest = str(max(int(latest or 0), end_year))
        years = [int(y) for y in YEAR.findall(line)]
        if years:
            latest = str(max(int(latest or 0), max(years)))
    return round(min(total, 20), 1), latest


def extract_skill_evidence(text: str) -> list[dict]:
    lines = section_lines(text)
    skills = []
    for canonical, aliases in SKILL_ALIASES.items():
        evidence = []
        for item in lines:
            normalized = _normal(item["text"])
            raw_lower = item["text"].lower()
            matched = False
            for alias in aliases:
                pattern = _alias_pattern(alias)
                match = pattern.search(normalized) if pattern else None
                if not match:
                    continue
                raw_index = raw_lower.find(alias.lower())
                if raw_index >= 0:
                    sentence_start = max(raw_lower.rfind(".", 0, raw_index), raw_lower.rfind(";", 0, raw_index), raw_lower.rfind(":", 0, raw_index)) + 1
                    context = raw_lower[sentence_start:raw_index + len(alias)]
                else:
                    context = normalized[max(0, match.start() - 35):match.end()]
                if NEGATION.search(context):
                    continue
                matched = True
                break
            if matched:
                ev_type = _evidence_type(item["section"])
                confidence = {"professional": .94, "project": .86, "education": .72, "claimed": .55, "contextual": .62}[ev_type]
                evidence.append({**item, "type": ev_type, "confidence": confidence})
        if not evidence:
            continue
        years, last_used = _years_from_text([e["text"] for e in evidence if e["type"] == "professional"])
        types = {e["type"] for e in evidence}
        depth = min(1.0, .25 * len(evidence) + (.35 if "professional" in types else 0) + (.2 if "project" in types else 0) + min(years, 5) * .06)
        proficiency = "Advanced" if depth >= .8 else "Intermediate" if depth >= .5 else "Beginner"
        confidence = round(min(.98, sum(e["confidence"] for e in evidence) / len(evidence) + min(len(evidence) - 1, 3) * .03), 2)
        skills.append({
            "name": display_skill(canonical), "normalized_name": normalize_skill(canonical),
            "proficiency": proficiency, "proficiency_label": proficiency,
            "confidence": confidence, "years_used": years, "last_used": last_used,
            "evidence": evidence[:8],
        })
    return sorted(skills, key=lambda s: (-s["confidence"], s["name"]))


def component_scores(text: str, skills: list[dict]) -> dict:
    lines = section_lines(text)
    sections = {x["section"] for x in lines}
    meaningful = [x["text"] for x in lines if len(x["text"].split()) >= 4]
    quantified = sum(bool(QUANTIFIED.search(x)) for x in meaningful)
    action = sum(bool(ACTION_VERBS.search(x)) for x in meaningful)
    professional = sum(any(e["type"] == "professional" for e in s["evidence"]) for s in skills)
    evidenced = sum(any(e["type"] in ("professional", "project") for e in s["evidence"]) for s in skills)
    completeness = 20 * sum(s in sections for s in ("summary", "experience", "education", "skills", "projects"))
    content = min(100, round(35 + min(len(meaningful), 20) * 2 + (action / max(1, len(meaningful))) * 25))
    achievement = min(100, round(15 + (quantified / max(1, len(meaningful))) * 85))
    skill_evidence = min(100, round((evidenced / max(1, len(skills))) * 100)) if skills else 0
    experience = min(100, round(20 + min(professional, 8) * 8 + min(action, 5) * 3)) if "experience" in sections else 0
    return {"content_quality": content, "achievement_strength": achievement, "completeness": completeness,
            "skill_evidence": skill_evidence, "experience_quality": experience}


def recommendations(text: str) -> list[dict]:
    recs = []
    seen_text = set()
    for item in section_lines(text):
        line = item["text"]
        issue = explanation = rewrite = None
        impact = 2
        if item["section"] in ("experience", "projects") and WEAK_START.search(line):
            issue = "Weak or passive opening"
            explanation = "Lead with a specific action to make ownership clear."
            rewrite = WEAK_START.sub("Delivered", line, count=1)
            impact = 4
        elif item["section"] in ("experience", "projects") and len(line.split()) >= 7 and not QUANTIFIED.search(line):
            issue = "Outcome is not measurable"
            explanation = "Add a truthful metric, scale, time saving, quality improvement, or user impact."
            rewrite = ""
            impact = 4
        elif len(line.split()) > 40:
            issue = "Sentence is difficult to scan"
            explanation = "Split this into concise statements with one outcome each."
            rewrite = ""
        elif line.lower() in seen_text:
            issue = "Repeated content"
            explanation = "Remove or consolidate duplicate information."
            rewrite = ""
        seen_text.add(line.lower())
        if issue:
            stable = hashlib.sha1(f'{item["entry_reference"]}:{issue}:{line}'.encode()).hexdigest()[:16]
            recs.append({"id": stable, "priority": "high" if impact >= 4 else "medium", **item,
                         "original_text": line, "issue": issue, "explanation": explanation,
                         "suggested_rewrite": rewrite, "fix_example": rewrite, "estimated_impact": impact,
                         "source": "deterministic", "status": "pending", "rewrite_status": "available" if rewrite else "not_generated"})
    return recs[:15]


def analyze_quality(text: str) -> dict:
    skills = extract_skill_evidence(text)
    scores = component_scores(text, skills)
    overall = round(sum(scores.values()) / len(scores))
    limitations = ["Proficiency is estimated from evidence in the CV and is not an independent certification."]
    if not skills:
        limitations.append("No supported skills were detected; review the extracted CV text.")
    return {"schema_version": SCHEMA_VERSION, "analysis_mode": "deterministic", "scoring_version": SCORING_VERSION,
            "model_version": MODEL_VERSION, "overall_score": overall, "component_scores": scores,
            "extracted_skills": skills, "suggestions": recommendations(text), "recommendations": recommendations(text),
            "limitations": limitations, "github_verified": []}


def _ratio(found: set, expected: set) -> float:
    return len(found & expected) / len(expected) if expected else 1.0


def rank_blueprints(text: str, profiles: dict, limit: int = 5) -> list[dict]:
    analysis = analyze_quality(text)
    found = {s["normalized_name"] for s in analysis["extracted_skills"]}
    evidence = {s["normalized_name"]: s for s in analysis["extracted_skills"]}
    ranked = []
    for role, profile in profiles.items():
        required = {normalize_skill(x) for x in profile.get("required_skills", [])}
        preferred = {normalize_skill(x) for x in profile.get("preferred_skills", [])}
        req = _ratio(found, required)
        pref = _ratio(found, preferred)
        supported = found & (required | preferred)
        ev = sum(evidence[x]["confidence"] for x in supported) / len(supported) if supported else 0
        score = round(100 * (.65 * req + .2 * pref + .15 * ev))
        missing = sorted(required - found)
        ranked.append({"title": role, "company": "Market blueprint", "source_type": "blueprint", "match_pct": score,
                       "skill_gaps": [display_skill(x) for x in missing], "matched_requirements": [display_skill(x) for x in sorted(required & found)],
                       "missing_requirements": [display_skill(x) for x in missing],
                       "score_breakdown": {"required_skills": round(req * 100), "preferred_skills": round(pref * 100), "skill_evidence": round(ev * 100)},
                       "explanations": [f"Matched {len(required & found)} of {len(required)} required skills."]})
    return sorted(ranked, key=lambda x: x["match_pct"], reverse=True)[:limit]


def parse_job_requirements(job_text: str) -> dict:
    lines = section_lines(job_text) or [{"text": x.strip()} for x in job_text.splitlines() if x.strip()]
    required, preferred, responsibilities = set(), set(), []
    job_skill_lines = re.sub(r"[.;]", "\n", job_text)
    all_skills = extract_skill_evidence("Skills\n" + job_skill_lines)
    for skill in all_skills:
        occurrences = " ".join(e["text"] for e in skill["evidence"]).lower()
        target = preferred if re.search(r"\b(preferred|nice to have|bonus|desirable)\b", occurrences) else required
        target.add(skill["normalized_name"])
    for item in lines:
        if re.search(r"\b(responsib|you will|duties|develop|design|manage|lead|build)\b", item["text"], re.I):
            responsibilities.append(item["text"])
    exp = re.search(r"(\d+)\+?\s*(?:-|to\s*\d+\s*)?years?", job_text, re.I)
    min_years = int(exp.group(1)) if exp else 0
    mandatory = bool(re.search(r"\b(must|required|mandatory|minimum)\b", job_text, re.I))
    return {"required_skills": sorted(required - preferred), "preferred_skills": sorted(preferred),
            "responsibilities": responsibilities[:10], "minimum_experience_years": min_years,
            "education": [], "certifications": [], "domain_knowledge": [], "soft_skills": [], "has_mandatory_requirements": mandatory}


def compare_job_advanced(cv_text: str, job_text: str) -> dict:
    analysis = analyze_quality(cv_text)
    reqs = parse_job_requirements(job_text)
    skills = {s["normalized_name"]: s for s in analysis["extracted_skills"]}
    found = set(skills)
    required, preferred = set(reqs["required_skills"]), set(reqs["preferred_skills"])
    req_score, pref_score = _ratio(found, required), _ratio(found, preferred)
    years = max((s["years_used"] for s in skills.values()), default=0)
    exp_score = min(1, years / reqs["minimum_experience_years"]) if reqs["minimum_experience_years"] else 1
    evidence_score = sum(skills[s]["confidence"] for s in found & (required | preferred)) / max(1, len(found & (required | preferred)))
    responsibility_score = min(1, len(found & required) / max(1, len(required)))
    breakdown = {"required_skills": round(req_score * 35, 1), "preferred_skills": round(pref_score * 15, 1),
                 "relevant_experience": round(exp_score * 20, 1), "responsibility_similarity": round(responsibility_score * 10, 1),
                 "skill_evidence_recency": round(evidence_score * 10, 1), "education_certifications": 5.0, "domain_relevance": round(responsibility_score * 5, 1)}
    score = sum(breakdown.values())
    blockers = []
    if reqs["minimum_experience_years"] and years < reqs["minimum_experience_years"]:
        blockers.append(f"Requires {reqs['minimum_experience_years']} years; CV evidence shows approximately {years:g} years.")
    if required and req_score < .5 and reqs["has_mandatory_requirements"]:
        blockers.append("Fewer than half of the required skills have supporting CV evidence.")
    score = round(max(0, score - 10 * len(blockers)))
    missing = sorted(required - found)
    return {"schema_version": SCHEMA_VERSION, "analysis_mode": "deterministic", "match_pct": score,
            "requirements": reqs, "score_breakdown": breakdown, "mandatory_blockers": blockers,
            "matched_skills": [display_skill(x) for x in sorted(required & found)], "missing_skills": [display_skill(x) for x in missing],
            "partially_supported_skills": [], "job_skills": [display_skill(x) for x in sorted(required | preferred)],
            "evidence": [skills[x] for x in sorted(found & (required | preferred))],
            "explanations": [f"Matched {len(required & found)} of {len(required)} required skills.", *blockers],
            "recommendations": [f"Add truthful evidence for {display_skill(x)} if you have used it." for x in missing[:5]],
            "limitations": analysis["limitations"]}
