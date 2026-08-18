-- Module C's CV analysis now returns a `percentile`/`percentile_label` on
-- /analyze and /analyze-cv: how a candidate's score compares to other
-- historical applicants for the same role, not just the isolated score
-- already stored in match_score / cv_job_matches.match_pct.
--
-- Additive only: existing columns and data are untouched.

alter table public.cvs
  add column if not exists percentile int check (percentile between 0 and 100),
  add column if not exists percentile_label text;

comment on column public.cvs.percentile is
  'Overall relative-evaluation percentile from Module C: average across the top-3 job_matches percentiles, same aggregation as match_score.';
comment on column public.cvs.percentile_label is
  'Human-readable percentile sentence, taken verbatim from the #1 (highest match_pct) job match Module C returned.';

alter table public.cv_job_matches
  add column if not exists percentile float check (percentile between 0 and 100),
  add column if not exists percentile_label text;

comment on column public.cv_job_matches.percentile is
  'Per-role relative-evaluation percentile from Module C, alongside match_pct.';
comment on column public.cv_job_matches.percentile_label is
  'Human-readable percentile sentence for this specific role, from Module C.';
