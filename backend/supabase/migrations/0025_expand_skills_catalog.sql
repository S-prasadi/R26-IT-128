-- Expand the master catalog with current engineering, data, AI, security,
-- quality, and collaboration skills. This is intentionally a new migration:
-- existing user_skills rows keep their skill IDs, while new and existing
-- environments receive the same additions.

insert into public.skills (name, category, description) values
  -- Frontend
  ('Angular', 'Frontend', 'Component-based web application framework'),
  ('Vue.js', 'Frontend', 'Progressive JavaScript UI framework'),
  ('Svelte', 'Frontend', 'Compiler-based UI framework'),
  ('Nuxt', 'Frontend', 'Full-stack framework for Vue applications'),
  ('HTML', 'Frontend', 'Standard markup language for web pages'),
  ('CSS', 'Frontend', 'Style sheet language for web interfaces'),
  ('Sass', 'Frontend', 'CSS preprocessor with reusable language features'),
  ('Tailwind CSS', 'Frontend', 'Utility-first CSS framework'),
  ('Redux', 'Frontend', 'Predictable state-management library'),
  ('Webpack', 'Frontend', 'JavaScript module bundler'),

  -- Backend and programming languages
  ('C#', 'Languages', 'General-purpose language for the .NET ecosystem'),
  ('C++', 'Languages', 'High-performance general-purpose language'),
  ('Kotlin', 'Languages', 'Modern JVM and Android programming language'),
  ('Swift', 'Languages', 'Programming language for Apple platforms'),
  ('PHP', 'Languages', 'Server-side web programming language'),
  ('Ruby', 'Languages', 'Dynamic general-purpose programming language'),
  ('Scala', 'Languages', 'Functional and object-oriented JVM language'),
  ('Dart', 'Languages', 'Language used by Flutter applications'),
  ('R', 'Languages', 'Language for statistics and data analysis'),
  ('Bash', 'Languages', 'Shell scripting and automation language'),
  ('.NET', 'Backend', 'Cross-platform application development platform'),
  ('Django', 'Backend', 'Batteries-included Python web framework'),
  ('Flask', 'Backend', 'Lightweight Python web framework'),
  ('Laravel', 'Backend', 'PHP web application framework'),
  ('Ruby on Rails', 'Backend', 'Convention-oriented Ruby web framework'),
  ('NestJS', 'Backend', 'Structured Node.js server framework'),
  ('Microservices', 'Architecture', 'Independently deployable service architecture'),
  ('System Design', 'Architecture', 'Design of scalable and reliable software systems'),
  ('Event-Driven Architecture', 'Architecture', 'Architecture based on asynchronous events'),

  -- Cloud and platform engineering
  ('Azure', 'Cloud', 'Microsoft cloud computing platform'),
  ('Cloudflare', 'Cloud', 'Edge, networking, and application security platform'),
  ('Vercel', 'Cloud', 'Cloud platform for web application delivery'),
  ('Terraform', 'DevOps', 'Infrastructure-as-code provisioning tool'),
  ('Ansible', 'DevOps', 'Configuration management and automation tool'),
  ('Jenkins', 'DevOps', 'Automation server for CI/CD pipelines'),
  ('GitHub Actions', 'DevOps', 'Repository-integrated CI/CD automation'),
  ('GitLab CI', 'DevOps', 'GitLab continuous integration and delivery'),
  ('CI/CD', 'DevOps', 'Continuous integration and delivery practices'),
  ('Linux', 'DevOps', 'Open-source operating system ecosystem'),
  ('Nginx', 'DevOps', 'Web server and reverse proxy'),
  ('Helm', 'DevOps', 'Package manager for Kubernetes'),
  ('Argo CD', 'DevOps', 'GitOps continuous delivery for Kubernetes'),

  -- Databases and data engineering
  ('MySQL', 'Database', 'Open-source relational database'),
  ('SQLite', 'Database', 'Embedded relational database'),
  ('MariaDB', 'Database', 'Community-developed relational database'),
  ('DynamoDB', 'Database', 'AWS managed key-value database'),
  ('Cassandra', 'Database', 'Distributed wide-column database'),
  ('Elasticsearch', 'Database', 'Distributed search and analytics engine'),
  ('Neo4j', 'Database', 'Native graph database'),
  ('Apache Spark', 'Data Engineering', 'Distributed data-processing engine'),
  ('Apache Kafka', 'Data Engineering', 'Distributed event-streaming platform'),
  ('Apache Airflow', 'Data Engineering', 'Workflow orchestration platform'),
  ('Hadoop', 'Data Engineering', 'Distributed big-data storage and processing'),
  ('dbt', 'Data Engineering', 'SQL-based analytics transformation tool'),
  ('Snowflake', 'Data Engineering', 'Cloud data warehouse platform'),
  ('Databricks', 'Data Engineering', 'Lakehouse data and AI platform'),

  -- AI and analytics
  ('Deep Learning', 'AI/ML', 'Neural-network-based machine learning'),
  ('Natural Language Processing', 'AI/ML', 'Machine understanding of human language'),
  ('Computer Vision', 'AI/ML', 'Machine understanding of images and video'),
  ('Scikit-learn', 'AI/ML', 'Python machine-learning library'),
  ('Pandas', 'AI/ML', 'Python data analysis library'),
  ('NumPy', 'AI/ML', 'Numerical computing library for Python'),
  ('Hugging Face', 'AI/ML', 'Open model and machine-learning ecosystem'),
  ('Large Language Models', 'AI/ML', 'Development with generative language models'),
  ('MLOps', 'AI/ML', 'Operational practices for machine-learning systems'),
  ('OpenAI API', 'AI/ML', 'API platform for building AI applications'),
  ('Tableau', 'Analytics', 'Business intelligence and visualization platform'),
  ('Power BI', 'Analytics', 'Microsoft business intelligence platform'),
  ('Looker', 'Analytics', 'Business intelligence and semantic modeling platform'),

  -- Mobile
  ('Android', 'Mobile', 'Android application development'),
  ('iOS', 'Mobile', 'Apple mobile application development'),
  ('Xamarin', 'Mobile', 'Cross-platform .NET mobile framework'),

  -- Security
  ('Cybersecurity', 'Security', 'Protection of systems, networks, and data'),
  ('Cloud Security', 'Security', 'Security controls for cloud environments'),
  ('Application Security', 'Security', 'Secure software design and testing'),
  ('Penetration Testing', 'Security', 'Authorized offensive security testing'),
  ('DevSecOps', 'Security', 'Security integrated into delivery pipelines'),
  ('OAuth 2.0', 'Security', 'Delegated authorization framework'),

  -- Testing and quality
  ('Selenium', 'Testing', 'Browser automation and web testing framework'),
  ('Playwright', 'Testing', 'End-to-end browser testing framework'),
  ('Cypress', 'Testing', 'Web end-to-end testing framework'),
  ('Jest', 'Testing', 'JavaScript testing framework'),
  ('Pytest', 'Testing', 'Python testing framework'),
  ('JUnit', 'Testing', 'Java unit-testing framework'),
  ('Postman', 'Testing', 'API development and testing platform'),

  -- Observability and tools
  ('Prometheus', 'Observability', 'Metrics collection and alerting system'),
  ('Grafana', 'Observability', 'Monitoring dashboards and visualization'),
  ('OpenTelemetry', 'Observability', 'Vendor-neutral telemetry framework'),
  ('Datadog', 'Observability', 'Cloud monitoring and observability platform'),
  ('GitHub', 'Tools', 'Source hosting and collaborative development platform'),
  ('GitLab', 'Tools', 'Source control and DevOps platform'),
  ('Jira', 'Collaboration', 'Issue and project tracking platform'),
  ('Figma', 'Design', 'Collaborative interface design platform'),
  ('Agile', 'Collaboration', 'Iterative product delivery practices'),
  ('Scrum', 'Collaboration', 'Agile team delivery framework'),

  -- Distributed and emerging systems
  ('gRPC', 'API', 'High-performance remote procedure call framework'),
  ('WebSockets', 'API', 'Full-duplex real-time web communication'),
  ('Blockchain', 'Web3', 'Distributed ledger application development'),
  ('Solidity', 'Web3', 'Smart-contract language for Ethereum')
on conflict (name) do nothing;
