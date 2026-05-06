import { supabaseAdmin } from "../config/supabase";
import { AppError } from "../middlewares/error.middleware";
import { HTTP_STATUS } from "../constants/http";

const MODULE_NAMES = ["skill", "career", "cv", "interview"] as const;
type ModuleName = (typeof MODULE_NAMES)[number];

const DEFAULT_MILESTONES = [
  { title: "Add your first skill",          module_name: "skill",     description: "Start building your skill profile" },
  { title: "Run your first skill forecast", module_name: "skill",     description: "See 3-month skill demand predictions" },
  { title: "Set a career goal",             module_name: "career",    description: "Define your target role and industry" },
  { title: "Generate career path",          module_name: "career",    description: "Explore your predicted career trajectory" },
  { title: "Create your first CV",          module_name: "cv",        description: "Build your CV in the platform" },
  { title: "Analyse your CV",               module_name: "cv",        description: "Get ATS score and job match results" },
  { title: "Complete an interview session", module_name: "interview", description: "Finish your first mock interview" },
  { title: "Reach 80% overall progress",    module_name: "platform",  description: "Complete all four core modules" },
];

export const progressService = {
  async getModuleProgress(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("progress_modules")
      .select("id, module_name, completion_pct, last_activity_at, updated_at")
      .eq("user_id", userId);
    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);

    const existing = new Map((data ?? []).map((r) => [r.module_name as string, r]));

    const toInsert = MODULE_NAMES.filter((m) => !existing.has(m)).map((m) => ({
      user_id: userId,
      module_name: m,
      completion_pct: 0,
    }));

    if (toInsert.length > 0) {
      const { data: inserted } = await supabaseAdmin
        .from("progress_modules")
        .insert(toInsert)
        .select("id, module_name, completion_pct, last_activity_at, updated_at");
      for (const row of inserted ?? []) existing.set(row.module_name as string, row);
    }

    return MODULE_NAMES.map((m) => existing.get(m)!);
  },

  async updateProgress(userId: string, moduleName: ModuleName, completionPct: number) {
    const { data, error } = await supabaseAdmin
      .from("progress_modules")
      .upsert(
        { user_id: userId, module_name: moduleName, completion_pct: completionPct, last_activity_at: new Date().toISOString() },
        { onConflict: "user_id,module_name" }
      )
      .select("id, module_name, completion_pct, last_activity_at, updated_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    return data;
  },

  async getMilestones(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("milestones")
      .select("id, title, description, module_name, achieved_at, created_at")
      .eq("user_id", userId)
      .order("created_at");
    if (error) throw new AppError(error.message, HTTP_STATUS.INTERNAL_SERVER_ERROR);

    if ((data ?? []).length === 0) {
      const { data: seeded } = await supabaseAdmin
        .from("milestones")
        .insert(DEFAULT_MILESTONES.map((m) => ({ ...m, user_id: userId })))
        .select("id, title, description, module_name, achieved_at, created_at");
      return seeded ?? [];
    }
    return data ?? [];
  },

  async achieveMilestone(userId: string, milestoneId: string) {
    const { data, error } = await supabaseAdmin
      .from("milestones")
      .update({ achieved_at: new Date().toISOString() })
      .eq("id", milestoneId)
      .eq("user_id", userId)
      .select("id, title, achieved_at")
      .single();
    if (error) throw new AppError(error.message, HTTP_STATUS.BAD_REQUEST);
    if (!data) throw new AppError("Milestone not found", HTTP_STATUS.NOT_FOUND);
    return data;
  },
};
