import apiClient from "@/lib/axios";
import type { ApiResponse, CareerGoal, GoalSkillSnapshot, RoadmapItem, CareerPrediction } from "@/types";

export const careerService = {
  getGoal: () =>
    apiClient.get<ApiResponse<CareerGoal | null>>("/career/goal"),

  upsertGoal: (data: { target_role: string; target_industry?: string; target_date?: string; notes?: string; skills_snapshot?: GoalSkillSnapshot[]; cv_id?: string | null }) =>
    apiClient.post<ApiResponse<CareerGoal>>("/career/goal", data),

  getRoadmap: () =>
    apiClient.get<ApiResponse<RoadmapItem[]>>("/career/roadmap"),

  addRoadmapItem: (data: { title: string; description?: string; status?: string; due_date?: string; order_index?: number }) =>
    apiClient.post<ApiResponse<RoadmapItem>>("/career/roadmap", data),

  updateRoadmapItem: (id: string, data: Partial<{ title: string; description: string; status: string; order_index: number }>) =>
    apiClient.patch<ApiResponse<RoadmapItem>>(`/career/roadmap/${id}`, data),

  deleteRoadmapItem: (id: string) =>
    apiClient.delete<ApiResponse<{ success: boolean }>>(`/career/roadmap/${id}`),

  predictPath: (data?: { current_role?: string; preferences?: object }) =>
    apiClient.post<ApiResponse<CareerPrediction>>("/career/predict", data ?? {}),
};
