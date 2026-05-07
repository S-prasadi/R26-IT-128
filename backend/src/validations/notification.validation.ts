import { z } from "zod";

export const updatePreferencesSchema = z.object({
  skill_alerts:        z.boolean().optional(),
  career_updates:      z.boolean().optional(),
  cv_feedback:         z.boolean().optional(),
  interview_reminders: z.boolean().optional(),
  system_notices:      z.boolean().optional(),
});

export const saveFCMTokenSchema = z.object({
  token:       z.string().min(1),
  device_name: z.string().trim().optional(),
});

export type UpdatePreferencesDto = z.infer<typeof updatePreferencesSchema>;
export type SaveFCMTokenDto      = z.infer<typeof saveFCMTokenSchema>;
