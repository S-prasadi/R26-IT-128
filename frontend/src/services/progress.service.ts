import apiClient from "@/lib/axios";
import type { ApiResponse, ProgressModule, Milestone } from "@/types";

export const progressService = {
  getModuleProgress: () =>
    apiClient.get<ApiResponse<ProgressModule[]>>("/progress"),

  updateProgress: (module: "skill" | "career" | "cv" | "interview", completion_pct: number) =>
    apiClient.patch<ApiResponse<ProgressModule>>(`/progress/${module}`, { completion_pct }),

  getMilestones: () =>
    apiClient.get<ApiResponse<Milestone[]>>("/progress/milestones"),

  achieveMilestone: (id: string) =>
    apiClient.patch<ApiResponse<Milestone>>(`/progress/milestones/${id}`, {}),
};
