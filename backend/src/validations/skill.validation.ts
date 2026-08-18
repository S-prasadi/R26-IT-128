import { z } from "zod";

export const addUserSkillSchema = z.object({
  skill_id: z.string().uuid(),
  proficiency_level: z.number().int().min(1).max(5).default(1),
  proficiency_label: z.enum(["Beginner", "Intermediate", "Advanced"]).default("Beginner"),
});

// Client-editable fields only. `github_verified` and `confidence_score` are
// deliberately NOT accepted here: they represent evidence derived from the
// GitHub API, and letting a client PATCH them would let anyone self-assert a
// verification badge they never earned. Those fields are written exclusively
// by githubService.verifySkills()/disconnect(), which go straight to the DB.
export const updateUserSkillSchema = z.object({
  proficiency_level: z.number().int().min(1).max(5).optional(),
  proficiency_label: z.enum(["Beginner", "Intermediate", "Advanced"]).optional(),
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
