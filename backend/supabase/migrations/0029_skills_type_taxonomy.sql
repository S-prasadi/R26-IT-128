-- Adds a second, independent classification axis to the skills catalog.
-- `category` (Frontend/Backend/DevOps/...) is a functional grouping and is
-- untouched. `type` answers a different question: is this a Technology, a
-- Tool, or a Competency? See docs/skill-forecasting-improvement-plan.md
-- Phase 4b for the full write-up this rule comes from.
--
--   technology  -- a specific named language, framework, database, runtime,
--                  or platform the application is built with or runs on
--                  (Python, React, PostgreSQL, Docker, AWS, TensorFlow...).
--   tool        -- a specific named product that supports building,
--                  testing, or operating the software, but isn't part of
--                  what ships (Jest, Selenium, Jenkins, Terraform, Figma...).
--   competency  -- a discipline or practice area, not a single named
--                  product (Machine Learning, System Design, Agile,
--                  Cybersecurity, REST API, Blockchain...).
--
-- Applied to every row already seeded by 0010_skills.sql and
-- 0025_expand_skills_catalog.sql. Any skill added after this migration
-- should set `type` at insert time; the default is intentionally NULL
-- (not guessed) so an unclassified row is visible, not silently technology.

alter table public.skills
  add column if not exists type text
  check (type is null or type in ('technology', 'tool', 'competency'));

update public.skills set type = 'technology' where name in (
  -- Languages
  'JavaScript', 'TypeScript', 'Python', 'Java', 'Rust', 'Go', 'C#', 'C++',
  'Kotlin', 'Swift', 'PHP', 'Ruby', 'Scala', 'Dart', 'R', 'Bash', 'SQL',
  'HTML', 'CSS', 'Sass',
  -- Frontend frameworks/libraries
  'React', 'Next.js', 'Angular', 'Vue.js', 'Svelte', 'Nuxt', 'Tailwind CSS',
  'Redux',
  -- Backend frameworks/runtimes
  'Node.js', 'Express.js', 'FastAPI', 'Spring Boot', '.NET', 'Django',
  'Flask', 'Laravel', 'Ruby on Rails', 'NestJS', 'Bun.js',
  -- Cloud/platforms/infra
  'AWS', 'GCP', 'Azure', 'Cloudflare', 'Vercel', 'Docker', 'Kubernetes',
  'Linux', 'Nginx',
  -- Databases
  'PostgreSQL', 'MongoDB', 'Redis', 'MySQL', 'SQLite', 'MariaDB',
  'DynamoDB', 'Cassandra', 'Elasticsearch', 'Neo4j',
  -- Data engineering platforms
  'Apache Spark', 'Apache Kafka', 'Apache Airflow', 'Hadoop', 'Snowflake',
  'Databricks',
  -- AI/ML libraries and APIs (the named products, not the discipline)
  'TensorFlow', 'PyTorch', 'LangChain', 'Scikit-learn', 'Pandas', 'NumPy',
  'Hugging Face', 'OpenAI API',
  -- Mobile
  'Flutter', 'React Native', 'Android', 'iOS', 'Xamarin',
  -- API technologies/protocols
  'GraphQL', 'gRPC', 'WebSockets', 'OAuth 2.0',
  -- Web3
  'Solidity'
);

update public.skills set type = 'tool' where name in (
  'Git', 'GitHub', 'GitLab', 'Webpack',
  'Terraform', 'Ansible', 'Jenkins', 'GitHub Actions', 'GitLab CI', 'Helm',
  'Argo CD',
  'dbt',
  'Tableau', 'Power BI', 'Looker',
  'Selenium', 'Playwright', 'Cypress', 'Jest', 'Pytest', 'JUnit', 'Postman',
  'Prometheus', 'Grafana', 'OpenTelemetry', 'Datadog',
  'Jira', 'Figma'
);

update public.skills set type = 'competency' where name in (
  'Machine Learning', 'REST API',
  'Microservices', 'System Design', 'Event-Driven Architecture',
  'CI/CD',
  'Deep Learning', 'Natural Language Processing', 'Computer Vision',
  'Large Language Models', 'MLOps',
  'Cybersecurity', 'Cloud Security', 'Application Security',
  'Penetration Testing', 'DevSecOps',
  'Agile', 'Scrum',
  'Blockchain'
);

-- Any row not covered above (future additions before this migration is
-- extended, or a name that doesn't exactly match) is left NULL on purpose --
-- visible via `where type is null`, not silently defaulted.
