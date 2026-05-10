import apiClient from "@/lib/axios";
import type { ApiResponse } from "@/types";

type GitHubStatus = { connected: boolean; github_username?: string; connected_at?: string };
type VerifyResult = { updated: number; github_username: string };

export const githubService = {
  getAuthUrl: () =>
    apiClient.get<ApiResponse<{ url: string }>>("/github/auth-url"),

  getStatus: () =>
    apiClient.get<ApiResponse<GitHubStatus>>("/github/status"),

  disconnect: () =>
    apiClient.delete<ApiResponse<{ success: boolean }>>("/github/disconnect"),

  verifySkills: () =>
    apiClient.post<ApiResponse<VerifyResult>>("/github/verify-skills"),
};
