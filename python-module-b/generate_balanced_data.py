"""
Balanced dataset generator — EXPERIMENTAL / NOT WIRED INTO THE MAIN PIPELINE.

WARNING: this uses its own hand-curated set of ~33 role names (e.g. "Ai Ml",
"Devops Engineer") that do NOT go through train_all.py's _canonical_role() /
_normalise_title() pipeline. If you run this and then run
`train_all.py --step train`, the model silently drops from 184 canonical
roles to however many of these ~33 survive, and career-ladder generation
(get_career_steps/_domain) will misclassify titles like "Ai Ml" into
"General IT" since they don't match any of _domain()'s substring checks —
degrading career-path quality with no error or warning.

It intentionally does NOT write to cleaned_data/training_data.csv (the file
the real pipeline reads) so running it can't silently corrupt the live
dataset. If you want to actually use this, first reconcile ROLE_PROFILES'
role names through _canonical_role() and merge the results into
training_data.csv deliberately — don't just point OUTPUT_CSV back at it.

Adds 15 new IT roles and balances all classes to TARGET_PER_CLASS samples.

Run:
    python generate_balanced_data.py

Output:
    cleaned_data/experimental_balanced_data.csv   (NOT read by train_all.py)
"""

import csv
import random
import uuid
from collections import Counter
from pathlib import Path

random.seed(42)

TARGET_PER_CLASS = 300
DATA_DIR = Path(__file__).parent / "cleaned_data"
OUTPUT_CSV = DATA_DIR / "experimental_balanced_data.csv"

# ---------------------------------------------------------------------------
# Role profiles: (core_skills, framework_skills, tools, soft_skills)
# Each tuple is a pool to sample from.
# ---------------------------------------------------------------------------

ROLE_PROFILES = {
    # ── Existing 18 roles ───────────────────────────────────────────────────
    "Ai Ml": {
        "core":      ["python", "machine learning", "deep learning", "nlp", "neural networks",
                      "llm", "generative ai", "prompt engineering", "transformers",
                      "reinforcement learning", "computer vision", "model evaluation"],
        "frameworks": ["tensorflow", "pytorch", "hugging face", "langchain", "openai api",
                       "scikit-learn", "keras", "spacy", "fastai", "ollama"],
        "tools":     ["jupyter", "colab", "mlflow", "wandb", "git", "docker", "python"],
        "soft":      ["research skills", "problem solving", "analytical thinking", "critical thinking"],
        "adjacent":  ["data science", "statistics", "sql", "aws"],
    },

    "Backend Developer": {
        "core":      ["rest api", "microservices", "database design", "authentication",
                      "server-side development", "api development", "oop", "design patterns",
                      "caching", "message queues"],
        "frameworks": ["spring boot", "django", "fastapi", "express.js", "laravel",
                       "flask", "nestjs", "gin", "ruby on rails", "asp.net core"],
        "tools":     ["postgresql", "mysql", "redis", "rabbitmq", "kafka", "docker",
                      "git", "postman", "swagger", "nginx"],
        "soft":      ["problem solving", "attention to detail", "teamwork"],
        "adjacent":  ["java", "python", "go", "node.js", "c#", "kubernetes"],
    },

    "Business Analyst": {
        "core":      ["requirements gathering", "stakeholder management", "business process modeling",
                      "gap analysis", "use case documentation", "user stories", "brd writing",
                      "functional specifications", "workflow analysis"],
        "frameworks": ["bpmn", "uml", "six sigma", "lean"],
        "tools":     ["jira", "confluence", "microsoft visio", "power bi", "tableau",
                      "excel", "powerpoint", "miro", "trello"],
        "soft":      ["communication", "analytical thinking", "critical thinking", "presentation skills",
                      "stakeholder communication", "negotiation"],
        "adjacent":  ["sql", "agile", "scrum", "project management"],
    },

    "Cloud Engineer": {
        "core":      ["cloud infrastructure", "infrastructure as code", "serverless architecture",
                      "cloud security", "networking", "scalability", "high availability",
                      "cost optimization", "cloud migration"],
        "frameworks": ["aws", "azure", "gcp", "terraform", "cloudformation", "pulumi",
                       "cdk", "ansible"],
        "tools":     ["kubernetes", "docker", "jenkins", "github actions", "helm",
                      "prometheus", "grafana", "vpc", "iam", "lambda"],
        "soft":      ["problem solving", "adaptability", "attention to detail"],
        "adjacent":  ["python", "bash", "linux", "devops", "ci/cd"],
    },

    "Data Analyst": {
        "core":      ["data analysis", "data visualization", "statistical analysis",
                      "sql", "reporting", "dashboard creation", "kpi tracking",
                      "data cleaning", "exploratory data analysis", "business intelligence"],
        "frameworks": ["tableau", "power bi", "looker", "google analytics", "excel",
                       "dax", "matplotlib", "seaborn"],
        "tools":     ["sql", "excel", "python", "r", "jupyter", "google sheets",
                      "bigquery", "snowflake", "pandas", "numpy"],
        "soft":      ["analytical thinking", "attention to detail", "communication",
                      "critical thinking", "storytelling with data"],
        "adjacent":  ["data science", "business intelligence", "reporting", "etl"],
    },

    "Data Engineer": {
        "core":      ["data pipelines", "etl", "data modeling", "data warehousing",
                      "batch processing", "stream processing", "data quality",
                      "data governance", "data architecture"],
        "frameworks": ["apache spark", "apache kafka", "apache airflow", "dbt",
                       "flink", "beam", "nifi"],
        "tools":     ["python", "sql", "snowflake", "redshift", "bigquery",
                      "databricks", "hadoop", "hive", "docker", "git"],
        "soft":      ["problem solving", "attention to detail", "analytical thinking"],
        "adjacent":  ["aws", "azure", "gcp", "kubernetes", "scala"],
    },

    "Data Scientist": {
        "core":      ["statistical modeling", "machine learning", "hypothesis testing",
                      "data analysis", "predictive modeling", "statistical analysis",
                      "a/b testing", "feature engineering", "model validation",
                      "time series analysis", "regression analysis"],
        "frameworks": ["scikit-learn", "statsmodels", "scipy", "xgboost", "lightgbm",
                       "r", "tensorflow", "pytorch"],
        "tools":     ["python", "r", "jupyter", "sql", "pandas", "numpy",
                      "matplotlib", "seaborn", "git", "tableau"],
        "soft":      ["analytical thinking", "critical thinking", "communication",
                      "research skills", "problem solving"],
        "adjacent":  ["deep learning", "nlp", "big data", "hadoop"],
    },

    "Devops Engineer": {
        "core":      ["ci/cd", "infrastructure automation", "container orchestration",
                      "configuration management", "monitoring", "logging",
                      "deployment pipelines", "site reliability", "release management"],
        "frameworks": ["jenkins", "gitlab ci", "github actions", "circleci",
                       "ansible", "puppet", "chef", "argocd", "tekton"],
        "tools":     ["docker", "kubernetes", "terraform", "helm", "prometheus",
                      "grafana", "elk stack", "bash", "python", "git"],
        "soft":      ["problem solving", "adaptability", "collaboration", "attention to detail"],
        "adjacent":  ["linux", "aws", "azure", "gcp", "security"],
    },

    "Frontend Developer": {
        "core":      ["html", "css", "javascript", "responsive design", "ui implementation",
                      "component development", "state management", "web accessibility",
                      "performance optimization", "cross-browser compatibility"],
        "frameworks": ["react", "vue.js", "angular", "next.js", "svelte",
                       "tailwind css", "bootstrap", "sass"],
        "tools":     ["typescript", "webpack", "vite", "figma", "git",
                      "jest", "cypress", "npm", "storybook", "chrome devtools"],
        "soft":      ["creativity", "attention to detail", "collaboration", "problem solving"],
        "adjacent":  ["ux design", "node.js", "graphql", "rest api"],
    },

    "Full Stack Developer": {
        "core":      ["frontend development", "backend development", "rest api",
                      "database management", "full stack architecture",
                      "end-to-end development", "system integration"],
        "frameworks": ["react", "node.js", "express.js", "next.js", "django",
                       "spring boot", "vue.js", "angular"],
        "tools":     ["html", "css", "javascript", "typescript", "sql", "mongodb",
                      "postgresql", "docker", "git", "aws"],
        "soft":      ["problem solving", "adaptability", "teamwork", "communication"],
        "adjacent":  ["devops", "cloud", "graphql", "redis"],
    },

    "Machine Learning Engineer": {
        "core":      ["model deployment", "ml pipelines", "feature engineering",
                      "model optimization", "model monitoring", "mlops",
                      "production ml", "model versioning", "inference optimization"],
        "frameworks": ["mlflow", "kubeflow", "sagemaker", "vertex ai", "bentoml",
                       "fastapi", "triton inference server", "seldon core"],
        "tools":     ["python", "docker", "kubernetes", "git", "tensorflow",
                      "pytorch", "scikit-learn", "airflow", "spark", "kafka"],
        "soft":      ["problem solving", "analytical thinking", "attention to detail"],
        "adjacent":  ["deep learning", "data engineering", "cloud", "statistics"],
    },

    "Mobile Developer": {
        "core":      ["mobile app development", "native development", "cross-platform development",
                      "mobile ui", "push notifications", "offline storage", "mobile security",
                      "app store deployment", "mobile performance"],
        "frameworks": ["flutter", "react native", "android sdk", "ios sdk",
                       "jetpack compose", "swiftui", "ionic", "xamarin"],
        "tools":     ["kotlin", "swift", "dart", "java", "xcode", "android studio",
                      "firebase", "fastlane", "git", "figma"],
        "soft":      ["creativity", "attention to detail", "problem solving", "collaboration"],
        "adjacent":  ["backend api", "graphql", "ux design", "testing"],
    },

    "Product Manager": {
        "core":      ["product roadmap", "user research", "stakeholder management",
                      "product strategy", "market research", "backlog management",
                      "kpi definition", "go-to-market", "product discovery",
                      "competitive analysis", "prioritization frameworks"],
        "frameworks": ["agile", "scrum", "okr", "lean startup", "design thinking", "jtbd"],
        "tools":     ["jira", "confluence", "figma", "miro", "amplitude",
                      "mixpanel", "google analytics", "notion", "trello"],
        "soft":      ["communication", "leadership", "stakeholder management",
                      "critical thinking", "decision making", "empathy"],
        "adjacent":  ["sql", "data analysis", "ux design", "business analysis"],
    },

    "Qa Engineer": {
        "core":      ["test automation", "manual testing", "test planning",
                      "bug reporting", "test case design", "regression testing",
                      "performance testing", "api testing", "acceptance testing"],
        "frameworks": ["selenium", "cypress", "playwright", "pytest", "junit",
                       "testng", "jest", "appium", "postman"],
        "tools":     ["jira", "testrail", "git", "jenkins", "docker",
                      "charles proxy", "k6", "locust", "sql", "python"],
        "soft":      ["attention to detail", "analytical thinking", "communication", "problem solving"],
        "adjacent":  ["devops", "ci/cd", "agile", "security testing"],
    },

    "Security Engineer": {
        "core":      ["penetration testing", "vulnerability assessment", "threat modeling",
                      "security architecture", "incident response", "soc operations",
                      "owasp", "zero trust", "security auditing", "compliance"],
        "frameworks": ["siem", "soc 2", "iso 27001", "nist", "cis controls",
                       "owasp top 10", "mitre att&ck"],
        "tools":     ["burpsuite", "nmap", "metasploit", "wireshark", "kali linux",
                      "splunk", "crowdstrike", "palo alto", "python", "bash"],
        "soft":      ["analytical thinking", "attention to detail", "problem solving",
                      "critical thinking", "integrity"],
        "adjacent":  ["networking", "cloud security", "devsecops", "cryptography"],
    },

    "Software Engineer": {
        "core":      ["software development", "oop", "data structures", "algorithms",
                      "system design", "code review", "unit testing",
                      "software architecture", "design patterns", "clean code"],
        "frameworks": ["spring", "django", "asp.net", "express.js", "rails",
                       "junit", "pytest", "maven", "gradle"],
        "tools":     ["git", "docker", "jira", "intellij idea", "vs code",
                      "sql", "linux", "ci/cd", "jenkins", "sonarqube"],
        "soft":      ["problem solving", "teamwork", "communication", "adaptability"],
        "adjacent":  ["java", "python", "c#", "go", "kotlin", "microservices"],
    },

    "System Administrator": {
        "core":      ["linux administration", "windows server", "network configuration",
                      "user management", "server maintenance", "backup recovery",
                      "patch management", "active directory", "system monitoring",
                      "virtualization"],
        "frameworks": ["vmware", "hyper-v", "active directory", "group policy"],
        "tools":     ["bash", "powershell", "ansible", "nagios", "zabbix",
                      "puppet", "sccm", "azure ad", "ldap", "sftp"],
        "soft":      ["problem solving", "attention to detail", "adaptability",
                      "communication", "time management"],
        "adjacent":  ["networking", "cloud", "security", "docker"],
    },

    "Ui/Ux Designer": {
        "core":      ["user research", "wireframing", "prototyping", "interaction design",
                      "information architecture", "usability testing", "visual design",
                      "design systems", "user journey mapping", "accessibility design"],
        "frameworks": ["design thinking", "atomic design", "material design",
                       "human interface guidelines"],
        "tools":     ["figma", "adobe xd", "sketch", "invision", "miro",
                      "zeplin", "framer", "principle", "photoshop", "illustrator"],
        "soft":      ["creativity", "empathy", "communication", "attention to detail",
                      "presentation skills", "collaboration"],
        "adjacent":  ["html", "css", "front-end basics", "motion design", "research"],
    },

    # ── 15 NEW roles ────────────────────────────────────────────────────────
    "Blockchain Developer": {
        "core":      ["smart contracts", "decentralized applications", "web3",
                      "blockchain architecture", "consensus mechanisms", "tokenomics",
                      "defi protocols", "nft development", "on-chain data", "cryptography"],
        "frameworks": ["ethereum", "solidity", "hardhat", "foundry", "truffle",
                       "web3.js", "ethers.js", "polygon", "solana", "hyperledger"],
        "tools":     ["metamask", "ipfs", "ganache", "remix ide", "alchemy",
                      "infura", "openzeppelin", "git", "javascript", "python"],
        "soft":      ["problem solving", "analytical thinking", "critical thinking", "adaptability"],
        "adjacent":  ["cryptography", "rust", "go", "node.js", "security"],
    },

    "Game Developer": {
        "core":      ["game development", "game mechanics", "physics simulation",
                      "3d modeling integration", "game ai", "performance optimization",
                      "collision detection", "shader programming", "multiplayer networking"],
        "frameworks": ["unity", "unreal engine", "godot", "cocos2d", "phaser"],
        "tools":     ["c#", "c++", "blender", "3ds max", "maya", "photon",
                      "playfab", "git", "visual studio", "opengl"],
        "soft":      ["creativity", "problem solving", "attention to detail", "teamwork"],
        "adjacent":  ["animation", "vfx", "ui design", "ar/vr", "audio integration"],
    },

    "Embedded Systems Engineer": {
        "core":      ["embedded c programming", "microcontroller programming", "rtos",
                      "hardware-software interface", "device drivers", "firmware development",
                      "real-time systems", "memory management", "interrupt handling"],
        "frameworks": ["freertos", "zephyr rtos", "arduino", "mbed", "hal"],
        "tools":     ["c", "c++", "arm cortex", "stm32", "esp32", "raspberry pi",
                      "oscilloscope", "jtag", "keil", "iar embedded workbench"],
        "soft":      ["problem solving", "attention to detail", "analytical thinking",
                      "patience", "critical thinking"],
        "adjacent":  ["python", "linux", "iot", "networking", "pcb design"],
    },

    "Ar/Vr Developer": {
        "core":      ["ar development", "vr development", "spatial computing",
                      "3d interaction", "head-mounted display", "mixed reality",
                      "immersive experience", "scene management", "hand tracking"],
        "frameworks": ["unity", "unreal engine", "arkit", "arcore", "openxr",
                       "vuforia", "webxr", "mrtk"],
        "tools":     ["c#", "c++", "blender", "3ds max", "visual studio",
                      "meta quest sdk", "hololens sdk", "git", "shader graph"],
        "soft":      ["creativity", "problem solving", "attention to detail", "collaboration"],
        "adjacent":  ["3d modeling", "animation", "game development", "spatial audio"],
    },

    "Network Engineer": {
        "core":      ["network design", "routing protocols", "switching", "firewall management",
                      "network security", "vpn configuration", "load balancing",
                      "network monitoring", "dns management", "sdwan"],
        "frameworks": ["ospf", "bgp", "eigrp", "mpls", "stp", "vxlan", "vlan"],
        "tools":     ["cisco ios", "palo alto", "fortinet", "juniper", "wireshark",
                      "netflow", "snmp", "nmap", "gns3", "solarwinds"],
        "soft":      ["problem solving", "attention to detail", "analytical thinking",
                      "communication", "time management"],
        "adjacent":  ["security", "cloud networking", "linux", "automation scripting"],
    },

    "Database Administrator": {
        "core":      ["database administration", "query optimization", "backup recovery",
                      "high availability", "replication", "database security",
                      "performance tuning", "capacity planning", "schema design",
                      "stored procedures"],
        "frameworks": ["postgresql", "mysql", "oracle", "microsoft sql server",
                       "mongodb", "redis", "cassandra", "mariadb"],
        "tools":     ["sql", "pl/sql", "t-sql", "pgadmin", "dbeaver",
                      "dataguard", "rman", "prometheus", "grafana", "bash"],
        "soft":      ["attention to detail", "problem solving", "analytical thinking",
                      "reliability", "time management"],
        "adjacent":  ["python", "linux", "cloud databases", "etl", "data warehousing"],
    },

    "Site Reliability Engineer": {
        "core":      ["slo/sli/sla management", "incident management", "on-call operations",
                      "reliability engineering", "chaos engineering", "capacity planning",
                      "blameless postmortems", "toil reduction", "runbook automation"],
        "frameworks": ["sre practices", "google sre", "error budgets", "service mesh",
                       "istio", "linkerd"],
        "tools":     ["prometheus", "grafana", "pagerduty", "opsgenie", "datadog",
                      "kubernetes", "terraform", "ansible", "python", "bash"],
        "soft":      ["problem solving", "communication", "calm under pressure",
                      "analytical thinking", "collaboration"],
        "adjacent":  ["devops", "cloud", "linux", "ci/cd", "security"],
    },

    "Solutions Architect": {
        "core":      ["solution design", "enterprise architecture", "technical roadmap",
                      "cloud architecture", "system integration", "architectural patterns",
                      "technology evaluation", "stakeholder alignment", "rfp/rfq response",
                      "cost-benefit analysis"],
        "frameworks": ["togaf", "aws well-architected", "microservices", "event-driven architecture",
                       "domain-driven design", "cqrs", "saga pattern"],
        "tools":     ["aws", "azure", "gcp", "draw.io", "confluence", "jira",
                      "terraform", "docker", "kubernetes", "lucidchart"],
        "soft":      ["communication", "leadership", "analytical thinking", "presentation skills",
                      "stakeholder management", "problem solving"],
        "adjacent":  ["cloud", "devops", "security", "software engineering", "business analysis"],
    },

    "Computer Vision Engineer": {
        "core":      ["object detection", "image segmentation", "image classification",
                      "feature extraction", "video analysis", "3d vision", "optical flow",
                      "model training", "real-time processing", "depth estimation"],
        "frameworks": ["opencv", "yolo", "detectron2", "mediapipe", "torchvision",
                       "tensorflow object detection api", "mmdetection", "ultralytics"],
        "tools":     ["python", "pytorch", "tensorflow", "numpy", "pillow",
                      "labelimg", "roboflow", "cuda", "onnx", "triton"],
        "soft":      ["analytical thinking", "problem solving", "research skills",
                      "attention to detail", "critical thinking"],
        "adjacent":  ["deep learning", "embedded systems", "ros", "lidar", "ar/vr"],
    },

    "Nlp Engineer": {
        "core":      ["text classification", "named entity recognition", "sentiment analysis",
                      "information extraction", "question answering", "text generation",
                      "language model fine-tuning", "tokenization", "semantic search"],
        "frameworks": ["hugging face transformers", "spacy", "nltk", "gensim",
                       "langchain", "llamaindex", "haystack", "rasa"],
        "tools":     ["python", "pytorch", "tensorflow", "bert", "gpt", "t5",
                      "elasticsearch", "faiss", "annoy", "git"],
        "soft":      ["research skills", "analytical thinking", "problem solving",
                      "attention to detail", "critical thinking"],
        "adjacent":  ["machine learning", "deep learning", "information retrieval", "linguistics"],
    },

    "Platform Engineer": {
        "core":      ["internal developer platform", "developer experience", "platform engineering",
                      "self-service infrastructure", "golden paths", "paved roads",
                      "developer productivity", "platform as a product"],
        "frameworks": ["backstage", "port", "crossplane", "argo cd", "flux",
                       "service mesh", "istio", "dapr"],
        "tools":     ["kubernetes", "terraform", "helm", "docker", "github actions",
                      "prometheus", "grafana", "vault", "tekton", "python"],
        "soft":      ["collaboration", "communication", "problem solving",
                      "developer empathy", "adaptability"],
        "adjacent":  ["devops", "cloud", "sre", "security", "ci/cd"],
    },

    "Scrum Master": {
        "core":      ["sprint planning", "retrospectives", "daily standups", "sprint reviews",
                      "backlog refinement", "agile coaching", "impediment removal",
                      "team facilitation", "velocity tracking", "kanban"],
        "frameworks": ["scrum", "kanban", "safe", "less", "extreme programming",
                       "agile", "okr"],
        "tools":     ["jira", "confluence", "miro", "trello", "azure devops",
                      "notion", "microsoft teams", "slack", "zoom"],
        "soft":      ["facilitation", "communication", "leadership", "conflict resolution",
                      "empathy", "coaching", "servant leadership", "adaptability"],
        "adjacent":  ["project management", "product management", "business analysis", "lean"],
    },

    "Bi Developer": {
        "core":      ["business intelligence", "data modeling", "dashboard development",
                      "kpi reporting", "data warehouse", "etl development",
                      "olap", "star schema", "snowflake schema", "self-service bi"],
        "frameworks": ["power bi", "tableau", "looker", "qlik", "microstrategy",
                       "dax", "mdx", "ssrs", "ssas"],
        "tools":     ["sql", "python", "dbt", "snowflake", "azure synapse",
                      "bigquery", "redshift", "excel", "power query", "git"],
        "soft":      ["analytical thinking", "attention to detail", "communication",
                      "storytelling with data", "stakeholder management"],
        "adjacent":  ["data analysis", "data engineering", "data science", "reporting"],
    },

    "Salesforce Developer": {
        "core":      ["apex programming", "lightning web components", "salesforce crm",
                      "salesforce integration", "workflow automation", "flow builder",
                      "salesforce administration", "object configuration", "soql"],
        "frameworks": ["salesforce platform", "salesforce dx", "lwc", "aura",
                       "einstein analytics", "mulesoft", "salesforce cpq"],
        "tools":     ["salesforce cli", "vs code", "workbench", "developer console",
                      "dataloader", "github", "jira", "postman", "ant migration tool"],
        "soft":      ["problem solving", "analytical thinking", "communication",
                      "attention to detail", "adaptability"],
        "adjacent":  ["javascript", "rest api", "crm strategy", "data management", "xml"],
    },

    "Technical Lead": {
        "core":      ["technical leadership", "code review", "architecture decisions",
                      "team mentoring", "technical roadmap", "sprint planning",
                      "cross-team coordination", "technical documentation",
                      "risk assessment", "engineering standards"],
        "frameworks": ["agile", "scrum", "microservices", "domain-driven design",
                       "system design", "design patterns", "ci/cd"],
        "tools":     ["git", "jira", "confluence", "docker", "kubernetes",
                      "sonarqube", "jenkins", "github", "slack", "notion"],
        "soft":      ["leadership", "communication", "mentoring", "decision making",
                      "collaboration", "conflict resolution", "critical thinking"],
        "adjacent":  ["software engineering", "devops", "cloud", "security", "product management"],
    },
}

# ---------------------------------------------------------------------------
# Current role pools per target role (makes the dataset more realistic)
# ---------------------------------------------------------------------------

CURRENT_ROLE_MAP = {
    "Ai Ml":                    ["Student", "Intern", "Junior ML Engineer", "Research Intern", "Data Science Intern"],
    "Backend Developer":        ["Student", "Intern", "Junior Developer", "Junior Backend Developer", "Trainee"],
    "Business Analyst":         ["Student", "Intern", "Junior Business Analyst", "Trainee", "Graduate"],
    "Cloud Engineer":           ["Student", "Intern", "Junior Cloud Engineer", "Trainee", "Junior DevOps"],
    "Data Analyst":             ["Student", "Intern", "Junior Data Analyst", "Trainee", "Graduate"],
    "Data Engineer":            ["Student", "Intern", "Junior Data Engineer", "Software Engineer", "Trainee"],
    "Data Scientist":           ["Student", "Intern", "Junior Data Scientist", "Data Analyst", "Research Intern"],
    "Devops Engineer":          ["Student", "Intern", "Junior DevOps", "Junior SysAdmin", "Trainee"],
    "Frontend Developer":       ["Student", "Intern", "Junior Frontend Developer", "Trainee", "Graduate"],
    "Full Stack Developer":     ["Student", "Intern", "Junior Full Stack Developer", "Frontend Developer", "Backend Developer"],
    "Machine Learning Engineer":["Student", "Intern", "Junior ML Engineer", "Data Scientist", "Software Engineer"],
    "Mobile Developer":         ["Student", "Intern", "Junior Mobile Developer", "Trainee", "Graduate"],
    "Product Manager":          ["Student", "Intern", "Associate PM", "Business Analyst", "Junior PM"],
    "Qa Engineer":              ["Student", "Intern", "Junior QA", "Junior Tester", "Trainee"],
    "Security Engineer":        ["Student", "Intern", "Junior Security Analyst", "SOC Analyst", "Trainee"],
    "Software Engineer":        ["Student", "Intern", "Junior Software Engineer", "Trainee", "Graduate"],
    "System Administrator":     ["Student", "Intern", "Junior SysAdmin", "IT Support", "Trainee"],
    "Ui/Ux Designer":           ["Student", "Intern", "Junior UX Designer", "Graphic Designer", "Trainee"],
    "Blockchain Developer":     ["Student", "Intern", "Junior Blockchain Developer", "Web3 Intern", "Trainee"],
    "Game Developer":           ["Student", "Intern", "Junior Game Developer", "Trainee", "Graduate"],
    "Embedded Systems Engineer":["Student", "Intern", "Junior Embedded Engineer", "Trainee", "Graduate"],
    "Ar/Vr Developer":          ["Student", "Intern", "Junior AR/VR Developer", "Game Developer", "Trainee"],
    "Network Engineer":         ["Student", "Intern", "Junior Network Engineer", "IT Support", "Trainee"],
    "Database Administrator":   ["Student", "Intern", "Junior DBA", "Data Analyst", "Trainee"],
    "Site Reliability Engineer":["Student", "Intern", "Junior SRE", "DevOps Engineer", "Software Engineer"],
    "Solutions Architect":      ["Student", "Intern", "Software Engineer", "Senior Developer", "Cloud Engineer"],
    "Computer Vision Engineer": ["Student", "Intern", "Junior CV Engineer", "Research Intern", "ML Intern"],
    "Nlp Engineer":             ["Student", "Intern", "Junior NLP Engineer", "Research Intern", "ML Intern"],
    "Platform Engineer":        ["Student", "Intern", "DevOps Engineer", "Junior Platform Engineer", "Trainee"],
    "Scrum Master":             ["Student", "Intern", "Junior Scrum Master", "Project Coordinator", "Business Analyst"],
    "Bi Developer":             ["Student", "Intern", "Junior BI Developer", "Data Analyst", "Trainee"],
    "Salesforce Developer":     ["Student", "Intern", "Junior Salesforce Developer", "CRM Intern", "Trainee"],
    "Technical Lead":           ["Junior Developer", "Software Engineer", "Senior Developer", "Intern", "Graduate"],
}

EXPERIENCE_LEVEL_MAP = {
    0:   "Fresher",
    6:   "Junior",
    12:  "Junior",
    18:  "Junior",
    24:  "Mid",
    36:  "Mid",
    48:  "Senior",
    60:  "Senior",
}


def _exp_level(months: int) -> str:
    for threshold in sorted(EXPERIENCE_LEVEL_MAP.keys(), reverse=True):
        if months >= threshold:
            return EXPERIENCE_LEVEL_MAP[threshold]
    return "Fresher"


def _generate_record(target_role: str, index: int) -> dict:
    profile = ROLE_PROFILES[target_role]

    # Always pick core skills (4-7)
    n_core = random.randint(4, min(7, len(profile["core"])))
    picked = set(random.sample(profile["core"], n_core))

    # Add framework skills (2-4)
    n_fw = random.randint(2, min(4, len(profile["frameworks"])))
    picked.update(random.sample(profile["frameworks"], n_fw))

    # Add tools (2-4)
    n_tools = random.randint(2, min(4, len(profile["tools"])))
    picked.update(random.sample(profile["tools"], n_tools))

    # Add soft skills (1-3)
    n_soft = random.randint(1, min(3, len(profile["soft"])))
    picked.update(random.sample(profile["soft"], n_soft))

    # Add adjacent skills (0-2, adds realistic noise)
    if profile["adjacent"] and random.random() < 0.6:
        n_adj = random.randint(1, min(2, len(profile["adjacent"])))
        picked.update(random.sample(profile["adjacent"], n_adj))

    skills = sorted(picked)
    exp_months = random.choice([0, 0, 0, 6, 6, 12, 18, 24, 36])
    num_projects = random.randint(0, 8)
    eval_score = round(random.uniform(20, 90), 1)

    current_roles = CURRENT_ROLE_MAP.get(target_role, ["Student", "Intern", "Trainee"])
    current_role = random.choice(current_roles)

    return {
        "candidate_id":      f"SYN_{target_role[:4].upper()}_{index:05d}_{uuid.uuid4().hex[:6]}",
        "current_role":      current_role,
        "target_role":       target_role,
        "skills":            "|".join(skills),
        "skills_text":       " ".join(skills),
        "experience_months": exp_months,
        "experience_level":  _exp_level(exp_months),
        "num_skills":        len(skills),
        "num_projects":      num_projects,
        "evaluation_score":  eval_score,
    }


# ---------------------------------------------------------------------------
# CSV columns (must match data_loader.py)
# ---------------------------------------------------------------------------

CSV_COLUMNS = [
    "candidate_id", "current_role", "target_role",
    "skills", "skills_text",
    "experience_months", "experience_level",
    "num_skills", "num_projects", "evaluation_score",
]


def main():
    print("Loading existing CSV ...")
    existing_rows: list[dict] = []
    existing_role_counts: Counter = Counter()

    if OUTPUT_CSV.exists():
        with open(OUTPUT_CSV, encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                existing_rows.append(row)
                existing_role_counts[row["target_role"]] += 1

    print(f"  Existing records : {len(existing_rows)}")
    print(f"  Existing roles   : {len(existing_role_counts)}")

    # Generate new records to hit TARGET_PER_CLASS for every role
    new_rows: list[dict] = []
    print(f"\nGenerating synthetic records (target: {TARGET_PER_CLASS} per class) ...")
    for role, profile in ROLE_PROFILES.items():
        have = existing_role_counts.get(role, 0)
        need = max(0, TARGET_PER_CLASS - have)
        for i in range(need):
            new_rows.append(_generate_record(role, i))

        status = "new role" if have == 0 else f"had {have}"
        print(f"  {role:<35} {status:>12} -> +{need} generated")

    # Combine and write
    all_rows = existing_rows + new_rows
    random.shuffle(all_rows)

    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(all_rows)

    # Final summary
    final_counts: Counter = Counter(r["target_role"] for r in all_rows)
    print(f"\n{'='*58}")
    print(f"  Total records    : {len(all_rows)}")
    print(f"  Total roles      : {len(final_counts)}")
    print(f"  Output           : {OUTPUT_CSV}")
    print(f"{'='*58}")
    print(f"\n  Final distribution:")
    for role, cnt in sorted(final_counts.items(), key=lambda x: -x[1]):
        bar = "#" * (cnt // 10)
        print(f"  {role:<35} {cnt:>5}  {bar}")


if __name__ == "__main__":
    main()
