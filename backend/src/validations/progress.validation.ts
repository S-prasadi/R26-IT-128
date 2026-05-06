import { z } from "zod";

const MODULE_NAMES = ["skill", "career", "cv", "interview"] as const;

export const updateProgressSchema = z.object({
  completion_pct: z.number().int().min(0).max(100),
});

export const achieveMilestoneSchema = z.object({});

export type UpdateProgressDto = z.infer<typeof updateProgressSchema>;
