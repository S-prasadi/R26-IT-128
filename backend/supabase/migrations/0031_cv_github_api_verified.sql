-- Separates two different kinds of "verified skills" that were previously
-- both written into cvs.github_verified_skills by uncoordinated code paths:
--
--   github_verified_skills      (existing, 0013_cv.sql) -- Module C's CV
--                               analysis output. Keeps its original documented
--                               purpose.
--   github_api_verified_skills  (new)  -- derived from the real GitHub API by
--                               githubService.verifySkills(): language-byte
--                               share across the user's public repos.
--
-- Before this, githubService.verifySkills() and cvService.analyzeCV() both
-- wrote the same column, so whichever ran last silently won -- and one of the
-- two could be static mock data when the Python service was unreachable, with
-- no way for a reader to tell. See docs/skill-intelligence-gap-analysis.md §1.3.
--
-- Additive only: the existing column and its data are untouched.

alter table public.cvs
  add column if not exists github_api_verified_skills jsonb;

comment on column public.cvs.github_api_verified_skills is
  'Skills verified against the real GitHub API (githubService.verifySkills). Distinct from github_verified_skills, which holds Module C CV-analysis output.';
