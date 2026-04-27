import apiClient from "@/lib/axios";
import type { User, ApiResponse } from "@/types";

export const userService = {
  getMe: () => apiClient.get<ApiResponse<User>>("/users/me"),
  getAll: () => apiClient.get<ApiResponse<User[]>>("/users"),
  getById: (id: string) => apiClient.get<ApiResponse<User>>(`/users/${id}`),
  update: (id: string, data: Partial<User>) =>
    apiClient.put<ApiResponse<User>>(`/users/${id}`, data),
  delete: (id: string) => apiClient.delete<ApiResponse<null>>(`/users/${id}`),
};
