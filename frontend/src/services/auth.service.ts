import apiClient from "@/lib/axios";
import type { User, ApiResponse } from "@/types";

interface LoginPayload {
  email: string;
  password: string;
}

interface RegisterPayload extends LoginPayload {
  full_name: string;
}

interface AuthResponse {
  user: User;
  session: {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
    token_type: string;
  } | null;
}

export const authService = {
  login: (data: LoginPayload) =>
    apiClient.post<ApiResponse<AuthResponse>>("/auth/login", data),
  register: (data: RegisterPayload) =>
    apiClient.post<ApiResponse<AuthResponse>>("/auth/register", data),
  logout: () => apiClient.post("/auth/logout"),
};
