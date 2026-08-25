const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
};

const PRESENT_WORDS = new Set(["present", "current", "currently", "ongoing", "now", "today"]);

/** Parses the free-form date strings Module D extracts per CV role (e.g.
 *  "Jan 2022", "2022-01", "March 2020", "Present") into a first-of-month Date. */
export function parseMonthYear(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (PRESENT_WORDS.has(s)) return new Date();

  let m = s.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, 1);

  m = s.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) return new Date(Number(m[2]), Number(m[1]) - 1, 1);

  m = s.match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (m && MONTH_NAMES[m[1]] !== undefined) return new Date(Number(m[2]), MONTH_NAMES[m[1]], 1);

  m = s.match(/^(\d{4})\s+([a-z]+)$/);
  if (m && MONTH_NAMES[m[2]] !== undefined) return new Date(Number(m[1]), MONTH_NAMES[m[2]], 1);

  m = s.match(/^(\d{4})$/);
  if (m) return new Date(Number(m[1]), 0, 1);

  return null;
}

/** Sums each role's month span. v1 simplification: no overlap de-duplication,
 *  so concurrent roles double-count — acceptable for a difficulty suggestion. */
export function computeExperienceMonths(
  entries: Array<{ start_date?: string | null; end_date?: string | null }> | null | undefined
): number | null {
  if (!entries || entries.length === 0) return null;
  let total = 0;
  let matched = false;
  for (const entry of entries) {
    const start = parseMonthYear(entry.start_date);
    if (!start) continue;
    const end = parseMonthYear(entry.end_date) ?? new Date();
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    if (months > 0) {
      total += months;
      matched = true;
    }
  }
  return matched ? total : null;
}

/** 1–5 difficulty suggestion from total experience. Centralized here so the
 *  thresholds are easy to retune later. */
export function monthsToDifficulty(months: number | null | undefined): number {
  if (months == null) return 3;
  if (months < 12) return 1;
  if (months < 24) return 2;
  if (months < 48) return 3;
  if (months < 84) return 4;
  return 5;
}

export function monthsToLevelLabel(months: number | null | undefined): string | null {
  if (months == null) return null;
  if (months < 12) return "Entry-level";
  if (months < 24) return "Junior";
  if (months < 48) return "Mid-level";
  if (months < 84) return "Senior";
  return "Lead / Staff";
}
