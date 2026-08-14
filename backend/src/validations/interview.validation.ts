import { z } from "zod";

const DOCUMENT_CONTEXT_LIMIT = 10000;

export const createSessionSchema = z.object({
  topic:                z.string().trim().min(1),
  difficulty:           z.number().int().min(1).max(5).default(3),
  skills:               z.array(z.string()).optional(),
  document_text:        z.string().transform((value) => value.slice(0, DOCUMENT_CONTEXT_LIMIT)).optional(),
  demo:                 z.boolean().optional().default(false),
  emotion_sensitivity:  z.number().int().min(0).max(100).optional().default(50),
});

export const endSessionSchema = z.object({
  overall_score:    z.number().min(0).max(100).optional(),
  engagement_score: z.number().min(0).max(100).optional(),
  duration_seconds: z.number().int().min(0).optional(),
});

export const submitResponseSchema = z.object({
  question_id:   z.string().uuid(),
  response_text: z.string().trim().optional(),
  emotion_data:  z.record(z.any()).optional(),
});

export const predictEmotionSchema = z.object({
  frame:       z.string().min(1),  // base64-encoded JPEG webcam frame
  sensitivity: z.number().int().min(0).max(100).optional().default(50),
});

export type CreateSessionDto   = z.infer<typeof createSessionSchema>;
export type EndSessionDto      = z.infer<typeof endSessionSchema>;
export type SubmitResponseDto  = z.infer<typeof submitResponseSchema>;
export type PredictEmotionDto  = z.infer<typeof predictEmotionSchema>;
