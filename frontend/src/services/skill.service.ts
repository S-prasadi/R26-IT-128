import apiClient from "@/lib/axios";
import type { ApiResponse, Skill, UserSkill, SkillAssessment, SkillForecast } from "@/types";

export const skillService = {
  listMaster: () =>
    apiClient.get<ApiResponse<Skill[]>>("/skills"),

  getUserSkills: () =>
    apiClient.get<ApiResponse<UserSkill[]>>("/skills/user"),

  addUserSkill: (data: { skill_id: string; proficiency_level: number; proficiency_label: string }) =>
    apiClient.post<ApiResponse<UserSkill>>("/skills/user", data),

  updateUserSkill: (userSkillId: string, data: Partial<{ proficiency_level: number; proficiency_label: string }>) =>
    apiClient.patch<ApiResponse<UserSkill>>(`/skills/user/${userSkillId}`, data),

  deleteUserSkill: (userSkillId: string) =>
    apiClient.delete<ApiResponse<{ success: boolean }>>(`/skills/user/${userSkillId}`),

  getAssessments: (skillId?: string) =>
    apiClient.get<ApiResponse<SkillAssessment[]>>("/skills/assessments", { params: skillId ? { skill_id: skillId } : {} }),

  logAssessment: (skillId: string, data: { score: number; notes?: string }) =>
    apiClient.post<ApiResponse<SkillAssessment>>(`/skills/user/${skillId}/assess`, data),

  runForecast: (skills?: string[]) =>
    apiClient.post<ApiResponse<SkillForecast>>("/skills/forecast", { skills: skills ?? [] }),
};
