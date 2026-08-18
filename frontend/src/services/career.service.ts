import apiClient from "@/lib/axios";
import type { ApiResponse, CareerGoal, GoalSkillSnapshot, RoadmapItem, CareerPrediction, CareerPredictionSnapshot, ModelStatus } from "@/types";

export const careerService = {
  getGoal: () =>
    apiClient.get<ApiResponse<CareerGoal | null>>("/career/goal"),

  upsertGoal: (data: { target_role: string; target_industry?: string; target_date?: string; notes?: string; skills_snapshot?: GoalSkillSnapshot[]; cv_id?: string | null }) =>
    apiClient.post<ApiResponse<CareerGoal>>("/career/goal", data),

  deleteGoal: () =>
    apiClient.delete<ApiResponse<{ success: boolean }>>("/career/goal"),

  getRoadmap: () =>
    apiClient.get<ApiResponse<RoadmapItem[]>>("/career/roadmap"),

  addRoadmapItem: (data: { title: string; description?: string; status?: string; due_date?: string; order_index?: number }) =>
    apiClient.post<ApiResponse<RoadmapItem>>("/career/roadmap", data),

  updateRoadmapItem: (id: string, data: Partial<{ title: string; description: string; status: string; order_index: number }>) =>
    apiClient.patch<ApiResponse<RoadmapItem>>(`/career/roadmap/${id}`, data),

  deleteRoadmapItem: (id: string) =>
    apiClient.delete<ApiResponse<{ success: boolean }>>(`/career/roadmap/${id}`),

  predictPath: (data?: { current_role?: string; experience_months?: number; num_projects?: number; preferences?: object; skills?: string[]; add_skills?: string[]; remove_skills?: string[]; simulate?: boolean }) =>
    apiClient.post<ApiResponse<CareerPrediction>>("/career/predict", data ?? {}),

  getModelStatus: () =>
    apiClient.get<ApiResponse<ModelStatus>>("/career/model-status"),

  getPredictions: () =>
    apiClient.get<ApiResponse<CareerPredictionSnapshot[]>>("/career/predictions"),

  deletePrediction: (id: string) =>
    apiClient.delete<ApiResponse<{ success: boolean }>>(`/career/predictions/${id}`),

  generateRoadmap: (path_id: string, prediction_id?: string | null) =>
    apiClient.post<ApiResponse<{ created: number; items: RoadmapItem[] }>>("/career/roadmap/generate", { path_id, ...(prediction_id ? { prediction_id } : {}) }),
};
