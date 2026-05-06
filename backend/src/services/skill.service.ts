import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";
import { callPython, pythonUrls } from "./python.service";
import { notificationService } from "./notification.service";
import type {
  AddUserSkillDto,
  UpdateUserSkillDto,
  LogAssessmentDto,
} from "../validations/skill.validation";

const MOCK_FORECAST = {
  trending: [
    { skill: "React",      current_rank: 1, forecast_3m: 92, velocity: "rising",  change_pct: 8  },
    { skill: "TypeScript", current_rank: 2, forecast_3m: 89, velocity: "rising",  change_pct: 12 },
    { skill: "Node.js",    current_rank: 3, forecast_3m: 85, velocity: "stable",  change_pct: 2  },
    { skill: "Python",     current_rank: 4, forecast_3m: 88, velocity: "rising",  change_pct: 6  },
    { skill: "Docker",     current_rank: 5, forecast_3m: 80, velocity: "stable",  change_pct: 3  },
    { skill: "AWS",        current_rank: 6, forecast_3m: 78, velocity: "falling", change_pct: -4 },
  ],
  early_warnings: [
    { skill: "Bun.js",     global_trend_date: "2026-02-01", expected_local_date: "2026-06-01", weeks_ahead: 17 },
    { skill: "LangChain",  global_trend_date: "2026-01-15", expected_local_date: "2026-05-15", weeks_ahead: 17 },
    { skill: "Rust",       global_trend_date: "2025-11-01", expected_local_date: "2026-04-01", weeks_ahead: 22 },
  ],
  forecast_chart: Array.from({ length: 12 }, (_, i) => ({
    week: `W${i + 1}`,
    React:      75 + Math.round(Math.random() * 20),
    TypeScript: 70 + Math.round(Math.random() * 18),
    Python:     68 + Math.round(Math.random() * 15),
  })),
};

export const skillService = {
  async listMasterSkills() {
    const { data, error } = await supabaseAdmin
      .from("skills")
      .select("id, name, category, description")
      .order("category")
      .order("name");
    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return data ?? [];
  },

  async getUserSkills(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("user_skills")
      .select("id, skill_id, proficiency_level, proficiency_label, github_verified, confidence_score, created_at, updated_at, skills(id, name, category, description)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return data ?? [];
  },

  async addUserSkill(userId: string, dto: AddUserSkillDto) {
    const { data, error } = await supabaseAdmin
      .from("user_skills")
      .insert({ user_id: userId, ...dto })
      .select("id, skill_id, proficiency_level, proficiency_label, github_verified, confidence_score, created_at, updated_at, skills(id, name, category)")
      .single();
    if (error) {
      if (error.code === "23505") throw new AppError("Skill already added", HTTP_STATUS.CONFLICT);
      throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    }
    return data;
  },

  async updateUserSkill(userId: string, userSkillId: string, dto: UpdateUserSkillDto) {
    const { data, error } = await supabaseAdmin
      .from("user_skills")
      .update(dto)
      .eq("id", userSkillId)
      .eq("user_id", userId)
      .select("id, skill_id, proficiency_level, proficiency_label, github_verified, confidence_score, updated_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    if (!data) throw new AppError("Skill not found", HTTP_STATUS.NOT_FOUND);
    return data;
  },

  async deleteUserSkill(userId: string, userSkillId: string) {
    const { error } = await supabaseAdmin
      .from("user_skills")
      .delete()
      .eq("id", userSkillId)
      .eq("user_id", userId);
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return { success: true };
  },

  async getAssessments(userId: string, skillId?: string) {
    let q = supabaseAdmin
      .from("skill_assessments")
      .select("id, skill_id, score, notes, assessed_at, skills(name, category)")
      .eq("user_id", userId)
      .order("assessed_at", { ascending: false });
    if (skillId) q = q.eq("skill_id", skillId);
    const { data, error } = await q;
    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    return data ?? [];
  },

  async logAssessment(userId: string, skillId: string, dto: LogAssessmentDto) {
    const { data, error } = await supabaseAdmin
      .from("skill_assessments")
      .insert({ user_id: userId, skill_id: skillId, ...dto })
      .select("id, skill_id, score, notes, assessed_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return data;
  },

  async runForecast(userId: string, skills: string[]) {
    const result = await callPython(
      `${pythonUrls.moduleA()}/forecast`,
      { user_id: userId, skills },
      MOCK_FORECAST
    ) as typeof MOCK_FORECAST;

    const warnings = (result as any).early_warnings ?? [];
    for (const w of warnings) {
      notificationService.sendNotification(
        userId,
        `Skill Alert: ${w.skill} trending globally`,
        `${w.skill} is trending globally and expected to reach the Sri Lankan market in ~${w.weeks_ahead} weeks.`,
        "warning"
      ).catch(() => {});
    }

    return result;
  },
};
