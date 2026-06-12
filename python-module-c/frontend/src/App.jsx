import { useEffect, useState } from "react"

const API_BASE_URL = "http://127.0.0.1:5000"

function App() {
  const [roles, setRoles] = useState([])
  const [selectedRole, setSelectedRole] = useState("")
  const [cvFile, setCvFile] = useState(null)

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`${API_BASE_URL}/roles`)
      .then((response) => response.json())
      .then((data) => {
        setRoles(data.roles || [])

        if (data.roles && data.roles.length > 0) {
          setSelectedRole(data.roles[0])
        }
      })
      .catch(() => {
        setError("Could not load job roles from backend.")
      })
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()

    setError("")
    setResult(null)

    if (!cvFile) {
      setError("Please upload your CV first.")
      return
    }

    if (!selectedRole) {
      setError("Please select a target role.")
      return
    }

    const formData = new FormData()
    formData.append("cv_file", cvFile)
    formData.append("target_role", selectedRole)

    try {
      setLoading(true)

      const response = await fetch(`${API_BASE_URL}/analyze-cv`, {
        method: "POST",
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Something went wrong.")
        return
      }

      setResult(data)
    } catch (err) {
      setError("Could not connect to backend.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="container">
        <header className="header">
          <h1>CV Job Readiness Analyzer</h1>
          <p>
            Upload your CV, select a target job role, and check your readiness
            score.
          </p>
        </header>

        <form className="card form-card" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Target Job Role</label>

            <select
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value)}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Upload CV</label>

            <input
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(event) => setCvFile(event.target.files[0])}
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading ? "Analyzing..." : "Analyze CV"}
          </button>

          {error && <p className="error">{error}</p>}
        </form>

        {result && (
          <section className="card result-card">
            <div className="score-box">
              <div>
                <p className="small-title">Selected Role</p>
                <h2>{result.selected_role}</h2>
              </div>

              <div className="score-circle">
                <span>{result.predicted_score}</span>
                <small>/ 100</small>
              </div>
            </div>

            <div className="level-box">
              <p>Readiness Level</p>
              <strong>{result.predicted_level}</strong>
            </div>

            <div className="grid">
              <SkillBox
                title="Matched Required Skills"
                skills={result.matched_required_skills}
              />

              <SkillBox
                title="Missing Required Skills"
                skills={result.missing_required_skills}
              />

              <SkillBox
                title="Matched Preferred Skills"
                skills={result.matched_preferred_skills}
              />

              <SkillBox
                title="Missing Preferred Skills"
                skills={result.missing_preferred_skills}
              />
            </div>

            <div className="details">
              <h3>Extracted CV Details</h3>

              <p>
                <strong>Experience:</strong> {result.experience_months} months
              </p>

              <p>
                <strong>Experience Level:</strong> {result.experience_level}
              </p>

              <p>
                <strong>Projects:</strong> {result.num_projects}
              </p>

              <p>
                <strong>Certificates:</strong> {result.num_certificates}
              </p>

              <p>
                <strong>ATS Quality Score:</strong>{" "}
                {result.ats_quality_score}/100
              </p>
            </div>

            <div className="details">
              <h3>Extracted Skills</h3>

              {result.extracted_skills &&
              result.extracted_skills.length > 0 ? (
                <div className="tags">
                  {result.extracted_skills.map((skill) => (
                    <span key={skill}>{formatSkillName(skill)}</span>
                  ))}
                </div>
              ) : (
                <p className="muted">No skills extracted from the CV.</p>
              )}
            </div>

            <div className="recommendations">
              <h3>Recommendations</h3>

              {result.recommendations && result.recommendations.length > 0 ? (
                <ul>
                  {result.recommendations.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No recommendations available.</p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function SkillBox({ title, skills }) {
  return (
    <div className="skill-box">
      <h3>{title}</h3>

      {skills && skills.length > 0 ? (
        <div className="tags">
          {skills.map((skill) => (
            <span key={skill}>{skill}</span>
          ))}
        </div>
      ) : (
        <p className="muted">No skills found.</p>
      )}
    </div>
  )
}

function formatSkillName(skill) {
  const displayNames = {
    "power bi": "Power BI",
    "google sheets": "Google Sheets",
    "data analysis": "Data Analysis",
    "data visualization": "Data Visualization",
    "dashboard development": "Dashboard Development",
    "data cleaning": "Data Cleaning",
    "data validation": "Data Validation",
    "trend analysis": "Trend Analysis",
    "machine learning": "Machine Learning",
    "deep learning": "Deep Learning",
    "scikit-learn": "Scikit-learn",
    "hugging face": "Hugging Face",
    "api integration": "API Integration",
    "jupyter notebook": "Jupyter Notebook",
    "attention to detail": "Attention To Detail",
    "problem solving": "Problem Solving",
    "analytical thinking": "Analytical Thinking",
    "time management": "Time Management",
    "nodejs": "Node.js",
    "uipath": "UiPath",
    "xgboost": "XGBoost",
    "tensorflow": "TensorFlow",
    "mongodb": "MongoDB",
    "mysql": "MySQL",
    "aws": "AWS",
    "azure": "Azure",
    "gcp": "GCP",
    "sql": "SQL",
    "html": "HTML",
    "css": "CSS",
    "nlp": "NLP",
    "r": "R"
  }

  return displayNames[skill] || toTitleCase(skill)
}

function toTitleCase(text) {
  return text
    .split(" ")
    .map((word) => {
      if (word.length === 0) {
        return word
      }

      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(" ")
}

export default App