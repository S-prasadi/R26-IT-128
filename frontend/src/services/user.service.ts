import apiClient from "@/lib/axios";
import type { User, ApiResponse } from "@/types";

export const userService = {
  getMe: () => apiClient.get<ApiResponse<User>>("/auth/me"),
  getAll: () => apiClient.get<ApiResponse<User[]>>("/users"),
  getById: (id: string) => apiClient.get<ApiResponse<User>>(`/users/${id}`),
  update: (id: string, data: Partial<User>) =>
    apiClient.patch<ApiResponse<User>>(`/users/${id}`, data),
  delete: (id: string) => apiClient.delete<ApiResponse<null>>(`/users/${id}`),
  create: (data: { full_name: string; email: string; role: string }) =>
    apiClient.post<ApiResponse<User>>("/users", data),
};
