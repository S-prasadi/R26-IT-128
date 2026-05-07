import { z } from "zod";

export const upsertGoalSchema = z.object({
  target_role:     z.string().trim().min(1),
  target_industry: z.string().trim().optional(),
  target_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes:           z.string().trim().optional(),
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
  current_role:  z.string().trim().optional(),
  preferences:   z.object({}).passthrough().optional(),
});

export type UpsertGoalDto       = z.infer<typeof upsertGoalSchema>;
export type AddRoadmapItemDto   = z.infer<typeof addRoadmapItemSchema>;
export type UpdateRoadmapItemDto = z.infer<typeof updateRoadmapItemSchema>;
export type PredictPathDto      = z.infer<typeof predictPathSchema>;
