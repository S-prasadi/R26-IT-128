# topjobs.lk scraper

Collects IT job postings from topjobs.lk to grow the training dataset used by
`../models/CV_Job_Model (3).ipynb`. See `../../TRAINING_GUIDE.md` for how this
fits into the overall training pipeline.

## Why this exists

The notebook's job-posts dataset (`cleaned_job_posts_dataset.csv`) isn't
reproducible — it was uploaded by hand into Colab from an unknown original
source. This script is a repeatable replacement: point it at topjobs.lk and
it produces a CSV in the same 13-column format.

## What it does, and why it's more than a simple scraper

topjobs.lk's listing pages give title, company, location, and dates as plain
HTML — easy to scrape directly. But the actual job **description** on this
site is always a designed image per posting, not text (confirmed across
multiple postings/companies before writing this script). So for each listing,
this script also:

1. Follows the listing to its detail page and finds the ad image URL.
2. Downloads the image.
3. Runs OCR on it with EasyOCR (same library `python-module-d` uses for CV
   OCR — this script runs it in-process rather than calling module D's
   server, so it works as a standalone offline batch job).
4. Cleans the OCR text and extracts skills with this project's own
   `extract_skills_from_text` (`../utils/cv_parser.py`) — already generic,
   already used on non-CV text elsewhere in this codebase.
5. Guesses a `target_role` from the job title using a keyword list — topjobs'
   own categories are too broad (one category covers everything from QA to
   graphic design), so title keywords do better. Check `ROLE_KEYWORDS` in
   `scrape_topjobs.py` and extend it if you see a lot of postings falling
   through to the `Software Developer` default.

## Setup

```bash
cd python-module-c/backend/scraping
python3 -m venv venv        # a separate venv — EasyOCR pulls in torch (large)
source venv/bin/activate
pip install -r requirements.txt
```

Before running for real, open `scrape_topjobs.py` and replace the placeholder
email in `HEADERS["User-Agent"]` with your real contact — good etiquette for
any scraper, and the honest thing to do since no scraping-specific
permission was found on the site (also none forbidding it — see the caveat
below).

## Running

Start small — OCR is the slow part (each image takes several seconds on CPU):

```bash
python scrape_topjobs.py --limit-per-category 20 --out job_posts_raw.csv
```

Once you've confirmed the output looks right, raise `--limit-per-category`
and re-run — already-scraped jobs (by job code) are skipped automatically,
and downloaded images / OCR text are cached under `cache/`, so nothing is
re-fetched or re-OCR'd on a second run.

Output columns match `cleaned_job_posts_dataset.csv` exactly, so you can feed
`job_posts_raw.csv` straight into Step 3 of the notebook in place of the
uploaded file, or concatenate it with the original dataset for more rows.

## Known gaps

- `tags` is always empty — topjobs.lk doesn't expose a separate tag list the
  way the original dataset's `tags` column implies one existed; only
  `extracted_skills` (from OCR) is populated.
- OCR accuracy depends on how the employer designed their ad image — plain
  text-heavy flyers OCR well, heavily stylised graphics may lose some words.
  Spot-check a sample of `cleaned_description` values after a run.
- `target_role` is a keyword guess, not a verified label — review the
  distribution (`value_counts()` on that column) after scraping and adjust
  `ROLE_KEYWORDS` if one role is absorbing postings that don't belong.

## Politeness / legal note

No `robots.txt` and no explicit anti-scraping clause were found on
topjobs.lk at the time this was written, but no official Terms of Service
page confirming permission was found either — this is "nothing forbidding
it," not a confirmed green light. This script:

- Waits `REQUEST_DELAY_SECONDS` (2s) between every request.
- Identifies itself honestly via `User-Agent` with a contact email.
- Only reads publicly listed job postings (no login, no personal data).

Keep scrape volumes modest (this was designed for an academic dataset, not
bulk resale), and re-check the site's terms if you plan to scrape at a much
larger scale or on a recurring schedule.
