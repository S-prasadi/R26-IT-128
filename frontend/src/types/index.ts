export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  is_active?: boolean;
  created_at?: string;
  full_name?: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  permissions: string[];
  created_at?: string;
}

export interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}

// --- Skills ---
export interface Skill {
  id: string;
  name: string;
  category: string;
  description?: string;
}

export interface UserSkill {
  id: string;
  skill_id: string;
  proficiency_level: number;
  proficiency_label: "Beginner" | "Intermediate" | "Advanced";
  github_verified: boolean;
  confidence_score?: number;
  created_at: string;
  updated_at: string;
  skills?: Skill;
}

export interface SkillAssessment {
  id: string;
  skill_id: string;
  score: number;
  notes?: string;
  assessed_at: string;
  skills?: { name: string; category: string };
}

export interface SkillForecastItem {
  skill: string;
  rank: number;
  predicted_weekly_demand: number;
  current_weekly_demand: number;
  velocity: "rising" | "stable" | "falling";
  change_pct: number;
  /** Forecast steps 9-12 vs. the last 4 actual weeks, relative to the historical mean. */
  growth_score: number;
}

export interface TrendingTiers {
  /** Already-large skills, ranked by predicted weekly demand. */
  established: SkillForecastItem[];
  /** Smaller-base skills ranked by growth_score, so a fast-growing skill isn't
   * buried below large flat ones the way a single demand-ranked list would. */
  emerging: SkillForecastItem[];
}

export interface EarlyWarning {
  skill: string;
  weeks_ahead: number;
  correlation: number;
  interpretation: string;
}

export interface SkillForecast {
  trending: TrendingTiers;
  early_warnings: EarlyWarning[];
  forecast_chart: Record<string, string | number>[];
  matched: boolean;
  matched_skills: string[];
}

// --- Progress ---
export interface ProgressModule {
  id: string;
  module_name: "skill" | "career" | "cv" | "interview";
  completion_pct: number;
  last_activity_at?: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  title: string;
  description?: string;
  module_name: string;
  achieved_at?: string | null;
  created_at: string;
}

// --- Career ---
export interface GoalSkillSnapshot {
  skill_id: string;
  name: string;
  proficiency_label: string;
}

export interface CareerGoal {
  id: string;
  target_role: string;
  target_industry?: string;
  target_date?: string;
  notes?: string;
  skills_snapshot?: GoalSkillSnapshot[];
  cv_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoadmapItem {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "done";
  due_date?: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface CareerTransition {
  role: string;
  company_size: string;
  industry: string;
  timeframe_months: number;
  required_skills: string[];
  skill_gaps: string[];
  transition_probability: number;
}

export interface SkillInsight {
  skill: string;
  velocity: "rising" | "stable" | "falling" | "unknown";
  change_pct: number;
  demand: number;
  early_warning?: number; // weeks until the skill is expected to spike locally
}

export interface CareerPath {
  id: string;
  probability: number;
  confidence_relative?: number; // share of confidence across the returned paths (0–1)
  is_goal?: boolean;            // the goal-directed path (always reaches the user's set goal)
  transitions: CareerTransition[];
  career_steps?: string[];
  readiness_score?: number;
  skills_matched?: string[];
  skills_needed?: string[];
  skill_insights?: SkillInsight[];
}

export interface CareerPredictionSnapshot {
  id: string;
  current_role?: string;
  top_target_role?: string;
  top_confidence?: number;
  top_readiness?: number;
  goal_target_role?: string;
  goal_confidence?: number;
  goal_readiness?: number;
  goal_total_months?: number;
  created_at: string;
}

export interface NodeMarket {
  velocity: "rising" | "stable" | "falling" | "unknown";
  demand_index: number;
  top_rising: string[];
}

export interface CareerNodeMeta {
  readiness?: number;
  gate_skills?: string[];
  eta_months?: number;
  market?: NodeMarket;
  is_goal?: boolean; // this role is the user's set goal (highlighted in the graph)
}

export interface CareerGraphNode {
  id: string;
  label: string;
  type: "current" | "role";
  meta?: CareerNodeMeta;
}

export interface CareerGraphEdge {
  source: string;
  target: string;
  probability: number;
  timeframe: string;
  skills?: string[];
}

export interface CareerPrediction {
  id?: string | null; // the persisted snapshot's own id (null for what-if simulations); pass to generateRoadmap so it resolves against this exact run, not just "latest"
  paths: CareerPath[];
  graph_nodes: CareerGraphNode[];
  graph_edges: CareerGraphEdge[];
  goal_path?: CareerPath | null; // path that reaches the user's set goal (when a goal is set)
}

export interface ModelStatus {
  module_b: { online: boolean; best_model?: string | null; num_roles?: number | null };
  module_a: { online: boolean };
}

// --- CV structured section content ---
export interface CVExperienceEntry {
  company: string;
  role: string;
  start_date: string;
  end_date: string;
  location?: string;
  bullets: string[];
}

export interface CVEducationEntry {
  institution: string;
  degree: string;
  field?: string;
  start_date: string;
  end_date: string;
  grade?: string;
}

export interface CVSkillsContent {
  languages: string[];
  frameworks: string[];
  tools: string[];
  other: string[];
}

export interface CVProjectEntry {
  name: string;
  description: string;
  tech_stack: string[];
  url?: string;
  start_date?: string;
  end_date?: string;
}

export interface CVSectionContent {
  summary: string;
  experience: CVExperienceEntry[];
  education: CVEducationEntry[];
  skills: CVSkillsContent;
  projects: CVProjectEntry[];
}

// --- CV ---
export interface CV {
  id: string;
  title: string;
  github_url?: string;
  linkedin_url?: string;
  summary?: string;
  match_score?: number;
  bert_skills?: object[];
  github_verified_skills?: object[];
  project_verification?: CVProjectVerification | null;
  file_url?: string;
  created_at: string;
  updated_at: string;
}

export interface CVSection {
  id?: string;
  section_type: "experience" | "education" | "skills" | "projects" | "summary";
  content: Record<string, unknown>;
  order_index: number;
}

export interface CVJobMatch {
  id: string;
  job_title: string;
  company?: string;
  match_pct: number;
  skill_gaps?: string[];
  source_url?: string;
}

export interface CVSuggestion {
  id: string;
  section_type?: string;
  issue: string;
  fix_example?: string;
  priority: number;
}

export interface CVAnalysisResult {
  extracted_skills: Array<{ name: string; proficiency_label: string; confidence: number }>;
  github_verified: Array<{ skill: string; verified: boolean; confidence: number }>;
  job_matches: Array<{ title: string; company: string; match_pct: number; skill_gaps: string[] }>;
  suggestions: Array<{ section: string; issue: string; fix_example: string }>;
}

export interface CVProjectVerification {
  github_username: string;
  checked_at: string;
  summary: { total: number; verified: number; flagged: number };
  results: Array<{
    name: string;
    claimed_url: string | null;
    found: boolean;
    repo_url: string | null;
    owned_by_user: boolean;
    is_fork: boolean;
    last_pushed: string | null;
    languages_matched: string[];
    languages_unverified: string[];
    confidence: number;
  }>;
}

export interface CVJobPost {
  id: string;
  title?: string | null;
  comparison: {
    match_pct: number;
    matched_skills: string[];
    missing_skills: string[];
    missing_with_demand?: Array<{ skill: string; predicted_weekly_demand?: number; velocity?: string }>;
    closest_role: string | null;
    predicted_score: number | null;
    predicted_level: string | null;
    recommendations: string[];
    unavailable?: boolean;
  };
  tailoring: {
    tailored_summary: string;
    suggestions: Array<{ section: string; issue: string; fix_example: string }>;
    keywords_to_add: string[];
  };
  created_at: string;
}

// --- Interview ---
export interface InterviewSession {
  id: string;
  topic: string;
  difficulty: number;
  status: "pending" | "in_progress" | "completed";
  duration_seconds?: number;
  overall_score?: number;
  engagement_score?: number;
  started_at?: string;
  ended_at?: string;
  created_at: string;
  is_demo?: boolean;
  emotion_sensitivity?: number;
  questions?: InterviewQuestion[];
}

export interface InterviewQuestion {
  id: string;
  question_text: string;
  question_type: "behavioral" | "technical" | "situational";
  difficulty: number;
  order_index: number;
  response?: InterviewResponse | null;
}

export interface InterviewResponse {
  id: string;
  question_id: string;
  response_text?: string;
  score?: number;
  feedback?: string;
  emotion_data?: Record<string, unknown>;
  engagement_score?: number;
  analysis?: InterviewAnalysis | null;
  created_at: string;
}

export interface InterviewAnalysis {
  criteria: Record<string, number>;
  strengths: string[];
  improvements: string[];
  model_answer: string;
}

export interface EmotionPrediction {
  face: boolean;
  emotion?: string;
  confidence?: number;
  interview_state?: string;
  state_color?: string;
  probs?: Record<string, number>;
}

// --- Notifications ---
export interface NotificationPreferences {
  id: string;
  skill_alerts: boolean;
  career_updates: boolean;
  cv_feedback: boolean;
  interview_reminders: boolean;
  system_notices: boolean;
  updated_at: string;
}
