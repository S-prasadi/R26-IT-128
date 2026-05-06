import { z } from "zod";

export const createCVSchema = z.object({
  title:        z.string().trim().min(1).default("My CV"),
  github_url:   z.string().url().optional(),
  linkedin_url: z.string().url().optional(),
  summary:      z.string().trim().optional(),
});

export const updateCVSchema = z.object({
  title:                    z.string().trim().min(1).optional(),
  github_url:               z.string().url().optional().nullable(),
  linkedin_url:             z.string().url().optional().nullable(),
  summary:                  z.string().trim().optional(),
  ats_score:                z.number().int().min(0).max(100).optional(),
  match_score:              z.number().int().min(0).max(100).optional(),
  bert_skills:              z.array(z.any()).optional(),
  github_verified_skills:   z.array(z.any()).optional(),
  file_url:                 z.string().url().optional(),
});

const cvSectionSchema = z.object({
  section_type: z.enum(["experience", "education", "skills", "projects", "summary"]),
  content:      z.record(z.any()),
  order_index:  z.number().int().min(0).default(0),
});

export const upsertSectionsSchema = z.object({
  sections: z.array(cvSectionSchema),
});

export const analyzeCVSchema = z.object({
  file_url:    z.string().optional(),
  github_url:  z.string().optional(),
});

export type CreateCVDto       = z.infer<typeof createCVSchema>;
export type UpdateCVDto       = z.infer<typeof updateCVSchema>;
export type UpsertSectionsDto = z.infer<typeof upsertSectionsSchema>;
export type AnalyzeCVDto      = z.infer<typeof analyzeCVSchema>;
