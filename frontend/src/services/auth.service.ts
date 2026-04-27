import apiClient from "@/lib/axios";
import type { User, ApiResponse } from "@/types";

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterPayload extends LoginPayload {
  name: string;
}

interface AuthResponse {
  user: User;
  token: string;
}

export const authService = {
  login: (data: LoginPayload) =>
    apiClient.post<ApiResponse<AuthResponse>>("/auth/login", data),
  register: (data: RegisterPayload) =>
    apiClient.post<ApiResponse<AuthResponse>>("/auth/register", data),
  logout: () => apiClient.post("/auth/logout"),
};
