import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";
import { callPython, pythonUrls } from "./python.service";
import { notificationService } from "./notification.service";
import type {
  UpsertGoalDto,
  AddRoadmapItemDto,
  UpdateRoadmapItemDto,
  PredictPathDto,
} from "../validations/career.validation";

const MOCK_CAREER_PATH = {
  paths: [
    {
      id: "path-1",
      probability: 0.87,
      transitions: [
        { role: "Junior Software Engineer",    company_size: "startup",    industry: "FinTech",   timeframe_months: 6,  required_skills: ["React","Node.js","PostgreSQL"], skill_gaps: ["AWS"],          transition_probability: 0.91 },
        { role: "Software Engineer",           company_size: "mid",        industry: "FinTech",   timeframe_months: 18, required_skills: ["React","Node.js","AWS","Docker"], skill_gaps: ["Kubernetes"],   transition_probability: 0.85 },
        { role: "Senior Software Engineer",    company_size: "enterprise", industry: "FinTech",   timeframe_months: 36, required_skills: ["System Design","AWS","Docker"],   skill_gaps: ["LangChain"],   transition_probability: 0.78 },
      ],
    },
    {
      id: "path-2",
      probability: 0.72,
      transitions: [
        { role: "Full-Stack Developer",        company_size: "startup",    industry: "EdTech",    timeframe_months: 8,  required_skills: ["React","Next.js","Node.js"], skill_gaps: ["MongoDB"],     transition_probability: 0.88 },
        { role: "Tech Lead",                   company_size: "mid",        industry: "EdTech",    timeframe_months: 24, required_skills: ["React","Node.js","Team Leadership"], skill_gaps: ["AWS","Kubernetes"], transition_probability: 0.70 },
      ],
    },
  ],
  graph_nodes: [
    { id: "n0", label: "Current",                    type: "current" },
    { id: "n1", label: "Junior Software Engineer",   type: "role" },
    { id: "n2", label: "Software Engineer",          type: "role" },
    { id: "n3", label: "Senior Software Engineer",   type: "role" },
    { id: "n4", label: "Full-Stack Developer",       type: "role" },
    { id: "n5", label: "Tech Lead",                  type: "role" },
  ],
  graph_edges: [
    { source: "n0", target: "n1", probability: 0.91, timeframe: "6 months" },
    { source: "n1", target: "n2", probability: 0.85, timeframe: "18 months" },
    { source: "n2", target: "n3", probability: 0.78, timeframe: "36 months" },
    { source: "n0", target: "n4", probability: 0.88, timeframe: "8 months" },
    { source: "n4", target: "n5", probability: 0.70, timeframe: "24 months" },
  ],
};

export const careerService = {
  async getGoal(userId: string) {
    const { data } = await supabaseAdmin
      .from("career_goals")
      .select("id, target_role, target_industry, target_date, notes, skills_snapshot, cv_id, created_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    return data;
  },

  async upsertGoal(userId: string, dto: UpsertGoalDto) {
    const { data, error } = await supabaseAdmin
      .from("career_goals")
      .upsert({ user_id: userId, ...dto }, { onConflict: "user_id" })
      .select("id, target_role, target_industry, target_date, notes, skills_snapshot, cv_id, updated_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return data;
  },

  async getRoadmap(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("career_roadmap_items")
      .select("id, title, description, status, due_date, order_index, created_at, updated_at")
      .eq("user_id", userId)
      .order("order_index");
    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return data ?? [];
  },

  async addRoadmapItem(userId: string, dto: AddRoadmapItemDto) {
    const { data, error } = await supabaseAdmin
      .from("career_roadmap_items")
      .insert({ user_id: userId, ...dto })
      .select("id, title, description, status, due_date, order_index, created_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return data;
  },

  async updateRoadmapItem(userId: string, itemId: string, dto: UpdateRoadmapItemDto) {
    const { data, error } = await supabaseAdmin
      .from("career_roadmap_items")
      .update(dto)
      .eq("id", itemId)
      .eq("user_id", userId)
      .select("id, title, status, order_index, updated_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    if (!data) throw new AppError("Item not found", HTTP_STATUS.NOT_FOUND);
    return data;
  },

  async deleteRoadmapItem(userId: string, itemId: string) {
    const { error } = await supabaseAdmin
      .from("career_roadmap_items")
      .delete()
      .eq("id", itemId)
      .eq("user_id", userId);
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return { success: true };
  },

  async predictPath(userId: string, dto: PredictPathDto, userSkills: object[]) {
    const result = await callPython(
      `${pythonUrls.moduleB()}/predict`,
      { user_id: userId, skills: userSkills, ...dto },
      MOCK_CAREER_PATH
    ) as typeof MOCK_CAREER_PATH;

    const topPath = (result as any).paths?.[0];
    if (topPath) {
      const firstRole = topPath.transitions?.[0]?.role ?? "your next role";
      notificationService.sendNotification(
        userId,
        "Career Path Prediction Ready",
        `Your top predicted path leads to ${firstRole} with ${Math.round(topPath.probability * 100)}% probability.`,
        "info"
      ).catch(() => {});
    }

    return result;
  },
};
