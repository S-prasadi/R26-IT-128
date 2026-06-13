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
    { skill: "React",      rank: 1, predicted_weekly_demand: 92, current_weekly_demand: 85, velocity: "rising",  change_pct: 8  },
    { skill: "TypeScript", rank: 2, predicted_weekly_demand: 89, current_weekly_demand: 79, velocity: "rising",  change_pct: 12 },
    { skill: "Node.js",    rank: 3, predicted_weekly_demand: 85, current_weekly_demand: 83, velocity: "stable",  change_pct: 2  },
    { skill: "Python",     rank: 4, predicted_weekly_demand: 88, current_weekly_demand: 83, velocity: "rising",  change_pct: 6  },
    { skill: "Docker",     rank: 5, predicted_weekly_demand: 80, current_weekly_demand: 78, velocity: "stable",  change_pct: 3  },
    { skill: "AWS",        rank: 6, predicted_weekly_demand: 78, current_weekly_demand: 81, velocity: "falling", change_pct: -4 },
  ],
  early_warnings: [
    { skill: "Bun.js",    weeks_ahead: 17, correlation: 0.84, interpretation: "Global leads local by 17w" },
    { skill: "LangChain", weeks_ahead: 17, correlation: 0.89, interpretation: "Global leads local by 17w" },
    { skill: "Rust",      weeks_ahead: 22, correlation: 0.78, interpretation: "Global leads local by 22w" },
  ],
  forecast_chart: Array.from({ length: 12 }, (_, i) => ({
    week: `W${i + 1}`,
    React:      75 + Math.round(Math.random() * 20),
    TypeScript: 70 + Math.round(Math.random() * 18),
    Python:     68 + Math.round(Math.random() * 15),
  })),
  matched: false,
  matched_skills: [] as string[],
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

    const warnings = result.early_warnings ?? [];
    if (warnings.length) {
      // Record alerts per user+skill; the unique constraint means the upsert
      // returns only the rows that are new, so re-running the forecast never
      // re-sends the same notification.
      const { data: fresh, error } = await supabaseAdmin
        .from("skill_alert_history")
        .upsert(
          warnings.map((w) => ({ user_id: userId, skill: w.skill, weeks_ahead: w.weeks_ahead })),
          { onConflict: "user_id,skill", ignoreDuplicates: true }
        )
        .select("skill, weeks_ahead");
      if (error) console.error(`[skills] alert dedupe failed: ${error.message}`);

      for (const w of fresh ?? []) {
        notificationService.sendNotification(
          userId,
          `Skill Alert: ${w.skill} trending globally`,
          `${w.skill} is trending globally and typically reaches the Sri Lankan market ~${w.weeks_ahead} weeks later.`,
          "warning"
        ).catch(() => {});
      }
    }

    return result;
  },
};
