import apiClient from "@/lib/axios";
import type { ApiResponse, InterviewSession, InterviewResponse } from "@/types";

export const interviewService = {
  listSessions: () =>
    apiClient.get<ApiResponse<InterviewSession[]>>("/interviews"),

  getSession: (id: string) =>
    apiClient.get<ApiResponse<InterviewSession>>(`/interviews/${id}`),

  createSession: (data: { topic: string; difficulty: number; skills?: string[]; document_text?: string; demo?: boolean; emotion_sensitivity?: number }) =>
    apiClient.post<ApiResponse<InterviewSession>>("/interviews", data),

  endSession: (id: string, data: { overall_score?: number; engagement_score?: number; duration_seconds?: number }) =>
    apiClient.patch<ApiResponse<InterviewSession>>(`/interviews/${id}`, data),

  submitResponse: (sessionId: string, data: { question_id: string; response_text?: string; emotion_data?: object }) =>
    apiClient.post<ApiResponse<InterviewResponse>>(`/interviews/${sessionId}/responses`, data),

  predictEmotion: (frame: string, sensitivity: number) =>
    apiClient.post<ApiResponse<{ face: boolean; interview_state: string; confidence: number; probs: Record<string, number>; bbox: number[] | null }>>(
      "/interviews/predict-emotion",
      { frame, sensitivity }
    ),

  extractDocument: async (file: File): Promise<{ extracted_text: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await apiClient.post<ApiResponse<{ extracted_text: string }>>(
      "/interviews/extract-document",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    return res.data.data;
  },
};
