import { z } from "zod";

export const addUserSkillSchema = z.object({
  skill_id: z.string().uuid(),
  proficiency_level: z.number().int().min(1).max(5).default(1),
  proficiency_label: z.enum(["Beginner", "Intermediate", "Advanced"]).default("Beginner"),
});

export const updateUserSkillSchema = z.object({
  proficiency_level: z.number().int().min(1).max(5).optional(),
  proficiency_label: z.enum(["Beginner", "Intermediate", "Advanced"]).optional(),
  github_verified: z.boolean().optional(),
  confidence_score: z.number().min(0).max(1).optional(),
});

export const logAssessmentSchema = z.object({
  score: z.number().min(0).max(100),
  notes: z.string().trim().optional(),
});

export const runForecastSchema = z.object({
  skills: z.array(z.string()).optional(),
});

export type AddUserSkillDto   = z.infer<typeof addUserSkillSchema>;
export type UpdateUserSkillDto = z.infer<typeof updateUserSkillSchema>;
export type LogAssessmentDto  = z.infer<typeof logAssessmentSchema>;
export type RunForecastDto    = z.infer<typeof runForecastSchema>;
