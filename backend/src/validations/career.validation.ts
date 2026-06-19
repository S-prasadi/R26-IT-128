import { z } from "zod";

export const upsertGoalSchema = z.object({
  target_role:      z.string().trim().min(1),
  target_industry:  z.string().trim().optional(),
  target_date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes:            z.string().trim().optional(),
  skills_snapshot:  z.array(z.object({ skill_id: z.string(), name: z.string(), proficiency_label: z.string() })).optional(),
  cv_id:            z.string().uuid().optional().nullable(),
});

export const addRoadmapItemSchema = z.object({
  title:       z.string().trim().min(1),
  description: z.string().trim().optional(),
  status:      z.enum(["pending", "in_progress", "done"]).default("pending"),
  due_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  order_index: z.number().int().min(0).default(0),
});

export const updateRoadmapItemSchema = z.object({
  title:       z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  status:      z.enum(["pending", "in_progress", "done"]).optional(),
  due_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  order_index: z.number().int().min(0).optional(),
});

export const predictPathSchema = z.object({
  current_role:      z.string().trim().optional(),
  experience_months: z.number().int().min(0).max(600).optional(),
  num_projects:      z.number().int().min(0).max(50).optional(),
  preferences:       z.object({}).passthrough().optional(),
  // Skills the user explicitly enters for this prediction (mirrors the model's
  // own demo UI). When provided, these are used as the base skill set instead of
  // the auto-derived tracked-skills + CV set.
  skills:            z.array(z.string().trim().min(1)).max(50).optional(),
  // What-if simulator: skills to add/remove on top of the real set; when
  // simulate is true the result is not persisted to history.
  add_skills:        z.array(z.string().trim().min(1)).max(20).optional(),
  remove_skills:     z.array(z.string().trim().min(1)).max(50).optional(),
  simulate:          z.boolean().optional(),
});

export const generateRoadmapSchema = z.object({
  path_id: z.string().trim().min(1),
});

export type UpsertGoalDto       = z.infer<typeof upsertGoalSchema>;
export type AddRoadmapItemDto   = z.infer<typeof addRoadmapItemSchema>;
export type UpdateRoadmapItemDto = z.infer<typeof updateRoadmapItemSchema>;
export type PredictPathDto      = z.infer<typeof predictPathSchema>;
export type GenerateRoadmapDto  = z.infer<typeof generateRoadmapSchema>;
