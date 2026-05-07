import apiClient from "@/lib/axios";
import type { Role, ApiResponse } from "@/types";

interface RolePayload {
  name: string;
  description: string;
  permissions: string[];
}

export const roleService = {
  getAll:  ()                                       => apiClient.get<ApiResponse<Role[]>>("/roles"),
  create:  (data: RolePayload)                      => apiClient.post<ApiResponse<Role>>("/roles", data),
  update:  (id: string, data: Partial<RolePayload>) => apiClient.patch<ApiResponse<Role>>(`/roles/${id}`, data),
  delete:  (id: string)                             => apiClient.delete<ApiResponse<null>>(`/roles/${id}`),
};
