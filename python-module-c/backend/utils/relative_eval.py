"""Relative evaluation — how a candidate's score compares to other
applicants for the same role (feedback item: Relative Evaluation).

Looks up a live predicted_score against the historical distribution of
ground-truth final_score labels for that role (built by
../build_score_distributions.py from Phase 1's scored_training_dataset.csv),
not a model's predictions — so this stays valid across model versions.
"""

import os
import json
import bisect

DISTRIBUTIONS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "models",
    "role_score_distributions.json",
)

MIN_SAMPLES_FOR_PERCENTILE = 5


def load_score_distributions(path=DISTRIBUTIONS_PATH):
    if not os.path.exists(path):
        return {}

    with open(path, "r", encoding="utf-8") as file:
        data = json.load(file)

    return data.get("roles", {})


def percentile_for_score(role, score, distributions):
    """Percentage of historical candidates for `role` scoring at or below
    `score`. Returns None if the role is unknown or has too few samples.
    """
    role_data = distributions.get(role)

    if role_data is None:
        return None

    scores = role_data.get("scores", [])

    if len(scores) < MIN_SAMPLES_FOR_PERCENTILE:
        return None

    at_or_below = bisect.bisect_right(scores, score)

    return round(100 * at_or_below / len(scores))


def percentile_label(percentile):
    if percentile is None:
        return None

    return f"Scored higher than {percentile}% of candidates for this role"
