import apiClient from "@/lib/axios";
import type { ApiResponse, CV, CVSection, CVJobMatch, CVSuggestion, CVAnalysisResult, CVSectionContent, CVProjectVerification, CVJobPost } from "@/types";

type CVWithDetails = CV & { sections: CVSection[]; job_matches: CVJobMatch[]; suggestions: CVSuggestion[]; job_posts: CVJobPost[] };

export const cvService = {
  listCVs: () =>
    apiClient.get<ApiResponse<CV[]>>("/cv"),

  getCV: (id: string) =>
    apiClient.get<ApiResponse<CVWithDetails>>(`/cv/${id}`),

  createCV: (data: { title?: string; github_url?: string; linkedin_url?: string; summary?: string }) =>
    apiClient.post<ApiResponse<CV>>("/cv", data),

  updateCV: (id: string, data: Partial<CV>) =>
    apiClient.patch<ApiResponse<CV>>(`/cv/${id}`, data),

  deleteCV: (id: string) =>
    apiClient.delete<ApiResponse<{ success: boolean }>>(`/cv/${id}`),

  upsertSections: (id: string, sections: Omit<CVSection, "id">[]) =>
    apiClient.put<ApiResponse<CVSection[]>>(`/cv/${id}/sections`, { sections }),

  analyzeCV: (id: string, data?: { file_url?: string; github_url?: string }) =>
    apiClient.post<ApiResponse<CVAnalysisResult>>(`/cv/${id}/analyze`, data ?? {}),

  uploadCV: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient.post<ApiResponse<{ file_url: string; extracted_text: string; sections: Partial<CVSectionContent>; links: { github?: string; linkedin?: string; portfolio?: string; email?: string; phone?: string }; extraction?: { quality?: number; characters?: number; pages?: Array<{ page: number; method: string; confidence: number; quality: number }> } }>>(
      `/cv/${id}/upload`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  },

  verifyProjects: (id: string) =>
    apiClient.post<ApiResponse<CVProjectVerification>>(`/cv/${id}/verify-projects`),

  attachJobPost: (id: string, data: { title?: string; job_text?: string; file?: File }) => {
    if (data.file) {
      const form = new FormData();
      form.append("file", data.file);
      if (data.title) form.append("title", data.title);
      return apiClient.post<ApiResponse<CVJobPost>>(`/cv/${id}/job-post`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    }
    return apiClient.post<ApiResponse<CVJobPost>>(`/cv/${id}/job-post`, { title: data.title, job_text: data.job_text });
  },

  deleteJobPost: (id: string, jobPostId: string) =>
    apiClient.delete<ApiResponse<{ success: boolean }>>(`/cv/${id}/job-post/${jobPostId}`),
};
