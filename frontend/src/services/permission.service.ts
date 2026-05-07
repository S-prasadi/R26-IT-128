import apiClient from "@/lib/axios";
import type { ApiResponse } from "@/types";

export interface Permission {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: string;
}

export const permissionService = {
  getAll: () => apiClient.get<ApiResponse<Permission[]>>("/permissions"),
};
