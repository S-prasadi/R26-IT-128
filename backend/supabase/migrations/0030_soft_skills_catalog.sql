-- Seeds the master catalog with soft skills -- the review's Area 5 asked for
-- Technical vs. Soft skill separation, and until now there were literally
-- zero soft skills anywhere in the catalog to separate (see
-- docs/skill-forecasting-review-report.md, Area 5). These fit directly into
-- the Technology/Tool/Competency axis added in 0029_skills_type_taxonomy.sql:
-- every soft skill here is a discipline, not a single named product, so
-- type='competency' throughout. category='Soft Skills' is a new functional
-- grouping value -- `category` has no check constraint, so no schema change
-- is needed beyond the insert.
--
-- This seeds the catalog only. It does not, by itself, produce any forecast
-- data for these skills -- that requires a real text data source Module A
-- doesn't have yet (see Phase 5 in docs/skill-forecasting-improvement-plan.md
-- for what's built and what's intentionally stubbed pending that source).
-- Users can add these to their profile and log assessments against them
-- immediately; forecast cards for them will simply have no data to show,
-- same as any tracked skill with no forecast history.

insert into public.skills (name, category, description, type) values
  ('Communication',         'Soft Skills', 'Clearly conveying information, written and verbal', 'competency'),
  ('Teamwork',               'Soft Skills', 'Working effectively as part of a group', 'competency'),
  ('Leadership',             'Soft Skills', 'Guiding and motivating others toward a goal', 'competency'),
  ('Problem Solving',        'Soft Skills', 'Identifying issues and working through solutions', 'competency'),
  ('Time Management',        'Soft Skills', 'Prioritizing and completing work within deadlines', 'competency'),
  ('Adaptability',           'Soft Skills', 'Adjusting effectively to change and new situations', 'competency'),
  ('Critical Thinking',      'Soft Skills', 'Objectively analyzing and evaluating information', 'competency'),
  ('Collaboration',          'Soft Skills', 'Working jointly with others across roles or teams', 'competency'),
  ('Interpersonal Skills',   'Soft Skills', 'Building and maintaining effective working relationships', 'competency'),
  ('Creativity',             'Soft Skills', 'Generating novel ideas and approaches', 'competency'),
  ('Work Ethic',             'Soft Skills', 'Reliability, diligence, and accountability in work', 'competency'),
  ('Emotional Intelligence', 'Soft Skills', 'Recognizing and managing one''s own and others'' emotions', 'competency')
on conflict (name) do nothing;
