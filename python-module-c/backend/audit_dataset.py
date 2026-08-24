"""Audit Module C dataset integrity and target leakage."""

import argparse
import hashlib
import json
import os
from collections import Counter

import pandas as pd


BASE = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(BASE, "Dataset", "combined_resumes.json")
SCORED_PATH = os.path.join(BASE, "Dataset", "scored_training_dataset.csv")
REQUIRED_FIELDS = {
    "candidate_id", "target_role", "all_skills",
    "projects_and_technologies_involved", "certificates_or_qualifications",
    "experience_months", "evaluation_score",
}


def _sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _formula_score(row):
    skill = row.required_match_ratio * 40 + row.preferred_match_ratio * 10
    projects = row.project_match_ratio * 15 + min(row.num_projects / 3, 1) * 5
    experience = min(row.experience_months / 24, 1) * 15
    certificates = min(row.num_certificates / 5, 1) * 10
    ats = min(row.ats_quality_score, 100) / 100 * 5
    return round(skill + projects + experience + certificates + ats, 2)


def run_audit():
    with open(DATASET_PATH, "r", encoding="utf-8") as file:
        records = json.load(file)
    scored = pd.read_csv(SCORED_PATH)
    ids = [record.get("candidate_id") for record in records]
    duplicate_ids = sorted(
        candidate_id for candidate_id, count in Counter(ids).items() if count > 1
    )
    role_counts = Counter(record.get("target_role", "") for record in records)
    recomputed = scored.apply(_formula_score, axis=1)

    return {
        "source_records": len(records),
        "scored_rows": len(scored),
        "row_count_matches": len(records) == len(scored),
        "source_sha256": _sha256(DATASET_PATH),
        "missing_required_fields": sorted(REQUIRED_FIELDS - set(records[0])) if records else sorted(REQUIRED_FIELDS),
        "duplicate_candidate_ids": duplicate_ids,
        "role_count": len(role_counts),
        "small_roles": {role: count for role, count in sorted(role_counts.items()) if count < 5},
        "target_recomputed_from_features": bool((recomputed == scored.final_score.round(2)).all()),
        "target_is_independent_external_outcome": False,
    }


def main():
    parser = argparse.ArgumentParser(description="Audit Module C dataset integrity")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = run_audit()
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for key, value in result.items():
            print(f"{key}: {value}")
        print("external_accuracy_claim: NOT VALIDATED")

    passed = (
        result["row_count_matches"]
        and not result["missing_required_fields"]
        and not result["duplicate_candidate_ids"]
        and result["target_recomputed_from_features"]
    )
    raise SystemExit(0 if passed else 1)


if __name__ == "__main__":
    main()