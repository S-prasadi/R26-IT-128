import json
import os
import re

import requests

# Local Ollama runtime — a shared piece of infrastructure on this machine,
# not a call to Module D's API. Module D happens to use the same model tag
# independently; this module knows nothing about Module D's existence.
_OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
_OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma4:12b")

# Warm-cache calls measured at ~1.6s on this machine; a cold model load can
# add ~12-15s on top of that (first call after Ollama has been idle). This
# timeout covers a cold-load-plus-generate call with real margin.
_REQUEST_TIMEOUT = 45

# CVs are realistically 1-3 pages. A generous character cap avoids needing
# multi-chunk-and-merge machinery that would be disproportionate complexity
# for content this short — documented tradeoff, not a silent truncation bug.
_MAX_INPUT_CHARS = 12000

SECTION_KEYS = ("summary", "experience", "education", "skills", "projects", "certifications")

_PROMPT_TEMPLATE = """You are a CV/resume parser. Split the following resume text into sections and return ONLY a JSON object (no markdown, no commentary) with exactly these keys: {keys}. Each value must be a string containing the original text belonging to that section, or an empty string "" if the resume has no such section. Do not summarize, translate, or rephrase — copy the original text verbatim into the right bucket, including a "\\n" between every original line exactly where the source has a line break (e.g. between each bullet point, and between an entry's title line and its description) — do not merge separate lines into one. Group any content that doesn't fit these categories under "summary".

Resume text:
---
{text}
---

JSON:"""


def _call_ollama(prompt):
    response = requests.post(
        f"{_OLLAMA_BASE_URL}/api/generate",
        json={"model": _OLLAMA_MODEL, "prompt": prompt, "stream": False, "format": "json"},
        timeout=_REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return response.json().get("response", "")


def _parse_llm_json(raw):
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        match = re.search(r"\{.*\}", raw or "", re.DOTALL)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return None

    if not isinstance(data, dict):
        return None

    sections = {}
    for key in SECTION_KEYS:
        value = data.get(key, "")
        if not isinstance(value, str):
            return None
        if value.strip():
            sections[key] = value.strip()

    return sections


def warm_up():
    """Force Ollama to load the model into memory now, instead of on the
    first real request. Uses a minimal prompt (num_predict=1) so it pays
    the model-load cost without spending time on real generation.
    Best-effort — a failure here just means the first real request pays
    the cold-load cost instead of a crash."""
    try:
        requests.post(
            f"{_OLLAMA_BASE_URL}/api/generate",
            json={"model": _OLLAMA_MODEL, "prompt": "Hi", "stream": False, "options": {"num_predict": 1}},
            timeout=_REQUEST_TIMEOUT,
        )
    except Exception:
        pass


def structure_sections(text):
    """Ask the local Ollama model to split CV text into sections.

    Returns a dict (possibly empty if the CV genuinely has no recognizable
    sections) on success, or None if Ollama is unreachable or returns
    invalid output twice — callers should fall back to their own
    regex-based splitting on None. Never raises.
    """
    text = (text or "").strip()
    if not text:
        return None

    prompt = _PROMPT_TEMPLATE.format(keys=", ".join(SECTION_KEYS), text=text[:_MAX_INPUT_CHARS])

    for attempt in range(2):
        try:
            raw = _call_ollama(prompt)
        except Exception:
            return None  # unreachable / timed out — no point retrying

        sections = _parse_llm_json(raw)
        if sections is not None:
            return sections

        if attempt == 0:
            prompt = prompt + "\n\nReturn ONLY valid JSON, nothing else."

    return None
