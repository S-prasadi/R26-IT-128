"""
Kaggle Resume Dataset Downloader — Component 2: Career Pathway Predictor
Downloads publicly available resume datasets from Kaggle as supplementary data.

Datasets used:
  - "liveupx/resume-dataset"        (~2,400 resumes with categories)
  - "gauravduttakiit/resume-dataset" (skills + job categories)

These provide global IT career data. The career_sequence_builder.py will
filter and augment them toward Sri Lankan IT context.

Setup:
  pip install kaggle
  Place your kaggle.json at ~/.kaggle/kaggle.json
  (Download from: https://www.kaggle.com/settings → API → Create New Token)
"""

import json
import logging
import subprocess
import zipfile
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

OUTPUT_DIR = Path(__file__).parent.parent / "data" / "raw" / "kaggle_resumes"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

DATASETS = [
    {
        "handle": "liveupx/resume-dataset",
        "description": "2400 resumes with categories and skills",
    },
    {
        "handle": "gauravduttakiit/resume-dataset",
        "description": "Resume dataset with job category labels",
    },
    {
        "handle": "snehaanbhawal/resume-dataset",
        "description": "Resume text dataset for NLP",
    },
]


def download_dataset(handle: str, dest: Path) -> bool:
    subfolder = dest / handle.replace("/", "_")
    if subfolder.exists() and any(subfolder.iterdir()):
        log.info("Already downloaded: %s — skipping", handle)
        return True

    subfolder.mkdir(parents=True, exist_ok=True)
    log.info("Downloading: %s", handle)

    result = subprocess.run(
        ["kaggle", "datasets", "download", "-d", handle, "-p", str(subfolder), "--unzip"],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        log.error("Failed to download %s:\n%s", handle, result.stderr)
        return False

    log.info("Downloaded %s to %s", handle, subfolder)
    return True


def list_downloaded_files() -> list[Path]:
    return list(OUTPUT_DIR.rglob("*.csv")) + list(OUTPUT_DIR.rglob("*.json"))


def check_kaggle_api():
    try:
        result = subprocess.run(["kaggle", "--version"], capture_output=True, text=True)
    except FileNotFoundError:
        print("\nKaggle CLI not installed. Run:")
        print("  pip install kaggle")
        print("\nThen set up credentials:")
        print("  1. Go to https://www.kaggle.com/settings")
        print("  2. API section -> Create New Token -> downloads kaggle.json")
        print(r"  3. Place kaggle.json at: C:\Users\<YourName>\.kaggle\kaggle.json")
        return False

    if result.returncode != 0:
        print("\nKaggle CLI error:", result.stderr)
        return False

    kaggle_dir = Path.home() / ".kaggle" / "kaggle.json"
    if not kaggle_dir.exists():
        print(f"\nKaggle credentials not found at {kaggle_dir}")
        print("Download kaggle.json from https://www.kaggle.com/settings → API")
        return False

    return True


def main():
    if not check_kaggle_api():
        return

    log.info("Downloading %d resume datasets from Kaggle...", len(DATASETS))
    success = 0
    for ds in DATASETS:
        if download_dataset(ds["handle"], OUTPUT_DIR):
            success += 1

    files = list_downloaded_files()
    log.info("Done. %d/%d datasets downloaded. %d data files available.",
             success, len(DATASETS), len(files))

    for f in files:
        log.info("  %s", f.relative_to(OUTPUT_DIR))


if __name__ == "__main__":
    main()
