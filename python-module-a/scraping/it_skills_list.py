# Master list of IT skills used for extraction
# Add more skills here as needed

IT_SKILLS = [
    # Languages
    "python", "java", "javascript", "typescript", "golang", "go", "rust",
    "php", "c++", "c#", "ruby", "swift", "kotlin", "scala", "r",
    "bash", "shell", "perl", "dart", "elixir",

    # Frontend
    "react", "angular", "vue", "vue.js", "next.js", "nuxt", "svelte",
    "html", "css", "sass", "tailwind", "bootstrap", "jquery",
    "redux", "graphql", "webpack",

    # Backend
    "node.js", "nodejs", "express", "django", "flask", "fastapi",
    "spring", "spring boot", "laravel", "rails", "asp.net", ".net",
    "nest.js", "nestjs", "fiber", "gin",

    # Cloud
    "aws", "azure", "gcp", "google cloud", "heroku", "vercel",
    "cloudflare", "digitalocean",

    # DevOps
    "docker", "kubernetes", "k8s", "terraform", "ansible", "jenkins",
    "ci/cd", "github actions", "gitlab ci", "circleci",
    "linux", "nginx", "apache",

    # Databases
    "mysql", "postgresql", "postgres", "mongodb", "redis", "sqlite",
    "elasticsearch", "neo4j", "cassandra", "dynamodb", "firestore",
    "oracle", "mssql", "sql server", "mariadb",

    # Data & ML
    "machine learning", "deep learning", "nlp", "computer vision",
    "tensorflow", "pytorch", "keras", "scikit-learn", "sklearn",
    "pandas", "numpy", "matplotlib", "spark", "hadoop", "kafka",
    "airflow", "dbt", "tableau", "power bi", "looker",
    "llm", "langchain", "openai", "bert", "transformers",
    "mlops", "data engineering", "data science",

    # Mobile
    "android", "ios", "react native", "flutter", "xamarin",

    # Other
    "rest api", "rest", "api", "microservices", "agile", "scrum",
    "git", "jira", "figma", "system design",
    "cybersecurity", "penetration testing", "blockchain", "solidity",
    "selenium", "playwright", "jest", "pytest", "junit",
]

# Normalize skill names (alias -> canonical)
SKILL_ALIASES = {
    "node.js":     "nodejs",
    "nestjs":      "nest.js",
    "golang":      "go",
    "sklearn":     "scikit-learn",
    "postgres":    "postgresql",
    "k8s":         "kubernetes",
    "vue.js":      "vue",
    "spring boot": "spring",
    "asp.net":     "dotnet",
    ".net":        "dotnet",
    "c#":          "csharp",
    "c++":         "cpp",
    "gcp":         "google cloud",
}


def normalize(skill: str) -> str:
    s = skill.strip().lower()
    return SKILL_ALIASES.get(s, s)
